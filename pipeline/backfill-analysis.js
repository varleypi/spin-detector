/**
 * One-off backfill — write an original analysis for every existing story that
 * doesn't have one yet.
 *
 * The nightly pipeline only ever generates analysis for "today", but ~250 story
 * pages from the previous days are already live and thin. This walks the stored
 * clusters, rebuilds each one's articles from the `articles` table, generates a
 * grounded analysis (via ./analyze), and UPDATEs the cluster row in place — no
 * clearDay, nothing deleted, and clusters that already have an analysis are
 * skipped, so it is safe to re-run.
 *
 * Usage:
 *   node pipeline/backfill-analysis.js                 # dry run — counts only
 *   node pipeline/backfill-analysis.js --apply         # generate + write
 *   node pipeline/backfill-analysis.js --apply --days=14
 *   node pipeline/backfill-analysis.js --apply --limit=20   # cap this run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')
const { OUTLETS } = require('./outlets')
const { analyzeCluster } = require('./analyze')

const APPLY = process.argv.includes('--apply')
const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`))
  return m ? Number(m.split('=')[1]) : def
}
const DAYS = arg('days', 60)
const LIMIT = arg('limit', Infinity)

function getSupabase() {
  const ws = require('ws')
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    realtime: { transport: ws },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function main() {
  console.log('\n✍️  BACKFILL STORY ANALYSIS')
  console.log('═'.repeat(52))
  console.log(APPLY ? '⚠  APPLY — analyses will be generated and written' : 'ℹ  Dry run — pass --apply to generate and write')
  const model = process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-6' : process.env.XAI_API_KEY ? 'grok-3-mini' : 'NONE'
  console.log(`   model: ${model}   lookback: ${DAYS} days   limit: ${LIMIT === Infinity ? 'none' : LIMIT}\n`)

  if (model === 'NONE') throw new Error('No model key set (need ANTHROPIC_API_KEY or XAI_API_KEY in .env.local)')

  const supabase = getSupabase()
  const since = new Date()
  since.setDate(since.getDate() - DAYS)
  const sinceStr = since.toISOString().split('T')[0]

  // Pull clusters missing an analysis, newest first (recent pages matter most).
  const { data: clusters, error } = await supabase
    .from('story_clusters')
    .select('id, date, cluster_id, topic_label, analysis')
    .gte('date', sinceStr)
    .or('analysis.is.null,analysis.eq.')
    .order('date', { ascending: false })

  if (error) throw new Error(`story_clusters query failed: ${error.message}`)

  const todo = (clusters ?? []).slice(0, LIMIT === Infinity ? undefined : LIMIT)
  console.log(`${clusters?.length ?? 0} cluster(s) without analysis since ${sinceStr}; processing ${todo.length}.\n`)

  if (todo.length === 0) {
    console.log('✅ Nothing to backfill.')
    return
  }

  if (!APPLY) {
    // Show what would be done, grouped by date.
    const byDate = {}
    for (const c of clusters ?? []) byDate[c.date] = (byDate[c.date] ?? 0) + 1
    for (const [d, n] of Object.entries(byDate).sort().reverse()) {
      console.log(`  ${d}  ${n} stor${n === 1 ? 'y' : 'ies'}`)
    }
    console.log(`\nDry run — re-run with --apply to generate ${todo.length} analyses using ${model}.`)
    return
  }

  let done = 0
  let failed = 0
  for (const c of todo) {
    // Rebuild the cluster's articles from the articles table for that date.
    const { data: arts, error: ae } = await supabase
      .from('articles')
      .select('outlet_id, outlet_name, headline, bias_score, bias_signals, bias_score_grok, bias_signals_grok')
      .eq('date', c.date)
      .eq('cluster_id', c.cluster_id)

    if (ae) {
      console.warn(`  ⚠ [${c.date}] ${c.topic_label}: articles query failed (${ae.message})`)
      failed++
      continue
    }
    if (!arts || arts.length < 2) {
      console.log(`  ⏭ [${c.date}] ${c.topic_label}: only ${arts?.length ?? 0} article(s) — skipping`)
      continue
    }

    const cluster = {
      clusterId: c.cluster_id,
      topicLabel: c.topic_label,
      date: c.date,
      articles: arts.map((a) => ({
        outletName: a.outlet_name ?? OUTLETS[a.outlet_id]?.name ?? a.outlet_id,
        headline: a.headline,
        biasScore: a.bias_score,
        biasSignals: a.bias_signals ?? [],
        biasScoreGrok: a.bias_score_grok,
        biasSignalsGrok: a.bias_signals_grok ?? [],
      })),
    }

    try {
      const result = await analyzeCluster(cluster)
      if (!result) {
        failed++
        continue
      }
      const { error: ue } = await supabase
        .from('story_clusters')
        .update({ analysis: result.analysis, analysis_model: result.model, analysis_at: new Date().toISOString() })
        .eq('id', c.id)

      if (ue) {
        console.warn(`  ⚠ [${c.date}] ${c.topic_label}: update failed (${ue.message})`)
        failed++
        continue
      }
      done++
      const preview = result.analysis.slice(0, 70).replace(/\s+/g, ' ')
      console.log(`  ✓ [${c.date}] ${c.topic_label}\n      ${preview}…`)
    } catch (err) {
      console.warn(`  ⚠ [${c.date}] ${c.topic_label}: ${err.message}`)
      failed++
    }
  }

  console.log(`\n✅ Wrote ${done} analyses` + (failed ? `, ${failed} failed/skipped` : ''))
}

main().catch((err) => {
  console.error('\n💥 Backfill failed:', err.message)
  process.exit(1)
})
