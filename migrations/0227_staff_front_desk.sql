-- Receptionist / front desk flag. On the /nail and /barber POS these staff get an ID in 90–99
-- (technicians and barbers get 1–89); a 90–99 sign-in is locked only after two idle minutes.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS front_desk boolean NOT NULL DEFAULT false;
