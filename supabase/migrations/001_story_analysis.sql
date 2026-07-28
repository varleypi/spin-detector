-- Spin Detector — per-story bias analysis
--
-- Background: /story/<date>/<slug> pages were flagged by AdSense as "low value
-- content". Each page was one templated sentence plus a chart and a list of
-- OTHER outlets' headlines — ~30 words of original writing across 250 pages
-- that otherwise republish other publishers' headlines. That is the textbook
-- thin/aggregated-content pattern.
--
-- The fix is to store an original, grounded analysis per story: how the framing
-- actually differed across the left→right spectrum, written from the site's own
-- per-headline bias signals and scores. This column holds that prose.
--
-- Paste this whole file into the Supabase SQL editor (it is additive and safe
-- to re-run).

ALTER TABLE story_clusters
  -- Original editorial prose: how the outlets' framing differed. ~110–150 words.
  ADD COLUMN IF NOT EXISTS analysis      TEXT,
  -- Which model wrote it ('claude-sonnet-4-6' | 'grok-3-mini'), for audit.
  ADD COLUMN IF NOT EXISTS analysis_model TEXT,
  -- When it was generated. Distinct from created_at because the backfill and
  -- in-place refreshes update analysis without rewriting the row's identity.
  ADD COLUMN IF NOT EXISTS analysis_at   TIMESTAMPTZ;

COMMENT ON COLUMN story_clusters.analysis IS
  'Original grounded analysis of how outlets framed this story across the bias spectrum. Shown on the story page; the site''s answer to the "low value content" flag.';
