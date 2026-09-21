-- 0195_calendar_buffer_minutes.sql
--
-- Calendar Settings → "Time between appointments". A technician is not offered / cannot be booked
-- for a new appointment until this many minutes after their previous one ends (and must be free
-- this many minutes before their next one starts). 0 = back-to-back allowed (today's behavior).
-- The app offers 0 / 5 / 10 / 15.

ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0;
