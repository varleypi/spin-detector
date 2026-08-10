/**
 * Safety gates for auto-posted replies.
 *
 * Nothing here asks a model for a judgement call. Every gate is a deterministic
 * check you can read, predict, and audit after the fact — which is the trade
 * that makes unattended posting acceptable at all. When a gate is ambiguous it
 * BLOCKS. A missed reply costs nothing; a bad one under a breaking-tragedy post
 * is the kind of thing that ends an account.
 *
 * Order matters: cheapest and most absolute checks first.
 */

const { isReplyTarget } = require('../xHandles')

// ── Topic blocklist ─────────────────────────────────────────────────────────
// Replying "here's our bias score" under a mass-casualty or grief story is
// indefensible regardless of how good the score is.
//
// Grouped rather than one flat list because the groups differ in how much
// legitimate coverage they cost you. `harm` and `victims` are near-free to
// block — you lose almost no media-criticism material. `legal` is expensive:
// indictment coverage is where spin runs highest and it's squarely fair game
// for public figures, but the wording can't tell a senator from a private
// defendant, so it ships blocked. Relax it with X_TOPIC_GROUPS once you've
// watched the digest for a week and trust the rest of the stack.
const TOPIC_GROUPS = {
  // Death, mass casualty, violence.
  harm: [
    /\b(dead|dies|died|death|deaths|killed|killing|fatal|fatalities|casualt\w*)\b/i,
    /\b(shooting|shooter|gunman|massacre|stabbing|manhunt)\b/i,
    /\b(terror\w*|bombing|explosion|airstrike|hostage)\b/i,
    /\b(crash|derail\w*|collapse[ds]?)\b.*\b(kill\w*|dead|victim)/i,
  ],
  // Grief, memorial, disaster in progress.
  grief: [
    /\b(funeral|memorial|mourn\w*|obituary|tribute|rest in peace|passed away)\b/i,
    /\b(earthquake|hurricane|wildfire|tornado|tsunami|evacuat\w*)\b/i,
  ],
  // Abuse, exploitation, self-harm, missing persons. Never a bias-score moment.
  victims: [
    /\b(rape|raped|sexual assault|abuse[ds]?|trafficking|molest\w*|groom(ing|ed))\b/i,
    /\b(suicide|self-harm|overdose)\b/i,
    /\b(missing (child|girl|boy|woman|man|person)|amber alert|kidnap\w*)\b/i,
  ],
  // Individual health emergencies.
  health: [/\b(hospitali[sz]ed|critical condition|in surgery|diagnos\w* with)\b/i],
  // Active legal jeopardy. Costly to block — see note above.
  legal: [/\b(indicted|arraigned|pleads? guilty|sentenced to)\b/i],
}

const DEFAULT_TOPIC_GROUPS = ['harm', 'grief', 'victims', 'health', 'legal']

/** Active groups, from X_TOPIC_GROUPS (comma-separated) or the default set. */
function activeGroups() {
  const raw = process.env.X_TOPIC_GROUPS
  if (!raw) return DEFAULT_TOPIC_GROUPS
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((g) => Object.prototype.hasOwnProperty.call(TOPIC_GROUPS, g))
}

/** Name of the first blocked group this text trips, or null. */
function blockedTopic(text) {
  const t = String(text || '')
  for (const group of activeGroups()) {
    if (TOPIC_GROUPS[group].some((re) => re.test(t))) return group
  }
  return null
}

// ── Config ──────────────────────────────────────────────────────────────────
const cfg = {
  /** Master switch. Anything other than 'on' means compose + log, never publish. */
  autopost: () => (process.env.X_AUTOPOST || 'off').toLowerCase() === 'on',
  dailyCap: () => Number(process.env.DAILY_POST_CAP) || 8,
  perParentPerDay: () => Number(process.env.MAX_REPLIES_PER_PARENT_DAY) || 1,
  /** Minimum reach for a reply to be worth a slot. */
  minFollowers: () => Number(process.env.MIN_PARENT_FOLLOWERS) || 50000,
  /** Don't reply under something already past its peak. */
  maxAgeMinutes: () => Number(process.env.MAX_PARENT_AGE_MINUTES) || 180,
  /** Minimum |score − 5| for a single-post (non-cluster) reply to be worth posting. */
  minSpin: () => Number(process.env.MIN_SPIN_THRESHOLD) || 1.0,
  /**
   * Minimum left-to-right spread for a comparison reply. Below this the
   * outlets agreed, and "they all worded it the same" is not a post.
   */
  minClusterGap: () => Number(process.env.MIN_CLUSTER_GAP) || 1.5,
}

// ── Per-run state from the DB ───────────────────────────────────────────────
/**
 * Everything the gates need to know about what we've already posted today,
 * fetched once per run. `today` is UTC — same boundary the daily cap uses.
 */
async function loadPostingState(supabase) {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('x_posts')
    .select('reply_to_handle, posted_at')
    .gte('posted_at', since.toISOString())

  if (error) {
    // Fail CLOSED: if we can't tell how many we've posted, don't post more.
    console.warn(`   ⚠ posting-state read failed: ${error.message} — blocking posts this run`)
    return { postedToday: Infinity, perParent: new Map(), degraded: true }
  }

  const perParent = new Map()
  for (const row of data || []) {
    const h = String(row.reply_to_handle || '').toLowerCase()
    if (h) perParent.set(h, (perParent.get(h) || 0) + 1)
  }
  return { postedToday: (data || []).length, perParent, degraded: false }
}

/**
 * Can we reply to this candidate right now? Returns {ok:true} or
 * {ok:false, reason}. `reason` is stored on the candidate so the daily digest
 * explains every skip.
 */
function checkCandidate(candidate, state) {
  const c = candidate

  // 1. Parent must be a tracked outlet institution.
  if (!isReplyTarget(c.author_handle)) {
    return { ok: false, reason: `@${c.author_handle} is not an approved reply target` }
  }

  // 2. Topic blocklist — checked against the parent's text.
  const blocked = blockedTopic(c.text)
  if (blocked) {
    return { ok: false, reason: `blocked topic group '${blocked}'` }
  }

  // 3. Reach floor.
  const followers = c.author_followers || 0
  if (followers < cfg.minFollowers()) {
    return { ok: false, reason: `parent reach ${followers} below ${cfg.minFollowers()}` }
  }

  // 4. Freshness — a reply under a 4-hour-old post is invisible.
  const age = c.age_minutes || 0
  if (age > cfg.maxAgeMinutes()) {
    return { ok: false, reason: `parent is ${age}m old (max ${cfg.maxAgeMinutes()}m)` }
  }

  // 5. Daily cap.
  if (state.postedToday >= cfg.dailyCap()) {
    return { ok: false, reason: `daily cap reached (${state.postedToday}/${cfg.dailyCap()})` }
  }

  // 6. Don't stack replies on one outlet — that's what reads as harassment
  //    rather than analysis, and it's what gets an account reported.
  const parentCount = state.perParent.get(String(c.author_handle).toLowerCase()) || 0
  if (parentCount >= cfg.perParentPerDay()) {
    return {
      ok: false,
      reason: `already replied to @${c.author_handle} ${parentCount}× today`,
    }
  }

  // 7. Substance — does this reply actually say anything?
  //
  //    Originally this waived the check whenever a cluster matched, on the
  //    assumption that a spread is inherently interesting. It isn't: a cluster
  //    where every outlet scored neutral produces "CNN +0.0 · Metro +0.0 ·
  //    Sky +0.0", which was composed for real on 2026-08-10. That reply asserts
  //    nothing, and posting it under a viral story is worse than staying quiet
  //    — it's the exact "pointless bot" impression the whole format exists to
  //    avoid. So a comparison now needs a real gap between the ends.
  const clusterGap = c.cluster ? Number(c.cluster.gap) || 0 : null
  const hasComparison = clusterGap !== null && clusterGap >= cfg.minClusterGap()
  if (!hasComparison) {
    if (clusterGap !== null && c.bias_score == null) {
      return {
        ok: false,
        reason: `cluster spread ${clusterGap.toFixed(1)} below ${cfg.minClusterGap()} — nothing to show`,
      }
    }
    if (c.bias_score == null) return { ok: false, reason: 'no score available' }
    const spin = Math.abs(c.bias_score - 5)
    if (spin < cfg.minSpin()) {
      return { ok: false, reason: `spin ${spin.toFixed(1)} below ${cfg.minSpin()}` }
    }
  }

  return { ok: true }
}

/**
 * Record a reply against the in-memory state so later candidates in the SAME run
 * see it. Without this, one run could fire three replies at one outlet.
 */
function recordReply(state, handle) {
  const h = String(handle).toLowerCase()
  state.postedToday += 1
  state.perParent.set(h, (state.perParent.get(h) || 0) + 1)
}

module.exports = {
  cfg,
  blockedTopic,
  loadPostingState,
  checkCandidate,
  recordReply,
  TOPIC_GROUPS,
  DEFAULT_TOPIC_GROUPS,
  activeGroups,
}
