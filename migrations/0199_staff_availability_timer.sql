-- 0199_staff_availability_timer.sql
--
-- The Techs page shows a live HH:MM:SS timer per technician (how long they've been free / in the chair / on break).
-- The moment their state last changed is stored HERE — on the server, not in any one screen — so every POS station shows
-- the same time, and it survives page changes, reloads and restarts (it never restarts from 00:00:00 by itself).
--   availability_state: 'available' | 'busy' | 'break' | 'off'      availability_since: when they entered that state
-- NULL until the first sync after this migration (which seeds it from the day's clock-in / last checkout).

ALTER TABLE staff ADD COLUMN IF NOT EXISTS availability_state TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS availability_since TIMESTAMPTZ;
