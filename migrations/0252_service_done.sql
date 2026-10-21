-- 0252_service_done.sql
--
-- /nail DONE: a technician marks their service finished before the visit is paid. The ticket stays
-- open (status 'started') until checkout, but the technician is free again, and a ticket of the same
-- visit waiting for this one (waits_for_appointment_id) goes to the next technician in turn.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_done_at TIMESTAMPTZ;
