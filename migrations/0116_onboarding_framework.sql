-- ── Onboarding progress tracking ─────────────────────────────────────────────
-- One row per store per flow. JSONB-free design: status + timestamps only.

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL,
  flow_key     VARCHAR(64) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'not_started',
               -- 'not_started' | 'in_progress' | 'complete' | 'skipped' | 'dismissed'
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  skipped_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, flow_key)
);

-- Track whether the dashboard checklist card has been dismissed per store.
-- Uses flow_key = '__checklist__' in onboarding_progress with status = 'dismissed'.

-- Allow soft-gate on onboarding completion at the store level.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT false;
