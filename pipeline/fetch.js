/**
 * Stage 1 — Fetch headlines from NewsAPI + RSS fallback.
 *
 * Strategy:
 *   1. Batch all NewsAPI-enabled outlets into two API calls (5 + 4 sources)
 *   2. Fall back to RSS for any outlet that returned 0 results or has no newsapiId
 *   3. Return a flat array of { outletId, headline, url, pubDate }
 */

const Parser = require('rss-parser')
const { OUTLETS, NEWSAPI_TO_OUTLET } = require('./outlets')

const RSS_PARSER = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; SpinDetector/1.0; +https://spindetector.com)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
})
const MAX_PER_OUTLET = 8   // 56 outlets × 8 = ~448 headlines max; keeps Claude prompt manageable

// ── Freshness ─────────────────────────────────────────────────────────────────
// Feeds die silently: the host keeps serving the last items it ever published,
// forever, with a 200 and no error. WSJ's feeds.a.dj.com froze on 2025-01-27 and
// served that day's DeepSeek headlines every morning for 18 months — long enough
// that they clustered into a genuinely current chip selloff and rewrote its
// framing downstream. So we drop items too old to be today's news, and shout
// when an outlet's whole feed looks abandoned.

const MAX_AGE_HOURS = 72   // generous: some outlets stamp dates loosely or run slow feeds
const DEAD_FEED_DAYS = 7   // newest item older than this ⇒ the feed is almost certainly dead

function parsePubDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── NewsAPI ───────────────────────────────────────────────────────────────────

async function fetchFromNewsAPI(sourceIds) {
  const url = `https://newsapi.org/v2/top-headlines?sources=${sourceIds.join(',')}&pageSize=100&apiKey=${process.env.NEWSAPI_KEY}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.status !== 'ok') throw new Error(`NewsAPI error: ${json.message}`)
  return json.articles // [{ source: { id }, title, url, publishedAt }]
}

async function fetchNewsAPIBatch(outletIds) {
  const newsapiSources = outletIds
    .map((id) => OUTLETS[id]?.newsapiId)
    .filter(Boolean)

  if (newsapiSources.length === 0) return {}

  let rawArticles = []
  try {
    rawArticles = await fetchFromNewsAPI(newsapiSources)
  } catch (err) {
    console.warn(`   ⚠ NewsAPI batch failed (${newsapiSources.join(',')}): ${err.message}`)
    return {}
  }

  // Group by outlet
  const byOutlet = {}
  for (const a of rawArticles) {
    const outletId = NEWSAPI_TO_OUTLET[a.source?.id]
    if (!outletId || !a.title || a.title === '[Removed]') continue
    if (!byOutlet[outletId]) byOutlet[outletId] = []
    if (byOutlet[outletId].length < MAX_PER_OUTLET) {
      byOutlet[outletId].push({
        outletId,
        headline: a.title.trim(),
        url: a.url ?? '',
        // null, not now() — defaulting an unknown date to "now" would make every
        // undated item look fresh and defeat the staleness filter below.
        pubDate: parsePubDate(a.publishedAt),
        source: 'newsapi',
      })
    }
  }

  return byOutlet
}

// ── RSS ───────────────────────────────────────────────────────────────────────

async function fetchFromRSS(outletId) {
  const cfg = OUTLETS[outletId]
  if (!cfg?.rssUrl) return []
  // Retry once: some CDNs (e.g. Newsweek) intermittently 406 a cold request but
  // serve fine on a quick retry.
  // Google News feeds append " - Publisher" to every title; strip it for clean headlines.
  const isGoogleNews = cfg.rssUrl.includes('news.google.com')
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const feed = await RSS_PARSER.parseURL(cfg.rssUrl)
      return feed.items.slice(0, MAX_PER_OUTLET).map((item) => ({
        outletId,
        headline: (item.title ?? '').replace(isGoogleNews ? / - [^-]+$/ : '', '').trim(),
        url: item.link ?? '',
        pubDate: parsePubDate(item.pubDate ?? item.isoDate),
        source: 'rss',
      }))
    } catch (err) {
      if (attempt === 2) {
        console.warn(`   ⚠ RSS failed for ${outletId}: ${err.message}`)
        return []
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  return []
}

// ── Main export ───────────────────────────────────────────────────────────────

async function fetchAllHeadlines() {
  const allOutletIds = Object.keys(OUTLETS)

  // Split NewsAPI outlets into two batches to stay well under URL length limits
  const newsapiOutlets = allOutletIds.filter((id) => OUTLETS[id].newsapiId)
  const mid = Math.ceil(newsapiOutlets.length / 2)
  const batch1 = newsapiOutlets.slice(0, mid)
  const batch2 = newsapiOutlets.slice(mid)

  console.log(`   Fetching NewsAPI batch 1: ${batch1.join(', ')}`)
  console.log(`   Fetching NewsAPI batch 2: ${batch2.join(', ')}`)

  const [naResults1, naResults2] = await Promise.all([
    fetchNewsAPIBatch(batch1),
    fetchNewsAPIBatch(batch2),
  ])
  const newsapiResults = { ...naResults1, ...naResults2 }

  // Identify outlets that need RSS (no newsapiId, or returned 0 results)
  const needsRSS = allOutletIds.filter(
    (id) => !OUTLETS[id].newsapiId || !newsapiResults[id] || newsapiResults[id].length === 0
  )

  console.log(`   Fetching RSS for: ${needsRSS.join(', ')}`)
  const rssResults = await Promise.all(needsRSS.map(fetchFromRSS))
  const rssByOutlet = Object.fromEntries(needsRSS.map((id, i) => [id, rssResults[i]]))

  // Merge, drop stale items, and flatten
  const articles = []
  const health = []
  const now = Date.now()

  for (const outletId of allOutletIds) {
    const items = newsapiResults[outletId] ?? rssByOutlet[outletId] ?? []
    const source = items[0]?.source ?? 'none'

    const kept = []
    let stale = 0
    let undated = 0
    let newest = null

    for (const a of items) {
      if (!a.headline || a.headline.length <= 10) continue

      const at = a.pubDate ? new Date(a.pubDate).getTime() : null
      if (at !== null && (newest === null || at > newest)) newest = at

      if (at === null) {
        // No usable date. Keep it — a few feeds simply don't publish one, and
        // dropping them would silently erase the outlet — but count it so the
        // health report can flag an outlet whose freshness we can't verify.
        undated++
        kept.push(a)
        continue
      }
      if (now - at > MAX_AGE_HOURS * 3600 * 1000) {
        stale++
        continue
      }
      kept.push(a)
    }

    articles.push(...kept)
    health.push({ outletId, kept: kept.length, stale, undated, newest, source })

    const notes = [stale && `${stale} stale dropped`, undated && `${undated} undated`]
      .filter(Boolean).join(', ')
    console.log(`   ${outletId.padEnd(12)} ${kept.length} headlines (${source})${notes ? ` — ${notes}` : ''}`)
  }

  reportFeedHealth(health, now)

  return articles
}

// ── Feed health ───────────────────────────────────────────────────────────────
// A dead feed produces no error, so it can only be caught by looking at how old
// its newest item is. This runs for NewsAPI outlets too — NewsAPI sources go
// stale the same way, and the RSS fallback only triggers on an *empty* result,
// not an old one.

function reportFeedHealth(health, now) {
  const days = (ms) => (now - ms) / (24 * 3600 * 1000)

  const dead = health.filter((h) => h.newest !== null && days(h.newest) > DEAD_FEED_DAYS)
  // A dead feed also has zero kept items — report it once, as dead.
  const empty = health.filter((h) => h.kept === 0 && !dead.includes(h))
  const unverifiable = health.filter((h) => h.kept > 0 && h.newest === null)

  if (dead.length === 0 && empty.length === 0 && unverifiable.length === 0) {
    console.log(`\n   ✓ All ${health.length} outlets returned fresh headlines`)
    return
  }

  console.warn(`\n   ⚠ FEED HEALTH — ${dead.length} dead, ${empty.length} empty, ${unverifiable.length} undated`)

  for (const h of dead.sort((a, b) => a.newest - b.newest)) {
    console.warn(
      `     ✗ ${h.outletId.padEnd(14)} DEAD — newest item is ${Math.floor(days(h.newest))} days old ` +
      `(${new Date(h.newest).toISOString().slice(0, 10)}, via ${h.source}); needs a new feed URL`
    )
  }
  for (const h of empty) {
    console.warn(`     ✗ ${h.outletId.padEnd(14)} returned nothing usable (via ${h.source})`)
  }
  for (const h of unverifiable) {
    console.warn(`     · ${h.outletId.padEnd(14)} ${h.kept} headlines with no publication date — freshness unverified`)
  }
}

module.exports = { fetchAllHeadlines }
