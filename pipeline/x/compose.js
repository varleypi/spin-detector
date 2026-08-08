/**
 * Build the reply text.
 *
 * Rules that come from how X actually ranks replies, not from taste:
 *   • NO LINKS. X suppresses reach on posts carrying external links, and a link
 *     in a reply from an account the reader doesn't follow is a spam signal.
 *     The reply's job is to earn a profile click; the bio and pinned post do the
 *     converting.
 *   • NO @-mention of the parent. It's a reply — X already threads it, and a
 *     leading @handle makes it read as a callout.
 *   • Lead with the comparison, not the brand. Nobody cares what our scale is
 *     until they care what we found.
 *   • Vary the opener deterministically. Byte-identical replies across accounts
 *     are the single clearest automation signal X's spam models look for.
 *
 * Two formats:
 *   comparison — we matched a scored story cluster. This is the good one: it
 *                says something factual the reader can't get anywhere else.
 *   single     — no cluster match; we scored the post on its own. Weaker, so it
 *                needs a real lean to clear the guardrails.
 */

const MAX_TWEET = 280

/** 0–10 → "+1.2" / "−0.8". Matches social.js and lib/xQueue.ts exactly. */
function fmt(score) {
  const d = Math.round((score - 5) * 10) / 10
  return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1)
}

function label(score) {
  const d = score - 5
  if (d <= -3) return 'Far Left'
  if (d <= -1) return 'Left'
  if (d < 1) return 'Center'
  if (d < 3) return 'Right'
  return 'Far Right'
}

/** Deterministic variant pick — same story always gets the same opener. */
function pick(variants, seed) {
  let h = 0
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) | 0
  return variants[Math.abs(h) % variants.length]
}

const COMPARISON_OPENERS = [
  'Same story, different newsrooms',
  'Here’s how the others worded it',
  'We scored this story across outlets',
  'Same event, side by side',
  'For context, the rest of the coverage',
]

const SINGLE_OPENERS = [
  'Language check on this one:',
  'We scored the wording:',
  'How this is framed:',
  'Framing check:',
]

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OUTLETS } = require('../outlets')

/**
 * Display-name overrides for X. The site's `abbr` values are fine in a table
 * with a masthead next to them, but standalone in a tweet some are ambiguous or
 * actively misleading — "Fed" for The Federalist reads as the Federal Reserve
 * on a politics timeline, which is the opposite of clarifying. Anything not
 * listed falls through to the site's abbr.
 */
const X_DISPLAY_NAMES = {
  thefederalist: 'Federalist',
  dailycaller: 'DailyCaller',
  breitbart: 'Breitbart',
  huffpost: 'HuffPost',
  washexaminer: 'WaExaminer',
  nationalreview: 'NatReview',
  thefreepress: 'FreePress',
  independent: 'Independent',
  guardian: 'Guardian',
  economist: 'Economist',
  neutralnews: 'NeutralNews',
  financialtimes: 'FT',
  bostonglobe: 'BostonGlobe',
  timesofisrael: 'TimesOfIsrael',
}

/**
 * Display name for an outlet in the comparison line. Prefers the X override,
 * then the curated `abbr` from outlets.js (AP, NYT, WPost — the forms readers
 * recognise, and what the website already shows so a reply never disagrees with
 * the site). Falls back to light cleanup of the stored name.
 */
function shortName(outletId, name) {
  if (outletId && X_DISPLAY_NAMES[outletId]) return X_DISPLAY_NAMES[outletId]
  const abbr = outletId && OUTLETS[outletId]?.abbr
  if (abbr) return abbr
  return String(name || '')
    .replace(/^The /i, '')
    .trim()
}

// Outlets a general reader accepts as a neutral reference point. Used to anchor
// the comparison — "the left end, the right end, and AP in the middle" is a far
// more convincing sentence than a list of sixteen abbreviations.
const CENTER_ANCHORS = ['ap', 'reuters', 'bbc', 'npr']

/**
 * Choose which outlets to name. Showing all of them is worse than showing four:
 * on a real 20-outlet cluster the full list ran exactly to the 280-char limit,
 * was mostly `+0.0` filler, and buried the one number that matters — the gap
 * between the ends.
 *
 * So: both extremes (the whole point), plus a recognisable centre anchor for
 * credibility, plus the outlet we're replying to if it isn't already shown and
 * actually has a lean.
 */
function selectOutlets(outlets, replyToOutletId) {
  if (outlets.length <= 3) return outlets

  const chosen = new Map()
  const add = (o) => o && !chosen.has(o.outletId) && chosen.set(o.outletId, o)

  add(outlets[0]) // most left
  add(outlets[outlets.length - 1]) // most right

  // Centre anchor: a recognisable outlet nearest 5.0.
  const anchors = outlets
    .filter((o) => CENTER_ANCHORS.includes(o.outletId))
    .sort((a, b) => Math.abs(a.score - 5) - Math.abs(b.score - 5))
  add(anchors[0])

  // The outlet we're replying to, but only if it has something to show. Adding
  // it at +0.0 just to name-check it wastes a slot.
  const self = outlets.find((o) => o.outletId === replyToOutletId)
  if (self && Math.abs(self.score - 5) >= 0.5) add(self)

  return [...chosen.values()].sort((a, b) => a.score - b.score)
}

/**
 * Comparison reply: the outlets that define the spread, then the gap, then the
 * scale. The opener states how many outlets were scored, so naming only three
 * still reads as evidence rather than cherry-picking.
 *
 * Degrades by dropping the middle first — the two extremes ARE the comparison,
 * so they're the last thing to go.
 */
function composeComparison(candidate, cluster) {
  const opener = pick(COMPARISON_OPENERS, cluster.clusterId)
  const scale = 'Scale: −5 left ↔ +5 right'
  const line = (o) => `${shortName(o.outletId, o.name)} ${fmt(o.score)}`

  const total = cluster.outlets.length
  const count = total >= 4 ? ` (${total} outlets scored)` : ''
  const selected = selectOutlets(cluster.outlets, candidate.outlet_id)

  // Try the selection, then shed the middle if it doesn't fit.
  for (let keep = selected.length; keep >= 2; keep--) {
    const outlets = trimToExtremes(selected, keep)
    const body = outlets.map(line).join(' · ')
    const gapNote =
      cluster.gap >= 2
        ? `\n\n${cluster.gap.toFixed(1)}-point spread between the ends.`
        : ''
    const text = `${opener}${count}:\n${body}${gapNote}\n\n${scale}`
    if (text.length <= MAX_TWEET) return { text, format: 'comparison' }
  }
  return null
}

/** Keep the n outlets closest to the two extremes, preserving order. */
function trimToExtremes(outlets, n) {
  if (n >= outlets.length) return outlets
  const head = Math.ceil(n / 2)
  const tail = n - head
  return [...outlets.slice(0, head), ...(tail > 0 ? outlets.slice(-tail) : [])]
}

/**
 * Single-post reply. The rationale carries the weight — it has to say something
 * specific about the wording, or the reply is just a number.
 */
function composeSingle(candidate) {
  const score = fmt(candidate.bias_score)
  const lean = label(candidate.bias_score)
  const opener = pick(SINGLE_OPENERS, candidate.tweet_id)
  const why = String(candidate.rationale || '').trim()
  const scale = 'Scale: −5 left ↔ +5 right'

  const withWhy = `${opener} ${score} (${lean})\n\n${why}\n\n${scale}`
  if (withWhy.length <= MAX_TWEET && why) return { text: withWhy, format: 'single' }

  // Trim the rationale rather than dropping it — without a "why" this is a bot.
  if (why) {
    const room = MAX_TWEET - `${opener} ${score} (${lean})\n\n\n\n${scale}`.length
    if (room >= 40) {
      const trimmed = why.slice(0, room - 1).trimEnd() + '…'
      return { text: `${opener} ${score} (${lean})\n\n${trimmed}\n\n${scale}`, format: 'single' }
    }
  }
  return null
}

/**
 * Compose a reply for a candidate. Returns {text, format} or null if nothing
 * postable could be built (caller records the skip).
 */
function composeReply(candidate) {
  if (candidate.cluster && candidate.cluster.outlets.length >= 2) {
    const c = composeComparison(candidate, candidate.cluster)
    if (c) return c
  }
  if (candidate.bias_score != null) return composeSingle(candidate)
  return null
}

module.exports = {
  composeReply,
  composeComparison,
  composeSingle,
  fmt,
  label,
  shortName,
  trimToExtremes,
  MAX_TWEET,
}
