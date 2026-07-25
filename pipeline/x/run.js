/**
 * X Viral-Scoring Pipeline — orchestrator (Phase 1).
 *
 * Stages: discover → pre-filter → score → queue for human approval.
 * Writes everything to Supabase; the /admin/x-queue UI (Phase 1 next) picks up
 * rows at status='pending_review'. Nothing is posted here — posting is a
 * human-approved action.
 *
 * Usage:  node pipeline/x/run.js
 * Scheduled via GitHub Actions 2–4×/day.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') })

const { discoverCandidates } = require('./discover')
const { prefilterCandidates } = require('./prefilter')
const { scoreCandidates } = require('./score')
const { dedupeStories } = require('./dedupe')
const {
  getSupabase,
  createRun,
  finishRun,
  logRunError,
  insertCandidates,
  updateCandidate,
  expireStaleCandidates,
  getRecentTexts,
} = require('./db')

// Only queue items with a real, nameable lean. A "+0.0, no spin detected" post is
// not worth a slot in a 3–4/day budget. Distance from 5.0 on the 0–10 scale.
const MIN_SPIN = () => Number(process.env.MIN_SPIN_THRESHOLD) || 1.0

const REQUIRED_ENV = ['XAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']

async function main() {
  console.log('\n🐦 SPIN DETECTOR — X VIRAL SCORING PIPELINE')
  console.log('═'.repeat(48))

  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }

  const supabase = getSupabase()
  const startTime = Date.now()
  let runId = null

  try {
    runId = await createRun(supabase, 'full')

    // ── Stage 0: Expire stale queue items ──────────────────────────────────────
    const staleHours = Number(process.env.CANDIDATE_EXPIRY_HOURS) || 12
    const expired = await expireStaleCandidates(supabase, staleHours)
    if (expired > 0) console.log(`\n🧹 Expired ${expired} unreviewed candidate(s) older than ${staleHours}h`)

    // ── Stage 1: Discover ──────────────────────────────────────────────────────
    console.log('\n📡 Stage 1 — Discovering candidates...')
    const discovered = await discoverCandidates()
    const inserted = await insertCandidates(supabase, runId, discovered)
    console.log(`   ${inserted.length} new candidates persisted (${discovered.length - inserted.length} already seen)`)

    if (inserted.length === 0) {
      console.log('\n✓ No new candidates this run.')
      await finishRun(supabase, runId, {
        discovered: discovered.length,
        elapsed_seconds: (Date.now() - startTime) / 1000,
      })
      return
    }

    // ── Stage 2: Pre-filter ────────────────────────────────────────────────────
    console.log('\n🚦 Stage 2 — Virality pre-filter...')
    const { survivors, dropped } = await prefilterCandidates(inserted)
    for (const c of dropped) {
      await updateCandidate(supabase, c.id, {
        status: 'prefiltered_out',
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        status_note: c.prefilter_reason,
      })
    }

    // ── Stage 2b: Story dedup ──────────────────────────────────────────────────
    // Collapse "same event, different wording" before we pay to score it.
    console.log('\n🧬 Stage 2b — Story dedup...')
    const priorTexts = await getRecentTexts(supabase, 48)
    const { unique, duplicates } = dedupeStories(survivors, priorTexts)
    for (const c of duplicates) {
      await updateCandidate(supabase, c.id, {
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        status: 'skipped',
        status_note: 'duplicate story already queued/posted',
      })
    }
    console.log(`   ✓ ${unique.length} distinct stories (${duplicates.length} duplicates skipped)`)

    // ── Stage 3: Score ─────────────────────────────────────────────────────────
    console.log('\n🧮 Stage 3 — Bias scoring...')
    const scored = await scoreCandidates(supabase, unique)
    let queued = 0
    let tooNeutral = 0
    for (const c of scored) {
      const hasScore = c.bias_score != null
      // Gate on spin magnitude — neutral items are archived, not queued.
      const spin = hasScore ? Math.abs(c.bias_score - 5) : 0
      const postable = hasScore && spin >= MIN_SPIN()
      if (hasScore && !postable) tooNeutral++

      await updateCandidate(supabase, c.id, {
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        content_hash: c.content_hash,
        bias_score: c.bias_score,
        bias_signals: c.bias_signals || [],
        rationale: c.rationale || null,
        score_model: c.score_model || null,
        status: !hasScore ? 'error' : postable ? 'pending_review' : 'skipped',
        status_note: !hasScore
          ? 'scoring returned no value'
          : postable
            ? null
            : `below spin threshold (${spin.toFixed(1)} < ${MIN_SPIN()})`,
      })
      if (postable) queued++
    }
    if (tooNeutral) console.log(`   ↓ ${tooNeutral} skipped as too neutral (< ±${MIN_SPIN()})`)

    const elapsed = (Date.now() - startTime) / 1000
    await finishRun(supabase, runId, {
      status: 'success',
      discovered: discovered.length,
      prefiltered: unique.length,
      scored: scored.filter((c) => c.bias_score != null).length,
      queued,
      elapsed_seconds: elapsed,
    })

    console.log('\n' + '═'.repeat(48))
    console.log(`✓ Done in ${elapsed.toFixed(1)}s — ${queued} candidates queued for review.`)
    console.log('  Review at /admin/x-queue')
  } catch (err) {
    console.error(`\n❌ Pipeline failed: ${err.message}`)
    await logRunError(supabase, runId, err.message)
    process.exit(1)
  }
}

main()
