-- Commission reproducibility snapshot.
--
-- Commission reports and contractor payroll runs were computed from the LIVE
-- `services.price` and the LIVE `staff.commission_rate`. That made historical
-- numbers move whenever a service price or a staff member's commission rate was
-- edited later, and a (hard) service delete zeroed the revenue basis entirely.
--
-- These two nullable columns capture the values at the moment an appointment is
-- first completed. Left NULL for every existing row on purpose — consumers fall
-- back to the live value when the snapshot is absent, so no historical report
-- changes; only completions from here forward become reproducible. Do NOT
-- backfill from the current catalogue — that would bake in today's prices.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_price   NUMERIC(10, 2);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2);
