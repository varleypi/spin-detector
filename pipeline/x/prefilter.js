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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cfg } = require('./guardrails')

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
 * RELATIVE ranking, scored within the batch rather than against fixed constants.
 *
 * This is the third calibration of this function, and the reason it's now
 * relative is that both absolute versions broke for the same reason: the units
 * moved underneath them.
 *   v1 normalised velocity against a ceiling of 50 — a guess, ~5× too high, so
 *      every candidate scored within 0.04 of the floor and ranking was random.
 *   v2 fixed the ceiling to 10 by measuring 27 real candidates — correct at the
 *      time, then invalidated hours later when age decoding (see discover.js)
 *      corrected ages by ~24×. velocity is engagement/age, so every velocity
 *      fell by the same factor and the ceiling was wrong again.
 *
 * Absolute thresholds encode assumptions about upstream data that upstream
 * doesn't guarantee. We only ever need the best few of each batch, so rank
 * within the batch: percentile position is invariant to any monotonic rescaling
 * of the inputs. A change in Grok's estimates can no longer silently zero this.
 *
 * Hard, meaningful limits stay absolute (max age, has-a-claim) because those
 * encode real editorial rules, not statistical guesses.
 */
function percentileRank(values, v) {
  if (values.length <= 1) return 1
  let below = 0
  for (const x of values) if (x < v) below++
  return below / (values.length - 1)
}

/**
 * Score every candidate relative to its batch. Returns a Map of id → 0–1.
 *   • velocity — engagement per minute; the "is it still climbing" signal
 *   • fresh    — younger is better, over whatever range this batch spans
 *   • reach    — author followers; near-constant across tracked outlets, so it
 *                only breaks ties
 */
function rankBatch(candidates) {
  const vels = candidates.map((c) => Number(c.velocity) || 0)
  const ages = candidates.map((c) => Number(c.age_minutes) || 0)
  const reach = candidates.map((c) => Math.log10(Math.max(1, c.author_followers || 1)))

  const out = new Map()
  candidates.forEach((c, i) => {
    const v = percentileRank(vels, vels[i])
    const f = 1 - percentileRank(ages, ages[i]) // youngest ⇒ 1
    const r = percentileRank(reach, reach[i])
    out.set(c.tweet_id ?? i, Math.round((v * 0.5 + f * 0.3 + r * 0.2) * 100) / 100)
  })
  return out
}

/**
 * Returns { survivors, dropped }, both augmented with prefilter_score /
 * prefilter_reason. Survivors are sorted best-first and capped.
 */
async function prefilterCandidates(candidates) {
  if (candidates.length === 0) return { survivors: [], dropped: [] }

  const ranks = rankBatch(candidates)
  const survivors = []
  const dropped = []

  // The age limit is owned by guardrails.js — a single source of truth, so
  // raising the reply window can't be silently undone by a second gate here.
  // That exact bug shipped: the guardrail moved to 24h while this still cut at
  // 240m, and the pipeline dropped 100% of traffic.
  const maxAge = cfg.maxAgeMinutes()

  for (const c of candidates) {
    const score = ranks.get(c.tweet_id) ?? 0
    const augmented = { ...c, prefilter_score: score }

    if (!hasClaim(c.text)) {
      dropped.push({ ...augmented, prefilter_reason: 'no scoreable claim in text' })
      continue
    }
    if ((c.age_minutes || 0) > maxAge) {
      dropped.push({
        ...augmented,
        prefilter_reason: `too old (${c.age_minutes}m > ${maxAge}m) to reply under`,
      })
      continue
    }
    survivors.push({ ...augmented, prefilter_reason: `batch rank ${score}` })
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

module.exports = { prefilterCandidates, rankBatch, percentileRank, hasClaim }
