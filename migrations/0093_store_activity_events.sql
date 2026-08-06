-- Migration 0093: store_activity_events table for the owner-facing live "Owner Feed"
-- widget on the salon dashboard (check-ins, completions, payments, AI bookings, etc.)

CREATE TABLE IF NOT EXISTS store_activity_events (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  message     TEXT NOT NULL,
  amount      DECIMAL(10, 2),
  metadata    JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_activity_events_store_created
  ON store_activity_events (store_id, created_at DESC);
