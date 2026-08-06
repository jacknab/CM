-- Service Events Log
-- Records every service create, update, delete, activate, and deactivate
-- operation, keyed by store_id for the account activity feed.

CREATE TABLE IF NOT EXISTS service_events (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL,
  service_id    INTEGER NOT NULL,
  service_name  TEXT,
  event_type    VARCHAR(50) NOT NULL,
  -- event_type: created | updated | deleted | activated | deactivated
  actor_user_id TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS service_events_store_id_idx   ON service_events (store_id);
CREATE INDEX IF NOT EXISTS service_events_created_at_idx ON service_events (created_at DESC);
