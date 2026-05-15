-- Spin Detector — Supabase Schema
-- Run this in the Supabase SQL editor to create all required tables.

-- ── Articles ─────────────────────────────────────────────────────────────────
-- One row per article per pipeline run. Bias score + signals from Claude.
CREATE TABLE IF NOT EXISTS articles (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date            DATE        NOT NULL,
  outlet_id       TEXT        NOT NULL,
  outlet_name     TEXT        NOT NULL,
  abbreviation    TEXT        NOT NULL,
  cluster_id      TEXT        NOT NULL,
  topic_label     TEXT        NOT NULL,
  headline        TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  pub_date        TIMESTAMPTZ,
  bias_score      NUMERIC(4,2) NOT NULL,
  bias_signals    TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, outlet_id, headline)
);

CREATE INDEX IF NOT EXISTS idx_articles_date        ON articles(date);
CREATE INDEX IF NOT EXISTS idx_articles_outlet_date ON articles(outlet_id, date);
CREATE INDEX IF NOT EXISTS idx_articles_cluster     ON articles(date, cluster_id);

-- ── Outlet Daily Scores ───────────────────────────────────────────────────────
-- Aggregated per-outlet score for each pipeline run day. Drives Bias Board + Trends.
CREATE TABLE IF NOT EXISTS outlet_daily_scores (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE        NOT NULL,
  outlet_id      TEXT        NOT NULL,
  outlet_name    TEXT        NOT NULL,
  abbreviation   TEXT        NOT NULL,
  avg_score      NUMERIC(4,2) NOT NULL,
  article_count  INTEGER     NOT NULL,
  std_deviation  NUMERIC(4,2),
  expected_range NUMERIC(4,2)[] NOT NULL DEFAULT '{0,10}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_scores_date   ON outlet_daily_scores(date);
CREATE INDEX IF NOT EXISTS idx_outlet_scores_outlet ON outlet_daily_scores(outlet_id);

-- ── Story Clusters ────────────────────────────────────────────────────────────
-- One row per story cluster per day. Groups articles covering the same event.
CREATE TABLE IF NOT EXISTS story_clusters (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  date         DATE    NOT NULL,
  cluster_id   TEXT    NOT NULL,
  topic_label  TEXT    NOT NULL,
  outlet_ids   TEXT[]  NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_clusters_date ON story_clusters(date);

-- ── Pipeline Runs ─────────────────────────────────────────────────────────────
-- Audit log of every pipeline execution.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  status           TEXT    NOT NULL,  -- 'success' | 'error'
  error_message    TEXT,
  article_count    INTEGER DEFAULT 0,
  story_count      INTEGER DEFAULT 0,
  elapsed_seconds  NUMERIC(8,2),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS — public read, service-key write only.
ALTER TABLE articles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_daily_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_clusters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs        ENABLE ROW LEVEL SECURITY;

-- Public read policies (frontend API routes use anon key)
CREATE POLICY "public read articles"
  ON articles FOR SELECT USING (true);

CREATE POLICY "public read outlet_daily_scores"
  ON outlet_daily_scores FOR SELECT USING (true);

CREATE POLICY "public read story_clusters"
  ON story_clusters FOR SELECT USING (true);

CREATE POLICY "public read pipeline_runs"
  ON pipeline_runs FOR SELECT USING (true);

-- Service-role write policies (pipeline uses service key)
CREATE POLICY "service write articles"
  ON articles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write outlet_daily_scores"
  ON outlet_daily_scores FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write story_clusters"
  ON story_clusters FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write pipeline_runs"
  ON pipeline_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
