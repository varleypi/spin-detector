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
        pubDate: a.publishedAt ?? new Date().toISOString(),
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
  try {
    const feed = await RSS_PARSER.parseURL(cfg.rssUrl)
    return feed.items.slice(0, MAX_PER_OUTLET).map((item) => ({
      outletId,
      headline: (item.title ?? '').trim(),
      url: item.link ?? '',
      pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
      source: 'rss',
    }))
  } catch (err) {
    console.warn(`   ⚠ RSS failed for ${outletId}: ${err.message}`)
    return []
  }
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

  // Merge and flatten
  const articles = []
  for (const outletId of allOutletIds) {
    const items = newsapiResults[outletId] ?? rssByOutlet[outletId] ?? []
    const validItems = items.filter((a) => a.headline && a.headline.length > 10)
    articles.push(...validItems)
    console.log(`   ${outletId.padEnd(12)} ${validItems.length} headlines (${validItems[0]?.source ?? 'none'})`)
  }

  return articles
}

module.exports = { fetchAllHeadlines }
