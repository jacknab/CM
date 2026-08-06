-- Make onboarding_progress a normal Drizzle-managed table.
-- This repairs databases where migration 0116 was baseline-recorded without
-- actually creating the table, and where migration 0122 was skipped because
-- the table did not yet exist.

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL,
  flow_key     VARCHAR(64) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'not_started',
  state        JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  skipped_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, flow_key)
);

ALTER TABLE onboarding_progress
  ADD COLUMN IF NOT EXISTS state JSONB;

UPDATE onboarding_progress
SET state = '{}'::jsonb
WHERE state IS NULL;

ALTER TABLE onboarding_progress
  ALTER COLUMN state SET DEFAULT '{}'::jsonb,
  ALTER COLUMN state SET NOT NULL;