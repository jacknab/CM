-- Turn Assignment Log
-- Records every walk-in booking assignment so management can detect patterns
-- of favoritism (front-desk staff consistently routing walk-ins to the same tech).

CREATE TABLE IF NOT EXISTS turn_assignment_log (
  id                       SERIAL PRIMARY KEY,
  store_id                 INTEGER NOT NULL,
  appointment_id           INTEGER,
  assigned_staff_id        INTEGER NOT NULL,
  turn_recommended_staff_id INTEGER,
  is_override              BOOLEAN NOT NULL DEFAULT false,
  booked_by_user_id        INTEGER,
  source                   TEXT NOT NULL DEFAULT 'turn_system',
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tal_store_id    ON turn_assignment_log(store_id);
CREATE INDEX IF NOT EXISTS idx_tal_booked_by   ON turn_assignment_log(booked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tal_created_at  ON turn_assignment_log(created_at);
CREATE INDEX IF NOT EXISTS idx_tal_override    ON turn_assignment_log(store_id, is_override, created_at);
