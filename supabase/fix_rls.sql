-- Spin Detector — RLS Remediation
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes the Supabase advisory "rls_disabled_in_public" (Table publicly
-- accessible). Run this ONCE in the Supabase SQL editor for project
-- jabdfsdwgnmqghdoe.
--
-- Why this is needed: schema.sql enables Row-Level Security, but if the database
-- was provisioned before those lines were added (or a table was created directly
-- in the dashboard), RLS may never have been applied — leaving a table readable,
-- editable and deletable by anyone holding the public anon key.
--
-- This script is idempotent and safe to re-run:
--   1. Enables RLS on EVERY base table in the `public` schema (covers whichever
--      table was flagged, even ones not tracked in schema.sql).
--   2. Re-asserts the intended access policies on the four app tables:
--        • public (anon) read-only
--        • writes restricted to the service_role (used by the pipeline)
--   Any other public table gets RLS with no policy — i.e. locked down by
--   default (anon can neither read nor write) until you add an explicit policy.

-- ── 1. Enable RLS on all public base tables ──────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- ── 2. (Re)create the intended policies on the app tables ────────────────────
-- DROP + CREATE so this is safe to run repeatedly (CREATE POLICY has no
-- IF NOT EXISTS form).
DO $$
DECLARE
  t TEXT;
  app_tables TEXT[] := ARRAY[
    'articles',
    'outlet_daily_scores',
    'story_clusters',
    'pipeline_runs'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables
  LOOP
    -- Skip cleanly if a table doesn't exist in this database.
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Table public.% not found — skipping', t;
      CONTINUE;
    END IF;

    -- Public read policy (frontend uses the anon key).
    EXECUTE format('DROP POLICY IF EXISTS "public read %1$s" ON public.%1$I;', t);
    EXECUTE format(
      'CREATE POLICY "public read %1$s" ON public.%1$I FOR SELECT USING (true);',
      t
    );

    -- Service-role write policy (pipeline uses the service key).
    EXECUTE format('DROP POLICY IF EXISTS "service write %1$s" ON public.%1$I;', t);
    EXECUTE format(
      'CREATE POLICY "service write %1$s" ON public.%1$I FOR ALL '
      'USING (auth.role() = ''service_role'') '
      'WITH CHECK (auth.role() = ''service_role'');',
      t
    );
  END LOOP;
END $$;

-- ── 3. Verify ────────────────────────────────────────────────────────────────
-- After running, this should return zero rows. Any row = a public table still
-- without RLS.
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity;
