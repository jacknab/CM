-- When a check-in was given to its barber (owner, 2026-11-03). In a barbershop the service starts the moment the barber
-- takes the client — the ticket is only made at checkout — so the ticket's started_at is this time, and its actual
-- minutes run from here to checkout. Filled by the database whatever route gives (or takes back) the client; a route
-- that knows the real moment (a client taken on a tablet while offline) writes it itself.
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION kiosk_checkins_fill_assigned_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.staff_id IS NOT NULL AND NEW.assigned_at IS NULL THEN NEW.assigned_at := now(); END IF;
  ELSIF NEW.staff_id IS DISTINCT FROM OLD.staff_id AND NEW.assigned_at IS NOT DISTINCT FROM OLD.assigned_at THEN
    NEW.assigned_at := CASE WHEN NEW.staff_id IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kiosk_checkins_assigned_at ON kiosk_checkins;
CREATE TRIGGER kiosk_checkins_assigned_at BEFORE INSERT OR UPDATE ON kiosk_checkins
  FOR EACH ROW EXECUTE FUNCTION kiosk_checkins_fill_assigned_at();
