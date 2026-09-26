import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/xDb'
import {
  analyzeText,
  configuredProviders,
  MAX_INPUT_CHARS,
  MIN_INPUT_CHARS,
} from '@/lib/spinCheck'

export const dynamic = 'force-dynamic'
// Two model calls in parallel; Claude with thinking on can take a while.
export const maxDuration = 60

// ── Rate limiting ────────────────────────────────────────────────────────────
//
// Every request spends real money at two vendors, and the endpoint is public,
// so it needs a ceiling. Hits are logged in Supabase (spin_check_hits) so every
// serverless instance shares one window, and a global daily cap bounds total
// spend even when requests come from many IPs. If Supabase is unavailable or the
// table hasn't been created yet, it falls back to a per-instance in-memory
// window, whose true limit is (instances × these numbers).

const HOURLY_LIMIT = Number(process.env.SPIN_CHECK_HOURLY_LIMIT) || 10
const DAILY_LIMIT = Number(process.env.SPIN_CHECK_DAILY_LIMIT) || 40
const GLOBAL_DAILY_LIMIT = Number(process.env.SPIN_CHECK_GLOBAL_DAILY_LIMIT) || 300
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface LimitDecision {
  allowed: boolean
  retryAfterSec: number
  global?: boolean
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

/** Apply the per-client windows to that client's hit times in the last day, oldest first. */
function decide(recent: number[], now: number): LimitDecision {
  const lastHour = recent.filter((t) => now - t < HOUR_MS)
  const overHour = lastHour.length >= HOURLY_LIMIT
  const overDay = recent.length >= DAILY_LIMIT
  if (!overHour && !overDay) return { allowed: true, retryAfterSec: 0 }

  const oldest = overHour ? lastHour[0] : recent[0]
  const window = overHour ? HOUR_MS : DAY_MS
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + window - now) / 1000)) }
}

/** Shared limiter backed by Supabase. Returns null when it can't be used. */
async function sharedRateLimit(key: string): Promise<LimitDecision | null> {
  const supabase = getServiceClient()
  if (!supabase) return null

  try {
    const now = Date.now()
    const dayAgo = new Date(now - DAY_MS).toISOString()
    const ipHash = createHash('sha256').update(key).digest('hex')

    const [globalRes, clientRes] = await Promise.all([
      supabase.from('spin_check_hits').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
      supabase
        .from('spin_check_hits')
        .select('created_at')
        .eq('ip_hash', ipHash)
        .gte('created_at', dayAgo)
        .order('created_at', { ascending: true }),
    ])
    if (globalRes.error) throw globalRes.error
    if (clientRes.error) throw clientRes.error

    if ((globalRes.count ?? 0) >= GLOBAL_DAILY_LIMIT) {
      return { allowed: false, retryAfterSec: 3600, global: true }
    }

    const recent = (clientRes.data as { created_at: string }[]).map((r) => Date.parse(r.created_at))
    const decision = decide(recent, now)
    if (!decision.allowed) return decision

    const { error } = await supabase.from('spin_check_hits').insert({ ip_hash: ipHash })
    if (error) throw error
    return decision
  } catch (err) {
    console.warn('Spin Check — shared rate limit unavailable, using in-memory:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Request timestamps per client, newest last. */
const hits = new Map<string, number[]>()

/**
 * Per-instance fallback. Prunes as it goes, so the map only ever holds the
 * last day of activity for clients that are still active.
 */
function memoryRateLimit(key: string): LimitDecision {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < DAY_MS)
  const decision = decide(recent, now)

  if (decision.allowed) recent.push(now)
  hits.set(key, recent)

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (!v.length || now - v[v.length - 1] > DAY_MS) hits.delete(k)
    })
  }

  return decision
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** GET — which scorers this deployment can run. Used to sanity-check a deploy. */
export async function GET() {
  return NextResponse.json({ providers: configuredProviders(), maxChars: MAX_INPUT_CHARS })
}

/**
 * POST /api/spin-check — score pasted text with Claude and Grok.
 *
 * Body: { text: string, source?: string }
 * Always 200 with per-model results unless the request itself is bad or capped;
 * a single model failing is reported inside the payload, not as an HTTP error.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { text, source } = (body ?? {}) as { text?: unknown; source?: unknown }

  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'Provide a "text" string to analyse.' }, { status: 400 })
  }

  const trimmed = text.trim()
  if (trimmed.length < MIN_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Paste at least ${MIN_INPUT_CHARS} characters — there is nothing to score yet.` },
      { status: 400 },
    )
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Text is too long (${trimmed.length} characters). The limit is ${MAX_INPUT_CHARS}.` },
      { status: 400 },
    )
  }

  const key = clientKey(req)
  const { allowed, retryAfterSec, global } = (await sharedRateLimit(key)) ?? memoryRateLimit(key)
  if (!allowed) {
    const mins = Math.ceil(retryAfterSec / 60)
    const error = global
      ? 'Spin Check has reached its daily capacity. Please try again later.'
      : `Rate limit reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
    return NextResponse.json(
      { error },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const providers = configuredProviders()
  if (!providers.claude && !providers.grok) {
    return NextResponse.json({ error: 'No scoring models are configured.' }, { status: 503 })
  }

  const result = await analyzeText(trimmed, typeof source === 'string' ? source : undefined)
  return NextResponse.json({ ...result, checkedAt: new Date().toISOString() })
}
