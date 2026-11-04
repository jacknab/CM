-- Bookings and sales keep the client's name themselves (owner, 2026-11-04). An appointment is the booking and the sale
-- (ticket), and it only pointed at the client, so a deleted client left a nameless ticket. customer_name is the name at
-- the time: the linked client's, or the name typed at check-in for a walk-in with no client record. Screens still prefer
-- the linked client, so a corrected spelling shows; lib/deleteClient.ts saves the latest name before the link goes.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_name TEXT;

UPDATE appointments a
   SET customer_name = NULLIF(TRIM(COALESCE(NULLIF(c.full_name, ''), CONCAT_WS(' ', c.first_name, c.last_name))), '')
  FROM clients c
 WHERE c.id = a.customer_id AND a.customer_name IS NULL;

UPDATE appointments a
   SET customer_name = k.client_name
  FROM kiosk_checkins k
 WHERE k.appointment_id = a.id AND a.customer_id IS NULL AND a.customer_name IS NULL AND k.client_name IS NOT NULL;

-- A trigger, so every way of making a ticket (web, app, kiosk, /nail, offline sync, Autumn) stores the name.
CREATE OR REPLACE FUNCTION appointment_customer_name() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  who text;
BEGIN
  IF NEW.customer_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.customer_id IS DISTINCT FROM OLD.customer_id) THEN
    SELECT NULLIF(TRIM(COALESCE(NULLIF(full_name, ''), CONCAT_WS(' ', first_name, last_name))), '') INTO who
      FROM clients WHERE id = NEW.customer_id;
    IF who IS NOT NULL THEN NEW.customer_name := who; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_customer_name ON appointments;
CREATE TRIGGER appointment_customer_name BEFORE INSERT OR UPDATE OF customer_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_customer_name();

CREATE OR REPLACE FUNCTION checkin_customer_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL AND NEW.client_name IS NOT NULL THEN
    UPDATE appointments SET customer_name = NEW.client_name
     WHERE id = NEW.appointment_id AND customer_id IS NULL AND customer_name IS DISTINCT FROM NEW.client_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checkin_customer_name ON kiosk_checkins;
CREATE TRIGGER checkin_customer_name AFTER INSERT OR UPDATE OF appointment_id, client_name ON kiosk_checkins
  FOR EACH ROW EXECUTE FUNCTION checkin_customer_name();
