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
// Columns written at discovery time. Explicit rather than spreading the whole
// candidate: later stages attach derived fields (cluster objects, composed text)
// that aren't columns, and a stray key makes PostgREST reject the whole batch.
const DISCOVERY_COLUMNS = [
  'tweet_id',
  'tweet_url',
  'author_handle',
  'author_name',
  'author_type',
  'author_followers',
  'text',
  'likes',
  'reposts',
  'replies',
  'quotes',
  'age_minutes',
  'velocity',
]

/**
 * Insert freshly discovered candidates. ON CONFLICT (tweet_id) we skip — a tweet
 * already seen in a prior run keeps its existing status/score. Returns inserted rows.
 */
async function insertCandidates(supabase, runId, candidates) {
  if (candidates.length === 0) return []
  const rows = candidates.map((c) => {
    const row = { run_id: runId, status: 'discovered' }
    for (const k of DISCOVERY_COLUMNS) if (c[k] !== undefined) row[k] = c[k]
    return row
  })
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

/**
 * Total xAI spend recorded today (UTC), across every run. Backs the hard daily
 * budget guard — the frequency that makes replies land early also multiplies
 * anything that goes wrong, so the ceiling is enforced, not assumed.
 *
 * Returns 0 (not Infinity) if the read fails: an unavailable cost history should
 * not silently halt posting for the rest of the day. The per-run caps still
 * bound the damage.
 */
async function getSpendToday(supabase) {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('x_runs')
    .select('cost_usd')
    .gte('created_at', since.toISOString())
  if (error) {
    console.warn(`   ⚠ spend-today read failed: ${error.message} — assuming $0`)
    return 0
  }
  return (data || []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)
}

// ── Posts ───────────────────────────────────────────────────────────────────
/**
 * Record a published reply. Deliberately tolerant: by the time this runs the
 * tweet is already public, so a DB failure must be logged loudly but must NOT
 * throw — losing the row is bad, but crashing the run and re-posting the same
 * reply on the next cron is worse.
 */
async function recordReplyPost(supabase, row) {
  const { error } = await supabase.from('x_posts').insert(row)
  if (error) {
    console.error(
      `   ‼ x_posts insert FAILED for live tweet ${row.tweet_id}: ${error.message}\n` +
        `     The reply IS published. Per-parent caps may be off until this is reconciled.`,
    )
    return false
  }
  return true
}

/** Posts published today (UTC), newest first — for the daily digest. */
async function getPostsToday(supabase) {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('x_posts')
    .select('*')
    .gte('posted_at', since.toISOString())
    .order('posted_at', { ascending: false })
  if (error) {
    console.warn(`   ⚠ posts-today read failed: ${error.message}`)
    return []
  }
  return data || []
}

/** Candidates from today that were considered but not posted — digest input. */
async function getSkippedToday(supabase) {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('x_candidates')
    .select('author_handle, text, status, status_note, bias_score, prefilter_score')
    .gte('created_at', since.toISOString())
    .in('status', ['blocked', 'skipped', 'prefiltered_out', 'error'])
  if (error) {
    console.warn(`   ⚠ skipped-today read failed: ${error.message}`)
    return []
  }
  return data || []
}

/**
 * Replies that cleared every guardrail and were fully composed, but weren't
 * published because the run was a dry run.
 *
 * This is the whole point of dry-run mode: these are the posts that WOULD have
 * gone out. They live on x_candidates (not x_posts, which only records real
 * tweets), so the digest has to ask for them separately.
 */
async function getDryRunToday(supabase) {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('x_candidates')
    .select('author_handle, tweet_url, text, composed_text, reply_format, bias_score, cluster_id, created_at')
    .gte('created_at', since.toISOString())
    .eq('status', 'dry_run')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn(`   ⚠ dry-run read failed: ${error.message}`)
    return []
  }
  return data || []
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
  recordReplyPost,
  getPostsToday,
  getSkippedToday,
  getDryRunToday,
  getSpendToday,
}
