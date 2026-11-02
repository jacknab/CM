-- Fixes for broken offline setups (owner, 2026-11-02; phase 3). One row per fix: done on the server itself (device_id
-- NULL, e.g. choosing the hub again) or sent to one tablet as a command it carries out and reports back on.
-- Started by the 5-minute health job (created_by 'auto') or by support (Run fix). Kept as the audit trail.
-- status: pending (waiting for the tablet) | sent | done | failed | expired
CREATE TABLE IF NOT EXISTS offline_fixes (
  id           BIGSERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  device_id    TEXT,
  command      TEXT NOT NULL,
  problem      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  detail       TEXT,
  created_by   TEXT NOT NULL DEFAULT 'auto',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_offline_fixes_store ON offline_fixes (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_fixes_device_pending ON offline_fixes (store_id, device_id) WHERE status IN ('pending', 'sent');
