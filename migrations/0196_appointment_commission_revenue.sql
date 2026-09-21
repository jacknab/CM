-- 0196_appointment_commission_revenue.sql
--
-- One commission rule everywhere: services AND add-ons are paid at the staff member's service
-- rate; retail products at the product rate. To apply that, the checkout now freezes, when a ticket
-- completes, how much of it was service+add-on money and how much was retail product money — both
-- BEFORE discount, tax and tip.
--
-- Left NULL for every existing row on purpose (consumers fall back to the legacy calculation, so no
-- historical report changes). Do NOT backfill.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_revenue NUMERIC(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS product_revenue NUMERIC(10, 2);
