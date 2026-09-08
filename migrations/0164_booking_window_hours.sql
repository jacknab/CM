-- Minimum notice (in hours) a client must give to book an appointment online.
-- 0 = no minimum (clients can book right up to the slot start time).
-- Enforced by the public availability + booking endpoints; staff-side booking
-- is unaffected.

ALTER TABLE calendar_settings
  ADD COLUMN IF NOT EXISTS booking_window_hours integer NOT NULL DEFAULT 0;
