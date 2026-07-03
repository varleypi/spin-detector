/**
 * Optional daily social post to X (Twitter).
 *
 * After scoring, pick the single most share-worthy result of the day and post
 * it. Preference order:
 *   1. The headline where Claude and Grok disagree MOST (the "Model Wars" hook).
 *   2. Failing that (no Grok scores), the single most slanted headline.
 *
 * Gated on X_* env vars — if any are missing it logs and skips, never failing
 * the pipeline. Requires an X developer app with Read+Write permission and
 * OAuth 1.0a user tokens.
 */

const SITE_URL = 'https://www.spindetector.com'
const MAX_TWEET = 280
const TCO_LEN = 23 // X counts any link as 23 chars

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

/** Choose the day's most interesting article and compose tweet text. */
function composeTweet(articles) {
  const withGrok = articles.filter(
    (a) => typeof a.biasScore === 'number' && typeof a.biasScoreGrok === 'number'
  )

  let text = null

  if (withGrok.length > 0) {
    // Biggest Claude vs Grok divergence
    const top = withGrok
      .map((a) => ({ a, gap: Math.abs(a.biasScore - a.biasScoreGrok) }))
      .sort((x, y) => y.gap - x.gap)[0]
    if (top.gap >= 1.0) {
      const a = top.a
      const outlet = (a.outletName || a.outletId || '').toUpperCase()
      const scores = `Claude ${fmt(a.biasScore)} vs Grok ${fmt(a.biasScoreGrok)}`
      const fixed = `🤖 Claude & Grok disagree most today on ${outlet}:\n\n"__H__"\n\n${scores}\n\n${SITE_URL}\n#MediaBias`
      const room = MAX_TWEET - (fixed.length - '__H__'.length - SITE_URL.length + TCO_LEN)
      text = fixed.replace('__H__', truncate(a.headline || '', Math.max(20, room)))
    }
  }

  if (!text) {
    // Fallback: single most slanted headline
    const top = articles
      .filter((a) => typeof a.biasScore === 'number')
      .map((a) => ({ a, dist: Math.abs(a.biasScore - 5) }))
      .sort((x, y) => y.dist - x.dist)[0]
    if (!top) return null
    const a = top.a
    const outlet = (a.outletName || a.outletId || '').toUpperCase()
    const fixed = `Today's most slanted headline — ${outlet} (${label(a.biasScore)}, ${fmt(a.biasScore)} on our −5/+5 scale):\n\n"__H__"\n\n${SITE_URL}\n#MediaBias`
    const room = MAX_TWEET - (fixed.length - '__H__'.length - SITE_URL.length + TCO_LEN)
    text = fixed.replace('__H__', truncate(a.headline || '', Math.max(20, room)))
  }

  return text
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

  const text = composeTweet(articles)
  if (!text) {
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
    const res = await client.v2.tweet(text)
    console.log(`   ✓ Posted to X (id ${res?.data?.id ?? 'unknown'})`)
  } catch (err) {
    console.warn(`   ⚠ X post failed: ${err.message} — continuing`)
  }
}

module.exports = { postDailyTweet, composeTweet }
