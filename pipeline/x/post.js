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
  const res = await client.v2.tweet(text, {
    reply: { in_reply_to_tweet_id: inReplyToTweetId },
  })
  const tweetId = res?.data?.id
  if (!tweetId) throw new Error('X returned no tweet id')
  return { tweetId, dryRun: false }
}

function indent(text) {
  return String(text)
    .split('\n')
    .map((l) => `      │ ${l}`)
    .join('\n')
}

module.exports = { postReply, getClient, indent, X_ENV }
