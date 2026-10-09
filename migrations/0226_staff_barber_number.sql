-- Barber ID: the 1–2 digit number a barber types on the /barber POS to identify themselves.
-- Assigned automatically (lowest free number in the shop) by ensureBarberNumbers(); unique per store.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS barber_number integer;
CREATE UNIQUE INDEX IF NOT EXISTS staff_store_barber_number_uidx
  ON staff (store_id, barber_number) WHERE barber_number IS NOT NULL;
