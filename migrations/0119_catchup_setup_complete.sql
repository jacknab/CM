-- Migration 0119: Catchup — add setup_complete to locations if missing.
-- Migration 0116 was baseline-seeded on some deployments without executing,
-- leaving this column absent. IF NOT EXISTS makes this safe to re-run on DBs
-- where the column already exists.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT false;
