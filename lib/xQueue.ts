/**
 * Shared helpers for the X approval queue (admin UI + post route).
 *
 * Score conventions match pipeline/social.js exactly: bias is stored 0–10 and
 * displayed as (score − 5) on the −5 → +5 scale, so an X post never disagrees
 * with the website.
 */

export type XCandidate = {
  id: string
  tweet_id: string
  tweet_url: string
  author_handle: string
  author_name: string | null
  author_type: string
  author_followers: number | null
  text: string
  likes: number
  reposts: number
  replies: number
  age_minutes: number | null
  velocity: number | null
  prefilter_score: number | null
  prefilter_reason: string | null
  bias_score: number
  bias_signals: string[]
  rationale: string | null
  score_model: string | null
  status: string
  created_at: string
  /** Set once the pipeline has composed a reply (tap mode). */
  composed_text?: string | null
  reply_format?: string | null
  cluster_id?: string | null
  outlet_id?: string | null
}

export const MAX_TWEET = 280
export const SITE_URL = 'https://www.spindetector.com'

/** 0–10 → "+1.2" / "−0.8" (matches social.js fmt) */
export function fmtScore(score: number): string {
  const d = Math.round((score - 5) * 10) / 10
  return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1)
}

/** 0–10 → lean label (matches social.js label) */
export function leanLabel(score: number): string {
  const d = score - 5
  if (d <= -3) return 'Far Left'
  if (d <= -1) return 'Left'
  if (d < 1) return 'Center'
  if (d < 3) return 'Right'
  return 'Far Right'
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Compose the post. The SCORE LEADS — it must be readable without leaving X.
 * No link in the body (X throttles reach on posts with external links); the
 * caller may add the link as a self-reply instead.
 *
 * Phase 1 is text-only; the score-card image lands in Phase 2.
 */
export function composePost(c: {
  author_handle: string
  bias_score: number
  rationale: string | null
  text: string
}): string {
  const score = fmtScore(c.bias_score)
  const lean = leanLabel(c.bias_score)
  const head = `Spin score: ${score} (${lean})`
  const scale = 'Our scale: −5 far left ↔ +5 far right'
  const why = (c.rationale || '').trim()

  // Quote the headline being rated so the post stands alone, then the verdict.
  const fixed = `${head}\n\n@${c.author_handle}: "__H__"\n\n${why}\n\n${scale}`
  const room = MAX_TWEET - (fixed.length - '__H__'.length)
  return fixed.replace('__H__', truncate(c.text.replace(/\s+/g, ' ').trim(), Math.max(20, room)))
}

/** Constant-time-ish comparison so the secret can't be guessed by timing. */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Validate the admin secret from a request. Accepts either the
 * `x-admin-secret` header or the `sd_admin` cookie.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.X_QUEUE_ADMIN_SECRET
  if (!expected) return false // fail closed when unconfigured
  const header = req.headers.get('x-admin-secret')
  if (header && secretsMatch(header, expected)) return true
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.match(/(?:^|;\s*)sd_admin=([^;]+)/)
  if (m) {
    try {
      return secretsMatch(decodeURIComponent(m[1]), expected)
    } catch {
      return false
    }
  }
  return false
}
