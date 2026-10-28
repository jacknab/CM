-- 0265_ticket_staff_assigned_at.sql
-- Urgent tickets on the /nail board (owner, 2026-10-29): a ticket with a technician who is free should be started
-- within 5 minutes (orange) or 10 (red). That needs to know WHEN the technician was given the ticket. Many code paths
-- assign or move a ticket, so the time is stamped here, by the database, whenever staff_id changes.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS staff_assigned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION appointments_stamp_staff_assigned() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.staff_id IS NOT NULL AND NEW.staff_assigned_at IS NULL THEN NEW.staff_assigned_at := now(); END IF;
  ELSIF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    NEW.staff_assigned_at := CASE WHEN NEW.staff_id IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_staff_assigned_at ON appointments;
CREATE TRIGGER appointments_staff_assigned_at BEFORE INSERT OR UPDATE OF staff_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_stamp_staff_assigned();
