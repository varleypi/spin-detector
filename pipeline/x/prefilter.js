/**
 * Stage 2 — Virality pre-filter. Pure JS, no model call.
 *
 * This used to be a grok-3-mini call asking "is this newsy and is it climbing?".
 * It was removed for two reasons:
 *   1. Cost/latency — it was a whole round-trip per run to re-derive judgements
 *      the discovery prompt already applied, and in reply mode every second
 *      between a post going up and our reply landing costs reach.
 *   2. It was scoring the wrong thing. The signals that matter (engagement per
 *      minute, author reach, does the text carry a checkable claim) are all
 *      numeric or lexical. A model adds noise, not accuracy.
 *
 * Keeps the same {survivors, dropped} contract so the orchestrator is unchanged.
 */

const CAP = () => Number(process.env.DAILY_CANDIDATE_CAP) || 6
const FLOOR = () => Number(process.env.VIRALITY_FLOOR) || 0.35

// Posts we can't usefully rate. A live-blog pointer or a bare "WATCH:" teaser
// has no claim to score — replying with a bias number would be nonsense.
const NON_CLAIM = [
  /^watch\b/i,
  /^live\b/i,
  /^breaking:?\s*$/i,
  /follow (our )?live (updates|coverage)/i,
  /^(read|see) more\b/i,
  /link in bio/i,
  /^\s*(thread|🧵)/i,
]

// A headline needs enough words to carry framing. Below this it's a label.
const MIN_WORDS = 6

/** Does this text make a scoreable claim? */
function hasClaim(text) {
  const t = String(text || '').replace(/https?:\/\/\S+/g, '').trim()
  if (t.split(/\s+/).filter(Boolean).length < MIN_WORDS) return false
  return !NON_CLAIM.some((re) => re.test(t))
}

/**
 * 0–1 virality score. Three weighted factors, each saturating, so no single
 * dimension can carry a weak candidate:
 *   • velocity — engagement per minute, the actual "is it climbing" signal
 *   • reach    — author followers, log-scaled
 *   • fresh    — decays with age; a 4-hour-old post is nearly worthless to
 *                reply under no matter how big it got
 *
 * CALIBRATED against 27 real candidates (2026-08-08): velocity p50 0.89,
 * p90 9.95, max 11.0. The first version normalised velocity against a ceiling of
 * 50, which was a guess and wrong by ~5×: the term contributed almost nothing,
 * every candidate landed within 0.04 of the floor, and ranking was effectively
 * random. Re-measure this if Grok's engagement estimates change scale.
 *
 * Reach is near-constant in practice (tracked outlets run 9M–42M followers, so
 * the term is ~0.2 for everyone). It's kept as a floor against a mis-mapped
 * handle rather than as a discriminator — freshness and velocity do the ranking.
 */
const VELOCITY_CEILING = 10 // ≈ p90 of observed engagement/minute

function viralityScore(c) {
  const velocity = Math.min(1, (c.velocity || 0) / VELOCITY_CEILING)
  const reach = Math.min(1, Math.log10(Math.max(1, c.author_followers || 1)) / 7) // 10M → 1.0
  const age = Math.max(1, c.age_minutes || 60)
  const fresh = Math.max(0, Math.min(1, 1 - (age - 15) / 225)) // 1.0 ≤15m → 0 at 240m
  const score = velocity * 0.5 + reach * 0.2 + fresh * 0.3
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100
}

/**
 * Returns { survivors, dropped }, both augmented with prefilter_score /
 * prefilter_reason. Survivors are sorted best-first and capped.
 */
async function prefilterCandidates(candidates) {
  if (candidates.length === 0) return { survivors: [], dropped: [] }

  const survivors = []
  const dropped = []

  for (const c of candidates) {
    const score = viralityScore(c)
    const augmented = { ...c, prefilter_score: score }

    if (!hasClaim(c.text)) {
      dropped.push({ ...augmented, prefilter_reason: 'no scoreable claim in text' })
      continue
    }
    if ((c.age_minutes || 0) > 240) {
      dropped.push({ ...augmented, prefilter_reason: `too old (${c.age_minutes}m) to reply under` })
      continue
    }
    // Floor sits at 0.35 because the reach term contributes a near-constant
    // ~0.2 for every tracked outlet — a lower floor would never fire. At 0.35
    // this drops the "old and flat" combination (e.g. 200m old at 0.14 eng/min
    // → 0.26) while keeping fresh-or-fast posts (35m at 2.1 eng/min → 0.58).
    if (score < FLOOR()) {
      dropped.push({ ...augmented, prefilter_reason: `virality ${score} below floor ${FLOOR()}` })
      continue
    }
    survivors.push({ ...augmented, prefilter_reason: `virality ${score}` })
  }

  survivors.sort((a, b) => b.prefilter_score - a.prefilter_score)
  const cap = CAP()
  const kept = survivors.slice(0, cap)
  const overflow = survivors.slice(cap).map((c) => ({ ...c, prefilter_reason: 'over-run cap' }))

  console.log(
    `   ✓ Pre-filter (no model): ${kept.length} kept (cap ${cap}), ` +
      `${dropped.length + overflow.length} dropped`,
  )
  return { survivors: kept, dropped: [...dropped, ...overflow] }
}

module.exports = { prefilterCandidates, viralityScore, hasClaim }
