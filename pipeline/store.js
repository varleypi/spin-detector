/**
 * Stage 4+5 — Write pipeline results to Supabase.
 *
 * Tables written:
 *   articles            — one row per scored article
 *   story_clusters      — one row per cluster
 *   outlet_daily_scores — one row per outlet (aggregated)
 *   pipeline_runs       — audit log
 */

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
  }))

  const { error } = await supabase
    .from('articles')
    .upsert(rows, { onConflict: 'date,outlet_id,headline', ignoreDuplicates: false })

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
    groups[a.outletId].push(a.biasScore)
  }

  return Object.entries(groups).map(([outletId, scores]) => {
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length
    const variance = scores.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / scores.length
    const cfg = OUTLETS[outletId]
    return {
      date,
      outlet_id: outletId,
      outlet_name: cfg?.name ?? outletId,
      abbreviation: cfg?.abbr ?? outletId.toUpperCase(),
      avg_score: Math.round(avg * 100) / 100,
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

// ── Main export ───────────────────────────────────────────────────────────────

async function storeResults({ scoredArticles, clusters, date, elapsedSeconds }) {
  const supabase = getSupabase()

  await upsertArticles(supabase, scoredArticles, date)
  await upsertClusters(supabase, clusters, scoredArticles, date)
  await upsertOutletScores(supabase, scoredArticles, date)
  await logRun(supabase, {
    status: 'success',
    articleCount: scoredArticles.length,
    storyCount: clusters.length,
    elapsedSeconds,
  })
}

async function logError(supabase, errorMessage, partialCount = 0) {
  const sb = supabase ?? getSupabase()
  await logRun(sb, { status: 'error', errorMessage, articleCount: partialCount, storyCount: 0 })
}

module.exports = { storeResults, logError }
