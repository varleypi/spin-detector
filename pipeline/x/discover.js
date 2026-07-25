/**
 * Stage 1 — Candidate discovery.
 *
 * Default source: Grok's Agent Tools API `x_search` (free X tier — no paid X
 * search seat needed). Grok agentically searches live X and returns news/headline
 * posts with early traction. We normalize each into a candidate shape the rest of
 * the pipeline understands.
 *
 * The public surface is discoverCandidates() — swap the internal source for
 * native X `GET /2/tweets/search/recent` (see discoverViaXApi stub) if/when the
 * account moves to X Basic+, without touching prefilter/score.
 *
 * NOTE: x_search gives content, author handle, and the post URL reliably;
 * exact engagement counts are Grok's best estimate, not ground truth. Native X
 * search (Basic+ tier) returns real metrics — that's the upgrade path.
 */

const { xSearchJson } = require('./grok')

// Kept small and news-desk-shaped on purpose — a tight brief keeps the agentic
// search short, which is what costs money.
const discoveryPrompt = (max) => `Search X and find up to ${max} posts from roughly the last 6 hours that:
  • make a concrete NEWS claim or carry a news HEADLINE (politics, US/world news, policy,
    breaking events) — NOT opinion-only, memes, ads, or personal threads, and
  • already show early traction for their age (fast likes/reposts), and
  • come from journalists, news outlets, politicians, officials, or high-reach news accounts.

Prefer posts that will keep spreading. Exclude anything older than ~12 hours.

For EACH post return an object:
  handle           : author @handle without the @
  author_name      : display name
  author_type      : one of journalist | outlet | politician | official | other
  followers_estimate: integer best estimate
  url              : full https://x.com/... status URL
  text             : the post's news text/headline (verbatim, trimmed)
  age_minutes      : integer estimate of post age
  likes / reposts / replies : integer best estimates (0 if unknown)

Respond JSON only:
{"posts":[{"handle":"...","author_name":"...","author_type":"outlet","followers_estimate":120000,
"url":"https://x.com/.../status/123","text":"...","age_minutes":45,"likes":800,"reposts":210,"replies":90}]}`

// Extract the numeric status id from an x.com/twitter.com status URL.
function tweetIdFromUrl(url) {
  const m = String(url || '').match(/status(?:es)?\/(\d+)/)
  return m ? m[1] : null
}

function toCandidate(p) {
  const tweetId = tweetIdFromUrl(p.url)
  if (!tweetId || !p.text) return null
  const likes = Number(p.likes) || 0
  const reposts = Number(p.reposts) || 0
  const replies = Number(p.replies) || 0
  const ageMin = Math.max(1, Number(p.age_minutes) || 60)
  const engagement = likes + 2 * reposts + replies // reposts weighted (spread signal)
  return {
    tweet_id: tweetId,
    tweet_url: `https://x.com/${p.handle}/status/${tweetId}`,
    author_handle: String(p.handle || '').replace(/^@/, ''),
    author_name: p.author_name || null,
    author_type: p.author_type || 'other',
    author_followers: Number(p.followers_estimate) || null,
    text: String(p.text).trim(),
    likes,
    reposts,
    replies,
    quotes: 0,
    age_minutes: ageMin,
    velocity: Math.round((engagement / ageMin) * 100) / 100, // engagement per minute
  }
}

/** Default discovery via Grok's x_search agent tool. Returns normalized candidates. */
async function discoverViaGrok({ maxResults = 20 } = {}) {
  // Bound the search to today + yesterday (UTC) — we only want fresh news, and a
  // tight window keeps the agentic search cheap.
  const today = new Date()
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const iso = (d) => d.toISOString().slice(0, 10)

  const { data, citations } = await xSearchJson({
    prompt: discoveryPrompt(maxResults),
    system: 'You surface real, currently-trending posts from X. You always respond with valid JSON only, no preamble.',
    fromDate: iso(yesterday),
    toDate: iso(today),
  })
  const posts = Array.isArray(data?.posts) ? data.posts : []
  const candidates = posts.map(toCandidate).filter(Boolean)
  console.log(`   x_search returned ${posts.length} posts, ${candidates.length} usable (${citations.length} citations)`)
  return candidates
}

/**
 * Native X API discovery — stub for the X Basic+ upgrade path. Uses
 * GET /2/tweets/search/recent with real public_metrics. Wire up when tier allows.
 */
async function discoverViaXApi() {
  throw new Error('discoverViaXApi not implemented — requires X Basic+ (recent search). Using Grok Live Search.')
}

// We only rate MEDIA — outlets, journalists, politicians, officials. Aggregator /
// rewrite accounts (author_type 'other') are excluded: rating a random account's
// emoji rewrite is a weak "media bias" claim and carries more backlash risk than
// rating an institution. Override with ELIGIBLE_AUTHOR_TYPES (comma-separated).
const DEFAULT_ELIGIBLE_TYPES = ['outlet', 'journalist', 'politician', 'official']

function eligibleTypes() {
  const raw = process.env.ELIGIBLE_AUTHOR_TYPES
  if (!raw) return DEFAULT_ELIGIBLE_TYPES
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

/**
 * Public entry point. Filters to eligible author types, dedupes by tweet_id.
 * Env: DISCOVERY_SOURCE = 'grok' (default) | 'xapi'; MAX_LIVE_SEARCH_RESULTS;
 *      ELIGIBLE_AUTHOR_TYPES.
 */
async function discoverCandidates() {
  const source = process.env.DISCOVERY_SOURCE || 'grok'
  const maxResults = Number(process.env.MAX_LIVE_SEARCH_RESULTS) || 20

  const raw =
    source === 'xapi' ? await discoverViaXApi() : await discoverViaGrok({ maxResults })

  const allowed = eligibleTypes()
  const seen = new Set()
  const deduped = []
  let ineligible = 0
  for (const c of raw) {
    if (!allowed.includes(String(c.author_type).toLowerCase())) {
      ineligible++
      continue
    }
    if (seen.has(c.tweet_id)) continue
    seen.add(c.tweet_id)
    deduped.push(c)
  }
  console.log(
    `   ✓ Discovered ${deduped.length} eligible candidates (source: ${source}; ` +
      `${ineligible} dropped as non-media)`,
  )
  return deduped
}

module.exports = { discoverCandidates, tweetIdFromUrl, toCandidate }
