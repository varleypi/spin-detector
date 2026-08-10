/**
 * X web-intent links — the one-tap reply path.
 *
 * WHY THIS EXISTS: the X API cannot reply to a third party's post on any
 * self-serve tier. The live error is unambiguous:
 *
 *   403 "You can only reply to or quote posts where you are mentioned or are
 *        the author." (Authorization Error)
 *
 * X calls this "summoned context", and it applies to free, Basic, Pro and
 * pay-per-use alike — quote-post endpoints were withdrawn from self-serve
 * entirely in April 2026. So there is no amount of money that makes automated
 * replying work. Verified against the live API 2026-08-10.
 *
 * Web intents are a different thing entirely: a normal URL that opens X's own
 * composer with the text pre-filled, which a human then posts. That is a person
 * using X, not an app acting on their behalf, so none of the API's automation
 * policy applies. It's the officially supported share mechanism.
 *
 * The pipeline therefore does everything except the final tap: discover, match,
 * score, guard, compose — then hand over a link. One tap, ~5 seconds.
 */

const INTENT_BASE = 'https://x.com/intent/post'

/**
 * Build the composer link for a reply.
 *
 * `in_reply_to` is what makes X thread it under the parent; without it the same
 * text posts as a standalone tweet to nobody. Verified 2026-08-10 that both
 * x.com/intent/post and the legacy twitter.com/intent/tweet accept it.
 */
function intentUrl({ text, inReplyToTweetId }) {
  const params = new URLSearchParams()
  params.set('text', String(text || ''))
  if (inReplyToTweetId) params.set('in_reply_to', String(inReplyToTweetId))
  return `${INTENT_BASE}?${params.toString()}`
}

/** Direct link to the parent post, so it can be read before replying. */
function parentUrl(candidate) {
  if (candidate.tweet_url) return candidate.tweet_url
  return `https://x.com/${candidate.author_handle}/status/${candidate.tweet_id}`
}

module.exports = { intentUrl, parentUrl, INTENT_BASE }
