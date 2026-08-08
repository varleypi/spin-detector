-- Spin Detector — X auto-reply migration
-- Run in the Supabase SQL editor AFTER x_schema.sql. Additive and idempotent:
-- every statement is IF NOT EXISTS / OR REPLACE, safe to re-run.
--
-- Moves the X subsystem from "queue original posts for human approval" to
-- "auto-reply under viral outlet posts, audited after the fact".

-- ── x_posts: reply context ───────────────────────────────────────────────────
-- We now reply to someone else's tweet rather than posting standalone, so we
-- need to know what we replied to. reply_to_handle is the per-parent rate-limit
-- key (guardrails.js), so it is indexed alongside posted_at.
ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS reply_to_tweet_id TEXT;
ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS reply_to_handle   TEXT;
ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS reply_to_url      TEXT;

-- Which scored story cluster supplied the comparison, when format='comparison'.
-- Null for 'single' replies, which were scored standalone.
ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS cluster_id TEXT;

-- What the reply cost us in xAI spend, so the digest can report cost per post.
-- 0 for cluster-matched replies — those reuse the daily pipeline's scoring.
ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0;

-- format was 'original' | 'quote'; add the two reply shapes.
-- No CHECK constraint existed, so this is documentation rather than DDL:
--   'comparison' — multi-outlet spread from a matched cluster (the good one)
--   'single'     — standalone score of the replied-to post
--   'original'   — the daily standalone post from pipeline/social.js
COMMENT ON COLUMN x_posts.format IS
  'comparison | single | original | quote — see pipeline/x/compose.js';

-- Per-parent-per-day cap does a filtered count on (reply_to_handle, posted_at)
-- on every run, several times an hour.
CREATE INDEX IF NOT EXISTS idx_x_posts_parent_day
  ON x_posts (reply_to_handle, posted_at DESC);

-- ── x_candidates: audit trail for auto-posting ───────────────────────────────
-- Which cluster matched (if any), and how confidently. Lets you tune
-- CLUSTER_MATCH_THRESHOLD against real hits instead of guessing.
ALTER TABLE x_candidates ADD COLUMN IF NOT EXISTS cluster_id         TEXT;
ALTER TABLE x_candidates ADD COLUMN IF NOT EXISTS cluster_match_score NUMERIC(4,3);

-- The outlet the parent account maps to (pipeline/xHandles.js).
ALTER TABLE x_candidates ADD COLUMN IF NOT EXISTS outlet_id TEXT;

-- The exact text we published, kept on the candidate as well as x_posts so a
-- rejected/blocked candidate still shows what WOULD have gone out. This is what
-- makes dry-run mode useful for review.
ALTER TABLE x_candidates ADD COLUMN IF NOT EXISTS composed_text TEXT;
ALTER TABLE x_candidates ADD COLUMN IF NOT EXISTS reply_format  TEXT;

-- status gains 'blocked' — failed a guardrail rather than being low quality.
-- Kept distinct from 'skipped' so the digest can separate "we chose not to"
-- from "safety said no", which are very different signals when tuning.
-- status gains 'blocked' (failed a guardrail) and 'dry_run' (passed everything,
-- withheld only because X_AUTOPOST was off). Both are kept distinct from
-- 'skipped' so the digest can separate "we chose not to", "safety said no", and
-- "this is what we wanted to publish" — three very different signals.
COMMENT ON COLUMN x_candidates.status IS
  'discovered|prefiltered_out|scored|blocked|dry_run|posted|skipped|error';

-- ── x_runs: cost tracking ────────────────────────────────────────────────────
-- Per-run xAI spend, straight from usage.cost_in_usd_ticks. Without this you
-- cannot tell a cost regression from a busy news day.
ALTER TABLE x_runs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0;
ALTER TABLE x_runs ADD COLUMN IF NOT EXISTS posted   INTEGER DEFAULT 0;
ALTER TABLE x_runs ADD COLUMN IF NOT EXISTS blocked  INTEGER DEFAULT 0;
ALTER TABLE x_runs ADD COLUMN IF NOT EXISTS dry_run  BOOLEAN DEFAULT TRUE;
