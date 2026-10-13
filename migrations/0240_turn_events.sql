-- The turn rotation's history: every assignment, every technician passed over, every turn earned, every
-- change of rules. Rows are only ever added — a correction is a new row, never an edit — so the line can
-- always be explained after the fact. Customer details are not copied here; a ticket is referred to by id.
CREATE TABLE IF NOT EXISTS turn_events (
  id             BIGSERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL,
  at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- assigned | passed | credited | adjusted | config_changed
  kind           TEXT NOT NULL,
  staff_id       INTEGER,
  appointment_id INTEGER,
  category       TEXT,
  amount_cents   INTEGER,
  -- thousandths of a turn. On "assigned"/"passed" in fixed order: 1000 when it used up the technician's turn.
  turn_units     INTEGER,
  method         TEXT,
  config_version INTEGER,
  automatic      BOOLEAN NOT NULL DEFAULT TRUE,
  reason         TEXT,
  actor_user_id  TEXT,
  actor_staff_id INTEGER,
  explanation    TEXT,
  details        JSONB
);
CREATE INDEX IF NOT EXISTS turn_events_store_at_idx ON turn_events (store_id, at DESC);
CREATE INDEX IF NOT EXISTS turn_events_appointment_idx ON turn_events (appointment_id) WHERE appointment_id IS NOT NULL;
-- A ticket earns its turns once, however many times its checkout is reported.
CREATE UNIQUE INDEX IF NOT EXISTS turn_events_credit_once ON turn_events (appointment_id) WHERE kind = 'credited';
