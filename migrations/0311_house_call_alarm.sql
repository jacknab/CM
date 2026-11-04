-- The house-call alarm (owner, 2026-11-04): how long before a house call the pro's phone sounds, so they can load the
-- car, drive there and set up. 0 = off. leave_alarm_for is the start time the alarm was sent for, so a booking moved to
-- another time sounds again and no other server can send it twice.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS house_call_alarm_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS leave_alarm_for TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS appointments_house_call_soon_idx ON appointments (date) WHERE visit_at = 'client';
