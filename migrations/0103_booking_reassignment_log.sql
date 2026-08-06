-- Migration 0103: Smart Booking Reassignment Engine — audit log table
--
-- Every automatic technician reassignment performed by the Smart Booking
-- Engine writes a row here so owners and admins can audit who was moved,
-- why, and what alternative technician was chosen.

CREATE TABLE IF NOT EXISTS booking_reassignment_log (
  id                    SERIAL PRIMARY KEY,
  appointment_id        INTEGER NOT NULL,
  store_id              INTEGER NOT NULL,
  from_staff_id         INTEGER NOT NULL,
  to_staff_id           INTEGER NOT NULL,
  -- Human-readable reason for the reassignment (conflict description)
  reason                TEXT NOT NULL,
  -- The active appointment that caused the conflict (NULL for preventive moves)
  conflict_appt_id      INTEGER,
  -- When the active ticket was projected to finish (UTC)
  projected_finish_at   TIMESTAMPTZ,
  -- Original appointment start time (preserved unchanged)
  appointment_start_at  TIMESTAMPTZ NOT NULL,
  -- Winning candidate's composite score (0–100)
  score                 INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS brl_store_id_idx         ON booking_reassignment_log (store_id);
CREATE INDEX IF NOT EXISTS brl_appointment_id_idx   ON booking_reassignment_log (appointment_id);
CREATE INDEX IF NOT EXISTS brl_created_at_idx       ON booking_reassignment_log (created_at DESC);
