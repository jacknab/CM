-- 0251_follow_on_tickets.sql
--
-- /nail: a service of a visit that the visit's technician can't do is its own ticket (linked by
-- ticket_group_id). It now waits, with no technician, until the visit's first ticket is done
-- (lib/nailTickets.ts releaseFollowOnTickets), so nobody is handed a client still in another chair.
-- waits_for_appointment_id = the ticket it waits for; NULL once released (or for every other ticket).

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS waits_for_appointment_id INTEGER;
CREATE INDEX IF NOT EXISTS appointments_waits_for_idx ON appointments (waits_for_appointment_id)
  WHERE waits_for_appointment_id IS NOT NULL;
