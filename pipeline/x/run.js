/**
 * X Auto-Reply Pipeline — orchestrator.
 *
 * Stages: discover → rank → dedupe → match clusters → score (only what's left)
 *         → guardrails → compose → reply.
 *
 * Design notes worth keeping in mind when editing:
 *
 *  • WE REPLY, WE DON'T BROADCAST. A standalone post from a small account
 *    reaches nobody; a reply inherits the parent post's audience. Everything
 *    upstream exists to find a parent worth replying under.
 *
 *  • SPEED IS THE PRODUCT. Reply placement decays fast, so this runs often and
 *    posts without waiting for a human. That is only defensible because
 *    guardrails.js is deterministic and fails closed — read it before loosening
 *    anything here.
 *
 *  • COST DISCIPLINE. Discovery (grok-4.5 agentic x_search) is ~95% of spend.
 *    It runs once per run at reasoning effort 'low' over a fixed handle list.
 *    Scoring is skipped entirely when a candidate matches a story the daily
 *    pipeline already scored. Every run logs its actual USD.
 *
 * Usage:  node pipeline/x/run.js          (dry run unless X_AUTOPOST=on)
 *         node pipeline/x/run.js --live   (force live, ignores X_AUTOPOST)
 *         node pipeline/x/run.js --dry    (force dry run)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') })

const { discoverCandidates } = require('./discover')
const { prefilterCandidates } = require('./prefilter')
const { scoreCandidates } = require('./score')
const { dedupeStories } = require('./dedupe')
const { attachClusters } = require('./clusters')
const { cfg, loadPostingState, checkCandidate, recordReply } = require('./guardrails')
const { composeReply } = require('./compose')
const { postReply, indent } = require('./post')
const { callCost } = require('./grok')
const {
  getSupabase,
  createRun,
  finishRun,
  logRunError,
  insertCandidates,
  updateCandidate,
  expireStaleCandidates,
  getRecentTexts,
  recordReplyPost,
  getSpendToday,
} = require('./db')
const { annotate, isXaiBillingError, XAI_BILLING_HINT } = require('../alerts')

const REQUIRED_ENV = ['XAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']

// "Couldn't run, but nothing is broken" — the workflow maps it to a skip.
const EXIT_BILLING_SKIP = 78

/** Resolve dry-run: CLI flags beat env, env defaults to dry. */
function resolveDryRun() {
  if (process.argv.includes('--live')) return false
  if (process.argv.includes('--dry')) return true
  return !cfg.autopost()
}

async function main() {
  const dryRun = resolveDryRun()

  console.log('\n🐦 SPIN DETECTOR — X AUTO-REPLY PIPELINE')
  console.log('═'.repeat(48))
  console.log(dryRun ? '   MODE: dry run (nothing will be published)' : '   MODE: LIVE — replies will publish')

  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }

  const supabase = getSupabase()
  const startTime = Date.now()
  let runId = null
  let costUsd = 0

  try {
    // ── Stage 0a: Daily spend guard ────────────────────────────────────────
    // Checked BEFORE createRun so a budget-stopped day costs nothing at all.
    // Discovery is the expensive call and it's the very next thing we'd do.
    const budget = Number(process.env.DAILY_COST_BUDGET_USD) || 1.0
    const spentToday = await getSpendToday(supabase)
    if (spentToday >= budget) {
      console.log(
        `\n💰 Daily xAI budget reached: $${spentToday.toFixed(4)} / $${budget.toFixed(2)}.` +
          `\n   Stopping before discovery. Raise DAILY_COST_BUDGET_USD to spend more.`,
      )
      return
    }
    console.log(`   Budget: $${spentToday.toFixed(4)} / $${budget.toFixed(2)} spent today`)

    runId = await createRun(supabase, 'full')

    // ── Stage 0: Expire stale candidates ───────────────────────────────────
    const staleHours = Number(process.env.CANDIDATE_EXPIRY_HOURS) || 6
    const expired = await expireStaleCandidates(supabase, staleHours)
    if (expired > 0) console.log(`\n🧹 Expired ${expired} stale candidate(s) older than ${staleHours}h`)

    // ── Stage 1: Discover ──────────────────────────────────────────────────
    console.log('\n📡 Stage 1 — Discovering candidates...')
    const { candidates: discovered, usage: discoveryUsage } = await discoverCandidates()
    costUsd += callCost(discoveryUsage).usd

    const insertedRows = await insertCandidates(supabase, runId, discovered)
    // insertCandidates returns DB rows, which don't carry the fields we derived
    // locally (outlet_id). Re-attach them so downstream stages keep the mapping.
    const byTweetId = new Map(discovered.map((c) => [c.tweet_id, c]))
    const inserted = insertedRows.map((r) => ({
      ...r,
      outlet_id: byTweetId.get(r.tweet_id)?.outlet_id ?? null,
    }))
    console.log(`   ${inserted.length} new (${discovered.length - inserted.length} already seen)`)

    if (inserted.length === 0) {
      console.log('\n✓ Nothing new this run.')
      await finishRun(supabase, runId, {
        discovered: discovered.length,
        cost_usd: round6(costUsd),
        dry_run: dryRun,
        elapsed_seconds: (Date.now() - startTime) / 1000,
      })
      console.log(`\n💰 Run cost: $${costUsd.toFixed(4)}`)
      return
    }

    // ── Stage 2: Rank (no model) ───────────────────────────────────────────
    console.log('\n🚦 Stage 2 — Virality ranking...')
    const { survivors, dropped } = await prefilterCandidates(inserted)
    for (const c of dropped) {
      await updateCandidate(supabase, c.id, {
        status: 'prefiltered_out',
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        status_note: c.prefilter_reason,
      })
    }

    // ── Stage 2b: Story dedup ──────────────────────────────────────────────
    console.log('\n🧬 Stage 2b — Story dedup...')
    const priorTexts = await getRecentTexts(supabase, 24)
    const { unique, duplicates } = dedupeStories(survivors, priorTexts)
    for (const c of duplicates) {
      await updateCandidate(supabase, c.id, {
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        status: 'skipped',
        status_note: 'duplicate story already handled',
      })
    }
    console.log(`   ✓ ${unique.length} distinct (${duplicates.length} duplicates skipped)`)

    // ── Stage 3: Match already-scored clusters (free) ──────────────────────
    console.log('\n🔗 Stage 3 — Matching scored story clusters...')
    const withClusters = await attachClusters(supabase, unique)

    // ── Stage 4: Score only what has no cluster ────────────────────────────
    console.log('\n🧮 Stage 4 — Bias scoring (only where needed)...')
    const { scored, costUsd: scoreCost } = await scoreCandidates(supabase, withClusters)
    costUsd += scoreCost

    // ── Stage 5: Guardrails → compose → reply ──────────────────────────────
    console.log('\n🛡  Stage 5 — Guardrails and posting...')
    const state = await loadPostingState(supabase)
    console.log(
      `   Posted today: ${state.postedToday === Infinity ? '?' : state.postedToday}/${cfg.dailyCap()}`,
    )

    // Best candidates first, so the daily cap is spent on the strongest ones.
    // A cluster match beats a bare score at equal virality — it makes a far
    // better reply.
    const ordered = [...scored].sort((a, b) => {
      const rank = (c) => (c.cluster ? 1 : 0)
      if (rank(b) !== rank(a)) return rank(b) - rank(a)
      return (b.prefilter_score || 0) - (a.prefilter_score || 0)
    })

    let posted = 0
    let blocked = 0

    for (const c of ordered) {
      const patch = {
        prefilter_score: c.prefilter_score,
        prefilter_reason: c.prefilter_reason,
        content_hash: c.content_hash || null,
        outlet_id: c.outlet_id || null,
        bias_score: c.bias_score ?? null,
        bias_signals: c.bias_signals || [],
        rationale: c.rationale || null,
        score_model: c.score_model || null,
        cluster_id: c.cluster?.clusterId || null,
        cluster_match_score: c.cluster?.matchScore ?? null,
      }

      const verdict = checkCandidate(c, state)
      if (!verdict.ok) {
        blocked++
        await updateCandidate(supabase, c.id, {
          ...patch,
          status: 'blocked',
          status_note: verdict.reason,
        })
        console.log(`   ⛔ @${c.author_handle}: ${verdict.reason}`)
        continue
      }

      const composed = composeReply(c)
      if (!composed) {
        blocked++
        await updateCandidate(supabase, c.id, {
          ...patch,
          status: 'skipped',
          status_note: 'could not compose a reply within 280 chars',
        })
        continue
      }

      // ── Publish ──────────────────────────────────────────────────────────
      try {
        const { tweetId } = await postReply({
          text: composed.text,
          inReplyToTweetId: c.tweet_id,
          dryRun,
        })

        // Update in-run state BEFORE the DB write: the tweet is already out,
        // and the caps must hold even if persistence fails. Done in dry run too,
        // so a dry run's counts match what a live run would actually have done
        // — otherwise it would "post" three replies to one outlet and look fine.
        recordReply(state, c.author_handle)

        if (!dryRun) {
          await recordReplyPost(supabase, {
            candidate_id: c.id,
            tweet_id: tweetId,
            format: composed.format,
            image_used: false,
            text: composed.text,
            reply_to_tweet_id: c.tweet_id,
            reply_to_handle: c.author_handle,
            reply_to_url: c.tweet_url,
            cluster_id: c.cluster?.clusterId || null,
            cost_usd: c.cluster ? 0 : round6(scoreCost / Math.max(1, scored.length)),
          })
          console.log(`   ✅ Replied to @${c.author_handle} (${composed.format}) → ${tweetId}`)
          console.log(indent(composed.text))
        }

        // 'dry_run' is its own status, not 'skipped'. These cleared every gate
        // and differ from a skip in the only way that matters: they're what the
        // system wanted to publish. The digest reads them as the review surface,
        // and keeping them distinct stops them polluting the "stopped, and why"
        // histogram used to tune the guardrails.
        await updateCandidate(supabase, c.id, {
          ...patch,
          status: dryRun ? 'dry_run' : 'posted',
          status_note: dryRun ? 'passed all guardrails — withheld (dry run)' : null,
          composed_text: composed.text,
          reply_format: composed.format,
        })
        posted++
      } catch (err) {
        // Leave it recoverable — the next run can retry if it's still fresh.
        await updateCandidate(supabase, c.id, {
          ...patch,
          status: 'error',
          status_note: `post failed: ${err.message}`,
          composed_text: composed.text,
          reply_format: composed.format,
        })
        console.error(`   ❌ Reply to @${c.author_handle} failed: ${err.message}`)
      }
    }

    const elapsed = (Date.now() - startTime) / 1000
    await finishRun(supabase, runId, {
      status: 'success',
      discovered: discovered.length,
      prefiltered: unique.length,
      scored: scored.filter((c) => c.bias_score != null).length,
      queued: posted,
      posted,
      blocked,
      cost_usd: round6(costUsd),
      dry_run: dryRun,
      elapsed_seconds: elapsed,
    })

    console.log('\n' + '═'.repeat(48))
    console.log(
      `✓ Done in ${elapsed.toFixed(1)}s — ${posted} ${dryRun ? 'would post' : 'replied'}, ${blocked} blocked.`,
    )
    console.log(`💰 Run cost: $${costUsd.toFixed(4)}`)
  } catch (err) {
    await logRunError(supabase, runId, err.message)

    // Out of xAI credits is a standing condition, not a break: every model call
    // here runs on Grok, so there is nothing to retry and nothing to fix in code
    // until the account is topped up. Exit 78 so the workflow reports "skipped"
    // rather than turning red on every run and training you to ignore it.
    if (isXaiBillingError(err)) {
      console.warn(`\n⏸ Pipeline skipped: ${err.message}`)
      annotate('warning', 'X auto-reply skipped — xAI out of credits', XAI_BILLING_HINT)
      process.exit(EXIT_BILLING_SKIP)
    }

    console.error(`\n❌ Pipeline failed: ${err.message}`)
    process.exit(1)
  }
}

const round6 = (n) => Math.round(n * 1e6) / 1e6

main()
