-- Each salon's offline-mode health (owner, 2026-11-02; phase 2): the score (0–100, null = no tablet reported this
-- week) and the problems the rules found (api-server lib/offlineHealthRules.ts), worked out every 5 minutes from the
-- tablets' reports (device_health) and the salon's setup. Shown in the support center.
CREATE TABLE IF NOT EXISTS offline_health_status (
  store_id    INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  score       INTEGER,
  problems    JSONB NOT NULL DEFAULT '[]'::jsonb,
  devices     INTEGER NOT NULL DEFAULT 0,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offline_health_status_score ON offline_health_status (score);
