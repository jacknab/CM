-- Account Health Check runs — persisted diagnostic snapshots
-- Each row is one full or partial health-check run against a store account.

CREATE TABLE IF NOT EXISTS account_health_checks (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL,          -- references locations(id)
  agent_id      INTEGER NOT NULL DEFAULT 1, -- references support_agents(id)
  agent_name    TEXT    NOT NULL DEFAULT 'System',
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  segments_run  TEXT[]  NOT NULL,           -- e.g. ARRAY['booking_readiness','team_roster']
  results       JSONB   NOT NULL DEFAULT '{}',
  pass_count    INTEGER NOT NULL DEFAULT 0,
  warn_count    INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_ahc_account_run
  ON account_health_checks (account_id, run_at DESC);
