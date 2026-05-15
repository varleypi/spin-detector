/**
 * Spin Detector — Nightly Pipeline
 * Run: node pipeline/run.js
 * Scheduled via GitHub Actions at 6:00 AM EST daily
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const OUTLET_NAMES = {
  cnn: 'CNN',
  msnbc: 'MSNBC',
  nytimes: 'NY Times',
  washpost: 'Washington Post',
  npr: 'NPR',
  politico: 'Politico',
  bbc: 'BBC',
  aljazeera: 'Al Jazeera',
  foxnews: 'Fox News',
  nypost: 'NY Post',
  dailycaller: 'Daily Caller',
  breitbart: 'Breitbart',
}

const OUTLET_ABBREVIATIONS = {
  cnn: 'CNN', msnbc: 'MSNBC', nytimes: 'NYT', washpost: 'WPost',
  npr: 'NPR', politico: 'PLTICO', bbc: 'BBC', aljazeera: 'AJ',
  foxnews: 'FOX', nypost: 'NYPost', dailycaller: 'DC', breitbart: 'BB',
}

const EXPECTED_RANGES = {
  cnn: [2.5, 4.0], msnbc: [1.5, 3.5], nytimes: [3.0, 4.5], washpost: [2.8, 4.2],
  npr: [3.5, 4.5], politico: [4.0, 5.5], bbc: [4.0, 5.5], aljazeera: [3.5, 5.0],
  foxnews: [7.0, 8.5], nypost: [6.5, 8.0], dailycaller: [7.5, 9.0], breitbart: [8.5, 9.8],
}

async function main() {
  console.log('🚀 Spin Detector Pipeline starting...')
  const startTime = Date.now()

  // Validate environment
  const requiredEnv = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error(`❌ Missing environment variable: ${key}`)
      process.exit(1)
    }
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const today = new Date().toISOString().split('T')[0]

  // ── Stage 1: Fetch RSS feeds ──────────────────────────────────────────────
  console.log('\n📡 Stage 1: Fetching RSS feeds...')
  const { fetchAllFeeds } = require('../lib/rss.ts') // transpile separately or use ts-node
  let allArticles
  try {
    allArticles = await fetchAllFeeds()
    console.log(`   ✓ Fetched ${allArticles.length} articles from ${Object.keys(OUTLET_NAMES).length} outlets`)
  } catch (err) {
    console.error('   ✗ RSS fetch failed:', err.message)
    await logPipelineRun(supabase, { status: 'error', error: err.message, articleCount: 0, storyCount: 0 })
    process.exit(1)
  }

  // ── Stage 2 & 3: Cluster + Score via Claude ───────────────────────────────
  console.log('\n🤖 Stage 2-3: Clustering and scoring with Claude...')
  const { clusterAndScoreHeadlines } = require('../lib/claude.ts')
  let scoredArticles
  try {
    scoredArticles = await clusterAndScoreHeadlines(allArticles)
    console.log(`   ✓ Scored ${scoredArticles.length} articles across clusters`)
  } catch (err) {
    console.error('   ✗ Claude scoring failed:', err.message)
    await logPipelineRun(supabase, { status: 'error', error: err.message, articleCount: allArticles.length, storyCount: 0 })
    process.exit(1)
  }

  // ── Stage 4: Store results ────────────────────────────────────────────────
  console.log('\n💾 Stage 4: Writing to database...')

  // Upsert articles
  const articleRows = scoredArticles.map(a => ({
    date: today,
    outlet_id: a.outletId,
    outlet_name: OUTLET_NAMES[a.outletId] ?? a.outletId,
    abbreviation: OUTLET_ABBREVIATIONS[a.outletId] ?? a.outletId.toUpperCase(),
    topic: a.topicLabel,
    headline: a.headline,
    url: a.url,
    pub_date: a.pubDate,
    bias_score: a.biasScore,
    bias_signals: a.biasSignals,
    cluster_id: a.clusterId,
  }))

  const { error: articleError } = await supabase.from('articles').upsert(articleRows)
  if (articleError) {
    console.error('   ✗ Article insert failed:', articleError.message)
    process.exit(1)
  }
  console.log(`   ✓ Stored ${articleRows.length} articles`)

  // Upsert story clusters
  const clusters = [...new Map(
    scoredArticles.map(a => [a.clusterId, { cluster_id: a.clusterId, topic_label: a.topicLabel, date: today, outlet_ids: [] }])
  ).values()]

  for (const cluster of clusters) {
    cluster.outlet_ids = scoredArticles
      .filter(a => a.clusterId === cluster.cluster_id)
      .map(a => a.outletId)
  }

  const { error: clusterError } = await supabase.from('story_clusters').upsert(clusters)
  if (clusterError) {
    console.error('   ✗ Cluster insert failed:', clusterError.message)
  } else {
    console.log(`   ✓ Stored ${clusters.length} story clusters`)
  }

  // ── Stage 5: Aggregate outlet daily scores ────────────────────────────────
  console.log('\n📊 Stage 5: Aggregating outlet scores...')

  const outletGroups = {}
  for (const article of scoredArticles) {
    if (!outletGroups[article.outletId]) outletGroups[article.outletId] = []
    outletGroups[article.outletId].push(article.biasScore)
  }

  const outletScoreRows = Object.entries(outletGroups).map(([outletId, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length
    const stdDev = Math.sqrt(variance)
    return {
      date: today,
      outlet_id: outletId,
      outlet_name: OUTLET_NAMES[outletId] ?? outletId,
      abbreviation: OUTLET_ABBREVIATIONS[outletId] ?? outletId.toUpperCase(),
      avg_score: Math.round(avg * 100) / 100,
      article_count: scores.length,
      std_deviation: Math.round(stdDev * 100) / 100,
      expected_range: EXPECTED_RANGES[outletId] ?? [0, 10],
    }
  })

  const { error: scoresError } = await supabase.from('outlet_daily_scores').upsert(outletScoreRows)
  if (scoresError) {
    console.error('   ✗ Outlet scores insert failed:', scoresError.message)
  } else {
    console.log(`   ✓ Aggregated scores for ${outletScoreRows.length} outlets`)
    for (const row of outletScoreRows) {
      console.log(`     ${row.outlet_name}: ${row.avg_score} (${row.article_count} articles)`)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  await logPipelineRun(supabase, {
    status: 'success',
    articleCount: articleRows.length,
    storyCount: clusters.length,
    elapsed,
  })

  console.log(`\n✅ Pipeline complete in ${elapsed}s`)
}

async function logPipelineRun(supabase, { status, error, articleCount, storyCount, elapsed }) {
  await supabase.from('pipeline_runs').insert({
    status,
    error_message: error ?? null,
    article_count: articleCount ?? 0,
    story_count: storyCount ?? 0,
    elapsed_seconds: elapsed ? parseFloat(elapsed) : null,
    created_at: new Date().toISOString(),
  })
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err)
  process.exit(1)
})
