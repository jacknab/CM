-- 0269_appointment_tax_amount.sql
-- The sales tax charged on a sale (owner, 2026-10-29: reports must show the tax actually collected). The checkout
-- checked the tax but never saved it, so reports recomputed it from today's settings. From now on the /nail checkout
-- saves each ticket's share. Older sales: their share is worked out from what was saved — total paid less tip, less the
-- service + product sale after discount (the checkout's own rule, nailCheckoutSettlement.ts).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2);
UPDATE appointments
   SET tax_amount = GREATEST(0, ROUND(total_paid - COALESCE(tip_amount, 0) - (service_revenue + COALESCE(product_revenue, 0) - COALESCE(discount_amount, 0)), 2))
 WHERE status = 'completed' AND tax_amount IS NULL AND total_paid IS NOT NULL AND service_revenue IS NOT NULL;
