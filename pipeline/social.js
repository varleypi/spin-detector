/**
 * Optional daily social post to X (Twitter).
 *
 * After scoring, pick the day's most share-worthy STORY and post it:
 *   1. The story (cluster) with the widest bias spread across its articles —
 *      i.e. the biggest gap between how the most-left and most-right outlets
 *      framed the SAME event. Ties broken by the most outlets in the cluster.
 *   2. Failing that (no multi-outlet clusters), the single most slanted headline.
 *
 * Gated on X_* env vars — if any are missing it logs and skips, never failing
 * the pipeline. Requires an X developer app with Read+Write permission and
 * OAuth 1.0a user tokens.
 */

const SITE_URL = 'https://www.spindetector.com'
const MAX_TWEET = 280

const X_ENV = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']

// 0–10 → "+1.2" / "−0.8"
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

function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max - 1).trimEnd() + '…'
}

// Deterministic 0..(n-1) pick from a string, so the same story always gets the
// same opener but different stories vary — avoids the byte-identical daily post
// that reads as automation to X's ranking.
function pick(variants, seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return variants[Math.abs(h) % variants.length]
}

const SPREAD_OPENERS = [
  'Same story, opposite spin.',
  'One event. Two realities.',
  'How far apart can the coverage get? This far:',
  'The widest spin gap we caught today:',
]

const SLANT_OPENERS = [
  'Today’s most slanted headline:',
  'Spin of the day:',
  'This one leans hard:',
]

/**
 * Choose the day's highest-spread story and compose the post.
 * Returns { text, url }. `text` is posted as-is and carries no link — X
 * suppresses reach on posts with an external link in the body. `url` is
 * returned for callers that want it; the pipeline no longer posts it.
 */
function composeTweet(articles) {
  // Group scored articles into their story clusters.
  const byCluster = new Map()
  for (const a of articles) {
    if (typeof a.biasScore !== 'number' || !a.clusterId) continue
    if (!byCluster.has(a.clusterId)) byCluster.set(a.clusterId, [])
    byCluster.get(a.clusterId).push(a)
  }

  // For each multi-article cluster, find its bias spread (max − min score) and
  // the outlets at each extreme.
  const candidates = []
  for (const arts of byCluster.values()) {
    if (arts.length < 2) continue
    let lo = arts[0]
    let hi = arts[0]
    for (const a of arts) {
      if (a.biasScore < lo.biasScore) lo = a
      if (a.biasScore > hi.biasScore) hi = a
    }
    candidates.push({
      count: arts.length,
      spread: hi.biasScore - lo.biasScore,
      lo,
      hi,
      topicLabel: (arts.find((a) => a.topicLabel) || {}).topicLabel || '',
    })
  }

  // Widest spread wins; ties broken by most outlets in the cluster.
  candidates.sort((x, y) => y.spread - x.spread || y.count - x.count)
  const top = candidates[0]

  if (top && top.spread >= 1.0) {
    const loOutlet = (top.lo.outletName || top.lo.outletId || '').toUpperCase()
    const hiOutlet = (top.hi.outletName || top.hi.outletId || '').toUpperCase()
    const spreadStr = top.spread.toFixed(1)
    const seed = top.topicLabel || `${loOutlet}${hiOutlet}${spreadStr}`
    const opener = pick(SPREAD_OPENERS, seed)
    const scores = `${loOutlet} ${fmt(top.lo.biasScore)} ↔ ${hiOutlet} ${fmt(top.hi.biasScore)} (${spreadStr}-pt gap)`
    const fixed = `${opener} ${top.count} outlets, one story:\n\n"__T__"\n\n${scores}`
    const room = MAX_TWEET - (fixed.length - '__T__'.length)
    const text = fixed.replace('__T__', truncate(top.topicLabel || 'today’s top story', Math.max(20, room)))
    return { text, url: SITE_URL }
  }

  // Fallback: single most slanted headline (no multi-outlet clusters).
  const single = articles
    .filter((a) => typeof a.biasScore === 'number')
    .map((a) => ({ a, dist: Math.abs(a.biasScore - 5) }))
    .sort((x, y) => y.dist - x.dist)[0]
  if (!single) return null
  const a = single.a
  const outlet = (a.outletName || a.outletId || '').toUpperCase()
  const opener = pick(SLANT_OPENERS, a.headline || outlet)
  const fixed = `${opener} ${outlet} (${label(a.biasScore)}, ${fmt(a.biasScore)} on our −5/+5 scale):\n\n"__H__"`
  const room = MAX_TWEET - (fixed.length - '__H__'.length)
  const text = fixed.replace('__H__', truncate(a.headline || '', Math.max(20, room)))
  return { text, url: SITE_URL }
}

async function postDailyTweet(articles) {
  const missing = X_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.log(`   ℹ X posting disabled (missing ${missing.join(', ')})`)
    return
  }
  if (!Array.isArray(articles) || articles.length === 0) {
    console.log('   ℹ No articles to post')
    return
  }

  const post = composeTweet(articles)
  if (!post) {
    console.log('   ℹ Nothing share-worthy to post today')
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TwitterApi } = require('twitter-api-v2')
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    })
    // Single post, no link — X throttles reach on posts with an external link
    // in the body, and the follow-up link reply is deliberately not sent.
    const res = await client.v2.tweet(post.text)
    const id = res?.data?.id
    console.log(`   ✓ Posted to X (id ${id ?? 'unknown'})`)
  } catch (err) {
    console.warn(`   ⚠ X post failed: ${err.message} — continuing`)
  }
}

module.exports = { postDailyTweet, composeTweet }
