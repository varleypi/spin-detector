/**
 * outletId → X handle, for the X reply pipeline.
 *
 * Kept OUT of outlets.js on purpose: that file is RSS/NewsAPI config consumed by
 * the daily article pipeline, and X handles are only meaningful here.
 *
 * Two consumers, both fail-closed if a handle is wrong or stale:
 *   • DISCOVERY_HANDLES  → x_search `allowed_x_handles` (max 20 per the API).
 *                          A bad handle means that outlet is never discovered.
 *   • isReplyTarget()    → the reply parent allowlist. A bad handle means we
 *                          never reply to that account.
 * Neither can cause a reply to land somewhere unintended, so an occasional stale
 * handle degrades coverage, never safety.
 *
 * Handles are the outlets' primary news accounts. Verify against x.com before
 * adding new ones — there is no API check here (X's free tier is write-only).
 */

const X_HANDLES = {
  // ── US national ──────────────────────────────────────────────────────────
  cnn: 'CNN',
  msnbc: 'MSNBC',
  nytimes: 'nytimes',
  washpost: 'washingtonpost',
  npr: 'NPR',
  politico: 'politico',
  foxnews: 'FoxNews',
  nypost: 'nypost',
  cbsnews: 'CBSNews',
  abc: 'ABC',
  nbc: 'NBCNews',
  ap: 'AP',
  reuters: 'Reuters',
  usatoday: 'USATODAY',
  thehill: 'thehill',
  axios: 'axios',
  newsweek: 'Newsweek',
  huffpost: 'HuffPost',
  vox: 'voxdotcom',
  theatlantic: 'TheAtlantic',

  // ── US opinion / ideological ─────────────────────────────────────────────
  dailycaller: 'DailyCaller',
  breitbart: 'BreitbartNews',
  washexaminer: 'dcexaminer',
  thefreepress: 'TheFP',
  nationalreview: 'NRO',
  thefederalist: 'FDRLST',
  reason: 'reason',

  // ── Business / finance ───────────────────────────────────────────────────
  wsj: 'WSJ',
  cnbc: 'CNBC',
  forbes: 'Forbes',
  bloomberg: 'business',
  financialtimes: 'FT',
  marketwatch: 'MarketWatch',
  businessinsider: 'BusinessInsider',
  yahoofinance: 'YahooFinance',
  economist: 'TheEconomist',

  // ── International ────────────────────────────────────────────────────────
  bbc: 'BBCNews',
  guardian: 'guardian',
  aljazeera: 'AJEnglish',
  independent: 'Independent',
  telegraph: 'Telegraph',
  dailymail: 'MailOnline',
  metro: 'MetroUK',
  skynews: 'SkyNews',
  timeslondon: 'thetimes',
  cbc: 'CBCNews',
  timesofisrael: 'TimesofIsrael',

  // ── US regional ──────────────────────────────────────────────────────────
  latimes: 'latimes',
  bostonglobe: 'BostonGlobe',
  chicagotribune: 'chicagotribune',
  startribune: 'StarTribune',
  charlotteobserver: 'theobserver',
  houstonchronicle: 'HoustonChron',
  miamiherald: 'MiamiHerald',
  tampabaytimes: 'TB_Times',

  // neutralnews is our own sister site — never a reply target.
  // fairobserver has negligible X reach — omitted deliberately.
}

/**
 * The candidate pool for x_search, highest-reach first. Override with
 * X_DISCOVERY_HANDLES (comma-separated bare handles) to A/B a different set.
 */
const DEFAULT_DISCOVERY_HANDLES = [
  'CNN', 'FoxNews', 'nytimes', 'washingtonpost', 'MSNBC',
  'AP', 'Reuters', 'BBCNews', 'ABC', 'NBCNews',
  'CBSNews', 'politico', 'thehill', 'axios', 'WSJ',
  'nypost', 'guardian', 'NPR', 'BreitbartNews', 'TheFP',
]

/**
 * How many handles go into a single search.
 *
 * Counter-intuitive, and measured the hard way on live runs (2026-08-08):
 * NARROWING this makes runs MORE expensive, not less. With 20 handles Grok found
 * enough qualifying posts in 10 search calls ($0.14); with 6 it had to work
 * harder for the same result count and made 20 calls ($0.26). A wider net is an
 * easier search. Cost is controlled by the SEARCH BUDGET paragraph in
 * discover.js, not by this number.
 *
 * Defaults to the full pool. Lower it only to deliberately narrow which outlets
 * a run can reply to, and expect the cost to go up, not down.
 */
const HANDLES_PER_RUN = () => Number(process.env.X_HANDLES_PER_RUN) || 20

/**
 * Rotate the window through the pool so the day still covers every outlet.
 * Keyed on UTC hour: consecutive runs get different outlets, and the pool cycles
 * roughly every (pool / perRun) runs. Deterministic, so a re-run inside the same
 * hour searches the same handles and hits xAI's prompt cache.
 */
function discoveryHandles(now = new Date()) {
  const raw = process.env.X_DISCOVERY_HANDLES
  const pool = raw
    ? raw.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean)
    : DEFAULT_DISCOVERY_HANDLES

  const per = Math.max(1, Math.min(HANDLES_PER_RUN(), pool.length, 20))
  if (per >= pool.length) return pool.slice(0, 20)

  const offset = (now.getUTCHours() * per) % pool.length
  const window = []
  for (let i = 0; i < per; i++) window.push(pool[(offset + i) % pool.length])
  return window
}

/**
 * Secondary accounts that belong to an outlet we already track. Several outlets
 * run more than one high-reach news account and x_search surfaces whichever
 * posted — @BBCWorld (42M followers) turned up in live results even though only
 * @BBCNews was in the allowed-handle list.
 *
 * Without these, such posts are silently dropped as "not a tracked outlet",
 * which is safe but quietly costs reach. Only add accounts that are the OUTLET
 * speaking, never an individual journalist's account.
 */
const HANDLE_ALIASES = {
  bbcworld: 'bbc',
  bbcbreaking: 'bbc',
  cnnbrk: 'cnn',
  nytimesworld: 'nytimes',
  wsjpolitics: 'wsj',
  reuterspolitics: 'reuters',
  apolitics: 'ap',
}

// Lowercased handle → outletId, for mapping a discovered tweet back to an outlet.
const HANDLE_TO_OUTLET = {
  ...Object.fromEntries(Object.entries(X_HANDLES).map(([id, h]) => [h.toLowerCase(), id])),
  ...HANDLE_ALIASES,
}

/** Resolve a bare @handle to our outletId, or null if it isn't an outlet we track. */
function outletForHandle(handle) {
  return HANDLE_TO_OUTLET[String(handle || '').replace(/^@/, '').toLowerCase()] || null
}

/**
 * Is this account one we're willing to reply UNDER? Deliberately restricted to
 * tracked outlet institutions — never individual journalists or private people.
 * Replying to an institution's post is media criticism; replying under a named
 * person's post is something else.
 */
function isReplyTarget(handle) {
  const id = outletForHandle(handle)
  return id !== null && id !== 'neutralnews'
}

module.exports = {
  X_HANDLES,
  HANDLE_ALIASES,
  DEFAULT_DISCOVERY_HANDLES,
  discoveryHandles,
  outletForHandle,
  isReplyTarget,
}
