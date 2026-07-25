/**
 * Stage 2 — Virality pre-filter (grok-3-mini, one batched call).
 *
 * Cheap gate before full scoring: keep only posts that make a checkable news
 * claim AND show real early traction, then cap to DAILY_CANDIDATE_CAP by
 * virality. Everything dropped here never reaches the (slightly pricier) scorer.
 */

const { chatJson } = require('./grok')

const CAP = () => Number(process.env.DAILY_CANDIDATE_CAP) || 12

function buildPrompt(candidates) {
  const list = candidates
    .map(
      (c, i) =>
        `[${i}] @${c.author_handle} (${c.author_type}, ~${c.author_followers ?? '?'} followers) | ` +
        `age ${c.age_minutes}m | ${c.likes}L/${c.reposts}RT/${c.replies}RE: ${c.text}`,
    )
    .join('\n')

  return `You are a news-desk triage filter. Given raw X posts, score each for VIRAL NEWS potential.
Keep only posts that make a checkable news claim OR carry a news headline AND show real early
traction for their age.

Do NOT reward: opinion with no claim, memes, threads about the poster's own life, ads,
engagement bait, or already-hours-old posts with flat velocity.

For each post return:
  index    : the input index
  keep     : boolean
  virality : 0.00–1.00  (early engagement-for-age × author reach × claim clarity)
  newsy    : boolean    (is there a concrete news claim/headline?)
  reason   : <= 12 words

POSTS:
${list}

Respond JSON only:
{"items":[{"index":0,"keep":true,"virality":0.72,"newsy":true,"reason":"..."}]}
RULES:
  • Return one entry per post — all ${candidates.length} indices.
  • virality: number 0.00–1.00, two decimals.`
}

/**
 * Returns { survivors, dropped }.
 *   survivors: candidates augmented with { prefilter_score, prefilter_reason }, capped + sorted.
 *   dropped:   candidates augmented with { prefilter_score, prefilter_reason } that failed the gate.
 * On Grok failure, degrades to velocity-ranked survivors so the run still produces work.
 */
async function prefilterCandidates(candidates) {
  if (candidates.length === 0) return { survivors: [], dropped: [] }

  let items
  try {
    const { data } = await chatJson({
      prompt: buildPrompt(candidates),
      system:
        'You are a news-desk triage editor. You always respond with valid JSON only, no preamble.',
      maxTokens: 4000,
    })
    items = Array.isArray(data?.items) ? data.items : []
  } catch (err) {
    console.warn(`   ⚠ Pre-filter Grok call failed: ${err.message} — falling back to velocity ranking`)
    const ranked = [...candidates]
      .map((c) => ({ ...c, prefilter_score: null, prefilter_reason: 'grok-unavailable:velocity-rank' }))
      .sort((a, b) => (b.velocity || 0) - (a.velocity || 0))
    return { survivors: ranked.slice(0, CAP()), dropped: ranked.slice(CAP()) }
  }

  const byIndex = new Map(items.map((it) => [it.index, it]))
  const survivors = []
  const dropped = []
  candidates.forEach((c, i) => {
    const it = byIndex.get(i)
    const score = it ? Math.max(0, Math.min(1, Number(it.virality) || 0)) : 0
    const augmented = {
      ...c,
      prefilter_score: it ? score : null,
      prefilter_reason: it?.reason || 'no verdict returned',
    }
    // Keep = model said keep AND it's newsy. Missing verdicts are dropped.
    if (it && it.keep && it.newsy) survivors.push(augmented)
    else dropped.push(augmented)
  })

  survivors.sort((a, b) => (b.prefilter_score || 0) - (a.prefilter_score || 0))
  const cap = CAP()
  const kept = survivors.slice(0, cap)
  const overflow = survivors.slice(cap).map((c) => ({ ...c, prefilter_reason: 'over-daily-cap' }))

  console.log(
    `   ✓ Pre-filter: ${kept.length} kept (cap ${cap}), ${dropped.length + overflow.length} dropped`,
  )
  return { survivors: kept, dropped: [...dropped, ...overflow] }
}

module.exports = { prefilterCandidates, buildPrompt }
