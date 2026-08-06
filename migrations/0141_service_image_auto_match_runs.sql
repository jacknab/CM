-- Tracks the last time each store ran service-image auto matching.
-- Used by recurring jobs to ensure matching runs at most once per 30 days.

CREATE TABLE IF NOT EXISTS service_image_auto_match_runs (
  store_id   INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  updated_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_image_auto_match_runs_updated_on
  ON service_image_auto_match_runs (updated_on);

