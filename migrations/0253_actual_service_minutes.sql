-- 0253_actual_service_minutes.sql
--
-- How long a service really took, saved on the ticket (owner, 2026-10-21): from START (started_at) to DONE
-- (service_done_at), or to checkout (completed_at) when DONE was never pressed. Filled once, by the database,
-- whatever screen or route makes the change. Over 10 hours is a ticket left open by mistake, not a service:
-- it is left empty. `duration` stays the planned time.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS actual_minutes INTEGER;

CREATE OR REPLACE FUNCTION appointments_fill_actual_minutes() RETURNS trigger AS $$
DECLARE
  ended timestamptz;
  mins numeric;
BEGIN
  IF NEW.actual_minutes IS NULL AND NEW.started_at IS NOT NULL THEN
    ended := COALESCE(NEW.service_done_at, CASE WHEN NEW.status = 'completed' THEN NEW.completed_at END);
    IF ended IS NOT NULL THEN
      mins := EXTRACT(EPOCH FROM (ended - NEW.started_at)) / 60;
      IF mins >= 0 AND mins <= 600 THEN NEW.actual_minutes := ROUND(mins); END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_actual_minutes ON appointments;
CREATE TRIGGER appointments_actual_minutes BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_fill_actual_minutes();

-- Tickets already finished.
UPDATE appointments SET actual_minutes = ROUND(EXTRACT(EPOCH FROM (COALESCE(service_done_at, completed_at) - started_at)) / 60)
 WHERE actual_minutes IS NULL AND started_at IS NOT NULL
   AND (service_done_at IS NOT NULL OR (status = 'completed' AND completed_at IS NOT NULL))
   AND EXTRACT(EPOCH FROM (COALESCE(service_done_at, completed_at) - started_at)) BETWEEN 0 AND 36000;
