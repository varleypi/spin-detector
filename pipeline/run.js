/**
 * Spin Detector — Nightly Pipeline
 *
 * Stages:
 *   1. Fetch headlines from NewsAPI (9 outlets) + RSS (3 outlets)
 *   2. Cluster by topic + score political bias via Claude
 *   3. Store articles, clusters, outlet scores, and run log in Supabase
 *
 * Usage:
 *   node pipeline/run.js              # run for today
 *   PIPELINE_DATE=2026-05-01 node pipeline/run.js  # backfill a specific date
 *
 * Scheduled via GitHub Actions at 06:00 AM EST (11:00 UTC) daily.
 */

// Load .env.local when running locally
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const { fetchAllHeadlines } = require('./fetch')
const { clusterAndScore } = require('./cluster')
const { storeResults, logError } = require('./store')
const { postDailyTweet } = require('./social')

const REQUIRED_ENV = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'NEWSAPI_KEY']
// XAI_API_KEY enables Grok comparison scoring; X_* enable the daily post to X.
const OPTIONAL_ENV = ['XAI_API_KEY', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']

async function main() {
  console.log('\n🔍 SPIN DETECTOR — NIGHTLY PIPELINE')
  console.log('═'.repeat(48))

  // ── Validate environment ───────────────────────────────────────────────────
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
    console.error('   Copy .env.example → .env.local and fill in all values.')
    process.exit(1)
  }

  const missingOptional = OPTIONAL_ENV.filter((k) => !process.env[k])
  if (missingOptional.length > 0) {
    console.log(`ℹ Optional env vars not set: ${missingOptional.join(', ')} (Grok scoring disabled)`)
  }

  const date = process.env.PIPELINE_DATE ?? new Date().toISOString().split('T')[0]
  console.log(`📅 Date: ${date}`)
  const startTime = Date.now()

  // ── Stage 1: Fetch headlines ───────────────────────────────────────────────
  console.log('\n📡 Stage 1 — Fetching headlines...')
  let rawArticles
  try {
    rawArticles = await fetchAllHeadlines()
    console.log(`   Total: ${rawArticles.length} headlines from ${new Set(rawArticles.map((a) => a.outletId)).size} outlets`)
  } catch (err) {
    console.error(`❌ Fetch failed: ${err.message}`)
    await logError(null, `Fetch failed: ${err.message}`)
    process.exit(1)
  }

  if (rawArticles.length < 10) {
    const msg = `Too few headlines fetched (${rawArticles.length}) — aborting`
    console.error(`❌ ${msg}`)
    await logError(null, msg)
    process.exit(1)
  }

  // ── Stage 2+3: Cluster + score via Claude ─────────────────────────────────
  console.log('\n🤖 Stage 2+3 — Clustering and scoring with Claude...')
  let scoredArticles, clusters
  try {
    ;({ articles: scoredArticles, clusters } = await clusterAndScore(rawArticles))
  } catch (err) {
    console.error(`❌ Claude failed: ${err.message}`)
    await logError(null, `Claude failed: ${err.message}`, rawArticles.length)
    process.exit(1)
  }

  if (scoredArticles.length === 0) {
    const msg = 'Claude returned 0 scored articles'
    console.error(`❌ ${msg}`)
    await logError(null, msg, rawArticles.length)
    process.exit(1)
  }

  // ── Stage 4+5: Store in Supabase ──────────────────────────────────────────
  console.log('\n💾 Stage 4+5 — Writing to Supabase...')
  const elapsedSeconds = (Date.now() - startTime) / 1000
  try {
    await storeResults({ scoredArticles, clusters, date, elapsedSeconds })
  } catch (err) {
    console.error(`❌ Storage failed: ${err.message}`)
    await logError(null, `Storage failed: ${err.message}`, scoredArticles.length)
    process.exit(1)
  }

  // ── Stage 6: Daily social post (optional — requires X_* env) ──────────────
  console.log('\n📣 Stage 6 — Posting daily highlight to X...')
  try {
    await postDailyTweet(scoredArticles)
  } catch (err) {
    console.warn(`   ⚠ Social step error: ${err.message} — continuing`)
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n✅ Pipeline complete in ${totalElapsed}s`)
  console.log(`   ${scoredArticles.length} articles · ${clusters.length} clusters · ${new Set(scoredArticles.map((a) => a.outletId)).size} outlets`)
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err)
  process.exit(1)
})
