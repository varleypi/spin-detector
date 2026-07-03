/**
 * Shared bias-score display helpers.
 *
 * The DB and pipeline store scores on a 0–10 scale; the UI presents them on a
 * centered −5 (Far Left) … 0 (Center) … +5 (Far Right) scale. Keep this the
 * single source of truth so the app, the per-outlet SEO pages, and the OG
 * images all label scores identically.
 */

/** 0–10 → −5..+5 numeric (one decimal). */
export function toDisplay(score: number): number {
  return Math.round((score - 5) * 10) / 10
}

/** 0–10 → "+1.2" / "−0.8" style string. */
export function fmtScore(score: number): string {
  const d = toDisplay(score)
  return (d >= 0 ? '+' : '') + d.toFixed(1)
}

/** Human label for a 0–10 score, matching the /about tiers. */
export function biasLabel(score: number): string {
  const d = toDisplay(score)
  if (d <= -3) return 'Far Left'
  if (d <= -1) return 'Left'
  if (d < 1) return 'Center'
  if (d < 3) return 'Right'
  return 'Far Right'
}

/** A softer "leans …" label for headlines/OG (uses expected range midpoint etc.). */
export function leanLabel(score: number): string {
  const d = toDisplay(score)
  if (d <= -3) return 'Leans Far Left'
  if (d <= -1) return 'Leans Left'
  if (d < 1) return 'Centrist'
  if (d < 3) return 'Leans Right'
  return 'Leans Far Right'
}

/** Brand color for a 0–10 score along the spectrum. */
export function scoreColor(score: number): string {
  const d = toDisplay(score)
  if (d <= -3) return '#2563eb'
  if (d <= -1) return '#3b82f6'
  if (d < 1) return '#8b5cf6'
  if (d < 3) return '#ef4444'
  return '#991b1b'
}
