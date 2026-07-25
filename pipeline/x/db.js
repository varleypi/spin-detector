/**
 * Supabase persistence for the X viral-scoring pipeline.
 * Same client setup as pipeline/store.js (service key, ws transport).
 */

const { createClient } = require('@supabase/supabase-js')

function getSupabase() {
  const ws = require('ws')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    realtime: { transport: ws },
  })
}

// ── Runs ────────────────────────────────────────────────────────────────────
async function createRun(supabase, stage = 'full') {
  const { data, error } = await supabase
    .from('x_runs')
    .insert({ stage, status: 'success' })
    .select('id')
    .single()
  if (error) throw new Error(`x_runs insert failed: ${error.message}`)
  return data.id
}

async function finishRun(supabase, runId, patch) {
  const { error } = await supabase.from('x_runs').update(patch).eq('id', runId)
  if (error) console.warn(`   ⚠ x_runs update failed: ${error.message}`)
}

async function logRunError(supabase, runId, message) {
  if (!runId) return
  await supabase.from('x_runs').update({ status: 'error', error_message: message }).eq('id', runId)
}

// ── Candidates ──────────────────────────────────────────────────────────────
/**
 * Insert freshly discovered candidates. ON CONFLICT (tweet_id) we skip — a tweet
 * already seen in a prior run keeps its existing status/score. Returns inserted rows.
 */
async function insertCandidates(supabase, runId, candidates) {
  if (candidates.length === 0) return []
  const rows = candidates.map((c) => ({ ...c, run_id: runId, status: 'discovered' }))
  const { data, error } = await supabase
    .from('x_candidates')
    .upsert(rows, { onConflict: 'tweet_id', ignoreDuplicates: true })
    .select('*')
  if (error) throw new Error(`x_candidates insert failed: ${error.message}`)
  return data || []
}

async function updateCandidate(supabase, id, patch) {
  const { error } = await supabase.from('x_candidates').update(patch).eq('id', id)
  if (error) console.warn(`   ⚠ x_candidates ${id} update failed: ${error.message}`)
}

/**
 * Expire candidates that have sat unreviewed too long. News goes stale fast —
 * posting a spin score on a 20-hour-old tweet reads as out-of-touch, and a queue
 * full of dead items makes review a chore. Runs at the START of every run.
 */
async function expireStaleCandidates(supabase, hours = 12) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('x_candidates')
    .update({ status: 'skipped', status_note: `expired unreviewed after ${hours}h` })
    .eq('status', 'pending_review')
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.warn(`   ⚠ expiry sweep failed: ${error.message}`)
    return 0
  }
  return (data || []).length
}

/**
 * Texts of candidates recently queued or posted — used for cross-run story dedup
 * so we don't queue today's story again tomorrow under different wording.
 */
async function getRecentTexts(supabase, hours = 48) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('x_candidates')
    .select('text')
    .in('status', ['pending_review', 'approved', 'posted'])
    .gte('created_at', since)
  if (error) {
    console.warn(`   ⚠ recent-text lookup failed: ${error.message}`)
    return []
  }
  return (data || []).map((r) => r.text).filter(Boolean)
}

// ── Score cache ─────────────────────────────────────────────────────────────
async function getCachedScores(supabase, hashes) {
  if (hashes.length === 0) return new Map()
  const { data, error } = await supabase
    .from('x_score_cache')
    .select('*')
    .in('content_hash', hashes)
  if (error) {
    console.warn(`   ⚠ x_score_cache read failed: ${error.message}`)
    return new Map()
  }
  return new Map((data || []).map((r) => [r.content_hash, r]))
}

async function putCachedScore(supabase, row) {
  const { error } = await supabase
    .from('x_score_cache')
    .upsert(row, { onConflict: 'content_hash' })
  if (error) console.warn(`   ⚠ x_score_cache write failed: ${error.message}`)
}

module.exports = {
  getSupabase,
  createRun,
  finishRun,
  logRunError,
  insertCandidates,
  updateCandidate,
  expireStaleCandidates,
  getRecentTexts,
  getCachedScores,
  putCachedScore,
}
