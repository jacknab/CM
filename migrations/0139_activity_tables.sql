-- Activity Tables: Appointment Events + Email Log
-- Captures fine-grained appointment lifecycle events and outbound email history
-- for the support account timeline feed.

-- appointment_events: per-appointment lifecycle event log
CREATE TABLE IF NOT EXISTS appointment_events (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL,
  appointment_id  INTEGER NOT NULL,
  event_type      VARCHAR(50) NOT NULL,
  -- event_type: created | cancelled | rescheduled | started | no_show | updated
  actor_user_id   TEXT,
  actor_type      VARCHAR(20) DEFAULT 'staff',
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS appointment_events_store_id_idx   ON appointment_events (store_id);
CREATE INDEX IF NOT EXISTS appointment_events_appt_id_idx    ON appointment_events (appointment_id);
CREATE INDEX IF NOT EXISTS appointment_events_created_at_idx ON appointment_events (created_at DESC);

-- email_log: record of every outbound email sent by the platform
CREATE TABLE IF NOT EXISTS email_log (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER,
  recipient   TEXT NOT NULL,
  subject     TEXT,
  email_type  VARCHAR(100),
  status      VARCHAR(20) DEFAULT 'sent',
  error       TEXT,
  mailgun_id  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS email_log_store_id_idx   ON email_log (store_id);
CREATE INDEX IF NOT EXISTS email_log_created_at_idx ON email_log (created_at DESC);
