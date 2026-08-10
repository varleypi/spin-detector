/**
 * Publish a reply to X.
 *
 * This is the only module in the pipeline that writes publicly. It assumes the
 * guardrails have already passed — its own job is narrow: send the reply, record
 * it, and never throw in a way that loses the record of a post that DID go out.
 *
 * Dry-run is the default. `X_AUTOPOST=on` is the single switch that makes this
 * live, and it's a GitHub repository variable so it can be flipped off without
 * a deploy.
 */

const X_ENV = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']

let cachedClient = null

function getClient() {
  if (cachedClient) return cachedClient
  const missing = X_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) throw new Error(`X credentials missing: ${missing.join(', ')}`)
  const { TwitterApi } = require('twitter-api-v2')
  cachedClient = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  })
  return cachedClient
}

/**
 * Post `text` as a reply to `inReplyToTweetId`.
 * Returns { tweetId, dryRun }. Throws on a real API failure so the caller can
 * mark the candidate for retry.
 */
async function postReply({ text, inReplyToTweetId, dryRun }) {
  if (dryRun) {
    console.log(`   🔇 DRY RUN — would reply to ${inReplyToTweetId}:\n${indent(text)}`)
    return { tweetId: null, dryRun: true }
  }

  const client = getClient()
  try {
    const res = await client.v2.tweet(text, {
      reply: { in_reply_to_tweet_id: inReplyToTweetId },
    })
    const tweetId = res?.data?.id
    if (!tweetId) throw new Error('X returned no tweet id')
    return { tweetId, dryRun: false }
  } catch (err) {
    throw new Error(describeXError(err))
  }
}

/**
 * Turn a twitter-api-v2 error into something actionable.
 *
 * The library's default message is just "Request failed with code 403", which
 * is useless: 403 covers at least four unrelated causes (app lacks write
 * permission, access tokens minted before permissions changed, duplicate
 * content, tier restriction) and they need completely different fixes. X puts
 * the real reason in the response body, so dig it out and keep it — this string
 * is persisted to x_candidates.status_note and is often the only forensic trace.
 */
function describeXError(err) {
  const code = err?.code || err?.data?.status || 'unknown'
  const d = err?.data || {}
  const parts = []
  if (d.detail) parts.push(d.detail)
  if (d.title && d.title !== d.detail) parts.push(`(${d.title})`)
  if (d.reason) parts.push(`reason=${d.reason}`)
  for (const e of d.errors || []) {
    if (e.message) parts.push(e.message)
    else if (e.detail) parts.push(e.detail)
  }
  const detail = parts.join(' ') || err?.message || 'no detail returned'
  return `X ${code}: ${detail}`
}

function indent(text) {
  return String(text)
    .split('\n')
    .map((l) => `      │ ${l}`)
    .join('\n')
}

module.exports = { postReply, getClient, indent, describeXError, X_ENV }
