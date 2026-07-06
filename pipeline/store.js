/**
 * Stage 4+5 — Write pipeline results to Supabase + static JSON fallback.
 *
 * Tables written:
 *   articles            — one row per scored article
 *   story_clusters      — one row per cluster
 *   outlet_daily_scores — one row per outlet (aggregated)
 *   pipeline_runs       — audit log
 *
 * Also writes public/data/latest.json so the frontend always has
 * fresh data even if Supabase is unavailable.
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { OUTLETS } = require('./outlets')

function getSupabase() {
  const ws = require('ws')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    realtime: { transport: ws },
  })
}

// ── Articles ──────────────────────────────────────────────────────────────────

async function upsertArticles(supabase, scoredArticles, date) {
  const rows = scoredArticles.map((a) => ({
    date,
    outlet_id: a.outletId,
    outlet_name: OUTLETS[a.outletId]?.name ?? a.outletId,
    abbreviation: OUTLETS[a.outletId]?.abbr ?? a.outletId.toUpperCase(),
    cluster_id: a.clusterId,
    topic_label: a.topicLabel,
    headline: a.headline,
    url: a.url,
    pub_date: a.pubDate ? new Date(a.pubDate).toISOString() : null,
    bias_score: a.biasScore,
    bias_signals: a.biasSignals,
    bias_score_grok: a.biasScoreGrok ?? null,
    bias_signals_grok: a.biasSignalsGrok ?? null,
  }))

  // Deduplicate rows by conflict key before upserting — Claude can return duplicate headlines
  const seen = new Set()
  const dedupedRows = rows.filter((r) => {
    const key = `${r.date}|${r.outlet_id}|${r.headline}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { error } = await supabase
    .from('articles')
    .upsert(dedupedRows, { onConflict: 'date,outlet_id,headline', ignoreDuplicates: false })

  if (error) throw new Error(`articles upsert failed: ${error.message}`)
  console.log(`   ✓ ${rows.length} articles written`)
}

// ── Story Clusters ────────────────────────────────────────────────────────────

async function upsertClusters(supabase, clusters, scoredArticles, date) {
  const rows = clusters.map((c) => {
    const outletIds = [
      ...new Set(
        scoredArticles
          .filter((a) => a.clusterId === c.clusterId)
          .map((a) => a.outletId)
      ),
    ]
    return {
      date,
      cluster_id: c.clusterId,
      topic_label: c.topicLabel,
      outlet_ids: outletIds,
    }
  })

  const { error } = await supabase
    .from('story_clusters')
    .upsert(rows, { onConflict: 'date,cluster_id', ignoreDuplicates: false })

  if (error) throw new Error(`story_clusters upsert failed: ${error.message}`)
  console.log(`   ✓ ${rows.length} clusters written`)
}

// ── Outlet Daily Scores ───────────────────────────────────────────────────────

function aggregateOutletScores(scoredArticles, date) {
  const groups = {}
  for (const a of scoredArticles) {
    if (!groups[a.outletId]) groups[a.outletId] = []
    groups[a.outletId].push(a)
  }

  return Object.entries(groups).map(([outletId, articles]) => {
    const scores = articles.map((a) => a.biasScore)
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length
    const variance = scores.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / scores.length

    // Grok averages — only from articles that have Grok scores
    const grokScores = articles.map((a) => a.biasScoreGrok).filter((s) => s !== undefined && s !== null)
    const avgGrok = grokScores.length > 0
      ? grokScores.reduce((s, x) => s + x, 0) / grokScores.length
      : null

    const cfg = OUTLETS[outletId]
    return {
      date,
      outlet_id: outletId,
      outlet_name: cfg?.name ?? outletId,
      abbreviation: cfg?.abbr ?? outletId.toUpperCase(),
      avg_score: Math.round(avg * 100) / 100,
      avg_score_grok: avgGrok !== null ? Math.round(avgGrok * 100) / 100 : null,
      article_count: scores.length,
      std_deviation: Math.round(Math.sqrt(variance) * 100) / 100,
      expected_range: cfg?.expectedRange ?? [0, 10],
    }
  })
}

async function upsertOutletScores(supabase, scoredArticles, date) {
  const rows = aggregateOutletScores(scoredArticles, date)

  const { error } = await supabase
    .from('outlet_daily_scores')
    .upsert(rows, { onConflict: 'date,outlet_id', ignoreDuplicates: false })

  if (error) throw new Error(`outlet_daily_scores upsert failed: ${error.message}`)

  console.log('   ✓ Outlet scores aggregated:')
  rows
    .sort((a, b) => a.avg_score - b.avg_score)
    .forEach((r) =>
      console.log(`     ${r.outlet_name.padEnd(20)} ${r.avg_score.toFixed(1)}  (${r.article_count} articles)`)
    )
}

// ── Pipeline Run Log ──────────────────────────────────────────────────────────

async function logRun(supabase, { status, errorMessage, articleCount, storyCount, elapsedSeconds }) {
  const { error } = await supabase.from('pipeline_runs').insert({
    status,
    error_message: errorMessage ?? null,
    article_count: articleCount ?? 0,
    story_count: storyCount ?? 0,
    elapsed_seconds: elapsedSeconds ?? null,
  })
  if (error) console.warn(`   ⚠ pipeline_runs log failed: ${error.message}`)
}

// ── JSON Fallback ─────────────────────────────────────────────────────────────

function writeJsonFallback({ scoredArticles, clusters, date }) {
  // Build StoryCluster[] — same shape as db.ts getStoriesForDate()
  const stories = clusters
    .map((c) => ({
      id: c.clusterId,
      topicLabel: c.topicLabel,
      date,
      articles: scoredArticles
        .filter((a) => a.clusterId === c.clusterId)
        .map((a, i) => ({
          id: `${a.outletId}-${c.clusterId}-${i}`,
          outletId: a.outletId,
          outletName: OUTLETS[a.outletId]?.name ?? a.outletId,
          headline: a.headline,
          url: a.url,
          biasScore: a.biasScore,
          biasSignals: a.biasSignals,
          biasScoreGrok: a.biasScoreGrok ?? null,
          biasSignalsGrok: a.biasSignalsGrok ?? null,
          pubDate: a.pubDate ?? new Date().toISOString(),
          clusterId: c.clusterId,
        }))
        .sort((a, b) => a.biasScore - b.biasScore),
    }))
    .filter((s) => s.articles.length >= 2)

  // Build OutletScore[] — same shape as db.ts getOutletScores()
  const outlets = aggregateOutletScores(scoredArticles, date)
    .sort((a, b) => a.avg_score - b.avg_score)
    .map((row) => ({
      outletId: row.outlet_id,
      outletName: row.outlet_name,
      abbreviation: row.abbreviation,
      currentScore: row.avg_score,
      currentScoreGrok: row.avg_score_grok ?? undefined,
      articleCount: row.article_count,
      expectedRange: row.expected_range,
    }))

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    stories,
    outlets,
    articleCount: scoredArticles.length,
    storyCount: clusters.length,
  }

  const dir = path.join(__dirname, '..', 'public', 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(payload, null, 2))
  console.log(`   ✓ public/data/latest.json written (${payload.articleCount} articles, ${payload.storyCount} clusters)`)
}

// ── Main export ───────────────────────────────────────────────────────────────

// Each run is a full snapshot of "today". Clear the day's rows first so re-runs
// REPLACE rather than accumulate — otherwise clusters/articles from earlier runs
// linger (each run mints fresh cluster_ids), leaving the site showing a wider
// day-spanning set than the latest run and diverging from the X post, which only
// ever sees the current run's data.
async function clearDay(supabase, date) {
  for (const table of ['articles', 'story_clusters', 'outlet_daily_scores']) {
    const { error } = await supabase.from(table).delete().eq('date', date)
    if (error) throw new Error(`clearing ${table} for ${date} failed: ${error.message}`)
  }
  console.log(`   ✓ cleared existing ${date} rows (replace, not accumulate)`)
}

async function storeResults({ scoredArticles, clusters, date, elapsedSeconds }) {
  const supabase = getSupabase()

  await clearDay(supabase, date)
  await upsertArticles(supabase, scoredArticles, date)
  await upsertClusters(supabase, clusters, scoredArticles, date)
  await upsertOutletScores(supabase, scoredArticles, date)
  await logRun(supabase, {
    status: 'success',
    articleCount: scoredArticles.length,
    storyCount: clusters.length,
    elapsedSeconds,
  })

  // Always write static JSON fallback regardless of Supabase state
  try {
    writeJsonFallback({ scoredArticles, clusters, date })
  } catch (err) {
    console.warn(`   ⚠ JSON fallback write failed: ${err.message}`)
  }
}

async function logError(supabase, errorMessage, partialCount = 0) {
  const sb = supabase ?? getSupabase()
  await logRun(sb, { status: 'error', errorMessage, articleCount: partialCount, storyCount: 0 })
}

module.exports = { storeResults, logError }
