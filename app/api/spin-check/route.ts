import { NextResponse } from 'next/server'
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
// so it needs a ceiling. This is a per-instance in-memory counter: on Vercel
// each serverless instance keeps its own window, so the true global limit is
// (instances × these numbers) rather than exactly these numbers. That is fine
// for the job it does — stopping one person hammering the box — and it costs no
// database round-trip on the happy path. If it ever needs to be exact, move the
// counters into Supabase alongside the X pipeline's tables.

const HOURLY_LIMIT = Number(process.env.SPIN_CHECK_HOURLY_LIMIT) || 10
const DAILY_LIMIT = Number(process.env.SPIN_CHECK_DAILY_LIMIT) || 40
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Request timestamps per client, newest last. */
const hits = new Map<string, number[]>()

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

/**
 * Record a hit and report whether it is allowed. Prunes as it goes, so the map
 * only ever holds the last day of activity for clients that are still active.
 */
function rateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < DAY_MS)

  const lastHour = recent.filter((t) => now - t < HOUR_MS)
  const overHour = lastHour.length >= HOURLY_LIMIT
  const overDay = recent.length >= DAILY_LIMIT

  if (overHour || overDay) {
    hits.set(key, recent)
    const oldest = overHour ? lastHour[0] : recent[0]
    const window = overHour ? HOUR_MS : DAY_MS
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + window - now) / 1000)) }
  }

  recent.push(now)
  hits.set(key, recent)

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (!v.length || now - v[v.length - 1] > DAY_MS) hits.delete(k)
    })
  }

  return { allowed: true, retryAfterSec: 0 }
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

  const { allowed, retryAfterSec } = rateLimit(clientKey(req))
  if (!allowed) {
    const mins = Math.ceil(retryAfterSec / 60)
    return NextResponse.json(
      { error: `Rate limit reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` },
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
