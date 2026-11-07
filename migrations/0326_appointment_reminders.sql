-- Booking reminder for Certxa Pro accounts (owner, 2026-11-07): a push 15 minutes before each booking that isn't a
-- house call (house calls have their own alarm). reminder_sent_for is the start time it was sent for, so a booking
-- moved to another time is reminded again.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_for TIMESTAMPTZ;
