-- Offline-mode health of each salon tablet (owner, 2026-11-02; phase 1 of the offline health work). Every POS tablet
-- and customer screen sends a report every 2 minutes while online — its offline database, its copy of the salon, the
-- hub link, its clock — and the reports it kept while offline once it is back. device_health holds the latest per
-- tablet; device_health_log the history (30 days) for seeing what happened during an outage.
CREATE TABLE IF NOT EXISTS device_health (
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  role         TEXT,
  page         TEXT,
  register_id  INTEGER,
  app_build    TEXT,
  report       JSONB NOT NULL,
  reported_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip           TEXT,
  PRIMARY KEY (store_id, device_id)
);
CREATE TABLE IF NOT EXISTS device_health_log (
  id           BIGSERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  report       JSONB NOT NULL,
  reported_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  offline      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_device_health_log_store ON device_health_log (store_id, reported_at DESC);
