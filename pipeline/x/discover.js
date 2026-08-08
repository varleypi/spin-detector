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

const { xSearchJson, costLine } = require('./grok')
const { discoveryHandles, outletForHandle, isReplyTarget } = require('../xHandles')

// Two numbers in this prompt are load-bearing, both calibrated against live A/B
// runs on 2026-08-08 (all three measured back-to-back, within the same minute):
//
//   window  budget   posts  fresh≤180m    cost   tool calls
//     3h       3         0        0      $0.020       3
//    12h       6         8        6      $0.076       5    ← shipped
//    12h    none         8        8      $0.185      17
//
// SEARCH BUDGET: Grok treats "find up to N" as a target and keeps searching
// until it hits it — 17 calls when unbudgeted. Capping is the main cost lever.
// But cap too hard (3) and it gives up and returns an empty list, which isn't a
// saving, it's a dead pipeline that posts nothing. 6 is where it still finds
// things. Do not lower this without re-running the A/B.
//
// WINDOW: this is a search-EFFORT dial, NOT a freshness control — the intuitive
// reading is backwards. Asking for 3 hours doesn't return fresher posts, it just
// makes the search hard enough that a budgeted agent gives up. Real freshness is
// enforced downstream where it's reliable (prefilter drops >240m, guardrails
// block >180m) against each post's actual age. So: ask wide, filter hard.
const SEARCH_WINDOW_HOURS = () => Number(process.env.DISCOVERY_WINDOW_HOURS) || 12
const SEARCH_CALL_BUDGET = () => Number(process.env.MAX_SEARCH_CALLS) || 6

const discoveryPrompt = (max) => `Search X and find up to ${max} posts from the last ${SEARCH_WINDOW_HOURS()} hours that:
  • make a concrete NEWS claim or carry a news HEADLINE (politics, US/world news, policy,
    breaking events) — NOT opinion-only, memes, ads, or personal threads, and
  • already show early traction for their age (fast likes/reposts).

List the NEWEST posts first — freshness is the priority. We reply to these, so a post
past its peak is worth less than a smaller one still climbing.

SEARCH BUDGET: make at most ${SEARCH_CALL_BUDGET()} search calls, then answer with what you found.
Do not keep searching just to reach ${max} results.

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

/**
 * Default discovery via Grok's x_search agent tool. Returns normalized candidates.
 *
 * Scoped to `allowed_x_handles` — the outlet accounts we actually reply under.
 * This is both a cost lever (a bounded search finishes in one or two tool calls
 * instead of roaming all of X) and a targeting one: a post we can't reply to is
 * a post we shouldn't have paid to find.
 */
async function discoverViaGrok({ maxResults = 8 } = {}) {
  // Today only (UTC). We want posts minutes old, not yesterday's news — and a
  // one-day window is materially cheaper than a two-day one.
  const iso = (d) => d.toISOString().slice(0, 10)
  const now = new Date()
  const handles = discoveryHandles()

  const { data, citations, usage } = await xSearchJson({
    prompt: discoveryPrompt(maxResults),
    system: 'You surface real, currently-trending posts from X. You always respond with valid JSON only, no preamble.',
    fromDate: iso(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    toDate: iso(now),
    allowedHandles: handles,
  })
  const posts = Array.isArray(data?.posts) ? data.posts : []
  const candidates = posts.map(toCandidate).filter(Boolean)
  console.log(
    `   x_search over ${handles.length} handles returned ${posts.length} posts, ` +
      `${candidates.length} usable (${citations.length} citations)`,
  )
  console.log(costLine(usage, 'discovery'))
  return { candidates, usage }
}

/**
 * Native X API discovery — stub for the X Basic+ upgrade path. Uses
 * GET /2/tweets/search/recent with real public_metrics. Wire up when tier allows.
 */
async function discoverViaXApi() {
  throw new Error('discoverViaXApi not implemented — requires X Basic+ (recent search). Using Grok Live Search.')
}

/**
 * Public entry point. Filters to accounts we're allowed to reply under, dedupes
 * by tweet_id. Returns { candidates, usage }.
 *
 * The eligibility gate is now membership in the tracked-outlet handle map, not
 * Grok's self-reported `author_type`. Two reasons: the handle map is ground
 * truth where author_type is a guess, and it's the same list the reply
 * guardrails enforce — so discovery can't surface something we'd refuse to use.
 *
 * Env: DISCOVERY_SOURCE = 'grok' (default) | 'xapi'; MAX_LIVE_SEARCH_RESULTS;
 *      X_DISCOVERY_HANDLES.
 */
async function discoverCandidates() {
  const source = process.env.DISCOVERY_SOURCE || 'grok'
  const maxResults = Number(process.env.MAX_LIVE_SEARCH_RESULTS) || 8

  const { candidates: raw, usage } =
    source === 'xapi' ? await discoverViaXApi() : await discoverViaGrok({ maxResults })

  const seen = new Set()
  const deduped = []
  let ineligible = 0
  for (const c of raw) {
    const outletId = outletForHandle(c.author_handle)
    if (!isReplyTarget(c.author_handle)) {
      ineligible++
      continue
    }
    if (seen.has(c.tweet_id)) continue
    seen.add(c.tweet_id)
    deduped.push({ ...c, outlet_id: outletId, author_type: 'outlet' })
  }
  console.log(
    `   ✓ Discovered ${deduped.length} eligible candidates (source: ${source}; ` +
      `${ineligible} dropped — not a tracked outlet account)`,
  )
  return { candidates: deduped, usage }
}

module.exports = { discoverCandidates, tweetIdFromUrl, toCandidate }
