-- Spin Check — shared rate-limit log
--
-- /api/spin-check spends real money on every request. Its limiter used to keep
-- counters in memory, so each Vercel instance had its own window and the real
-- ceiling was (instances × limit). One row per allowed check here gives every
-- instance the same view, and lets the route enforce a global daily cap.
--
-- Paste this whole file into the Supabase SQL editor (additive, safe to re-run).
-- Until it is applied, the route falls back to the in-memory limiter.

CREATE TABLE IF NOT EXISTS spin_check_hits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- SHA-256 of the client IP; the raw address is never stored.
  ip_hash    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spin_check_hits_created ON spin_check_hits(created_at);
CREATE INDEX IF NOT EXISTS idx_spin_check_hits_ip      ON spin_check_hits(ip_hash, created_at);

-- Service key only: no public policies.
ALTER TABLE spin_check_hits ENABLE ROW LEVEL SECURITY;
