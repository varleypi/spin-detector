-- Spin Detector — X (Twitter) Viral Headline Scoring Schema
-- Run in the Supabase SQL editor AFTER schema.sql. Additive: `x_`-prefixed, no collisions.
-- Conventions match schema.sql: 0–10 internal bias scale (NUMERIC(4,2)), RLS public-read /
-- service-role write. See docs/x-viral-scoring-design.md §3.

-- ── X Runs ────────────────────────────────────────────────────────────────────
-- Audit log of every discovery/scoring run (mirrors pipeline_runs).
CREATE TABLE IF NOT EXISTS x_runs (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  stage            TEXT    NOT NULL DEFAULT 'full',   -- 'discover'|'prefilter'|'score'|'full'
  status           TEXT    NOT NULL,                  -- 'success' | 'error'
  discovered       INTEGER DEFAULT 0,
  prefiltered      INTEGER DEFAULT 0,                 -- survivors kept after pre-filter
  scored           INTEGER DEFAULT 0,
  queued           INTEGER DEFAULT 0,                 -- reached pending_review
  error_message    TEXT,
  elapsed_seconds  NUMERIC(8,2),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_runs_created ON x_runs(created_at);

-- ── X Candidates ──────────────────────────────────────────────────────────────
-- One row per discovered tweet. Carries discovery snapshot, pre-filter, and final score.
CREATE TABLE IF NOT EXISTS x_candidates (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id            UUID        REFERENCES x_runs(id) ON DELETE SET NULL,

  -- Source tweet
  tweet_id          TEXT        NOT NULL,             -- X status id (dedup key)
  tweet_url         TEXT        NOT NULL,
  author_handle     TEXT        NOT NULL,
  author_name       TEXT,
  author_type       TEXT        DEFAULT 'other',      -- journalist|outlet|politician|official|other
  author_followers  INTEGER,
  text              TEXT        NOT NULL,              -- the headline / claim
  lang              TEXT        DEFAULT 'en',

  -- Velocity snapshot at discovery
  likes             INTEGER     DEFAULT 0,
  reposts           INTEGER     DEFAULT 0,
  replies           INTEGER     DEFAULT 0,
  quotes            INTEGER     DEFAULT 0,
  age_minutes       INTEGER,
  velocity          NUMERIC,                           -- engagement / age, computed at discovery

  -- Pre-filter (grok-3-mini)
  prefilter_score   NUMERIC,                           -- 0.00–1.00 virality potential
  prefilter_reason  TEXT,

  -- Final bias score (grok-3-mini) — 0–10 like the site, display = score − 5
  bias_score        NUMERIC(4,2),
  bias_signals      TEXT[]      NOT NULL DEFAULT '{}',
  rationale         TEXT,                              -- <=140 char public "why" (card + tweet)
  score_model       TEXT,                              -- 'grok-3-mini' | 'grok-4' | 'dual'
  claude_bias_score NUMERIC(4,2),                      -- set only on escalation

  content_hash      TEXT,                              -- normalized-text hash for cache lookups
  status            TEXT        NOT NULL DEFAULT 'discovered',
    -- discovered|prefiltered_out|scored|pending_review|approved|rejected|posted|skipped|error
  status_note       TEXT,                              -- e.g. rejection reason / error detail
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_x_candidates_status  ON x_candidates(status);
CREATE INDEX IF NOT EXISTS idx_x_candidates_run     ON x_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_x_candidates_hash    ON x_candidates(content_hash);
CREATE INDEX IF NOT EXISTS idx_x_candidates_created ON x_candidates(created_at);

-- ── X Score Cache ─────────────────────────────────────────────────────────────
-- Near-duplicate cache: same normalized headline → reuse the score, skip re-scoring.
CREATE TABLE IF NOT EXISTS x_score_cache (
  content_hash  TEXT        PRIMARY KEY,
  bias_score    NUMERIC(4,2) NOT NULL,
  bias_signals  TEXT[]      NOT NULL DEFAULT '{}',
  rationale     TEXT,
  score_model   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── X Posts ───────────────────────────────────────────────────────────────────
-- Post history + performance. One row per tweet we publish.
CREATE TABLE IF NOT EXISTS x_posts (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id       UUID        REFERENCES x_candidates(id) ON DELETE SET NULL,
  tweet_id           TEXT        NOT NULL,             -- OUR posted tweet id
  format             TEXT        NOT NULL DEFAULT 'original',  -- 'original' | 'quote'
  image_used         BOOLEAN     DEFAULT FALSE,
  text               TEXT        NOT NULL,
  reply_tweet_id     TEXT,                             -- self-reply carrying the link, if any
  posted_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Metrics, refreshed by the backfill job (Phase 2)
  impressions        INTEGER,
  likes              INTEGER,
  reposts            INTEGER,
  replies            INTEGER,
  quotes             INTEGER,
  link_clicks        INTEGER,
  profile_clicks     INTEGER,
  followers_delta    INTEGER,
  metrics_updated_at TIMESTAMPTZ,

  UNIQUE (tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_x_posts_candidate ON x_posts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_x_posts_posted    ON x_posts(posted_at);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE x_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_candidates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_score_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_posts        ENABLE ROW LEVEL SECURITY;

-- x_posts is safe to expose (feeds a future public "our calls" page).
CREATE POLICY "public read x_posts"
  ON x_posts FOR SELECT USING (true);

-- Candidates/runs/cache stay service-only until we choose to expose them.
-- The admin queue UI reads them through a server route using the service key.

CREATE POLICY "service write x_runs"
  ON x_runs FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write x_candidates"
  ON x_candidates FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write x_score_cache"
  ON x_score_cache FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write x_posts"
  ON x_posts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
