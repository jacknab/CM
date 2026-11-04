-- Business Phone is $10/month (owner, 2026-11-04), charged to the card on file by Certxa's own renewal run
-- (lib/businessPhoneBilling.ts), next to Plus's billing (a business has one saas_billing_profiles row, Plus's).
--   active    paid until paid_until; renewed then (or released then, if cancel_at_period_end)
--   past_due  the renewal failed; retried 1, 3 and 5 days later, calls and texts still work
--   held      every retry failed: calls and texts stop and the number is kept until held_until (14 days) for the
--             pro to pay, then released for good
--   free      no charge (lines that existed before the fee, e.g. test accounts)
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS held_until TIMESTAMPTZ;
ALTER TABLE business_phone_lines ADD COLUMN IF NOT EXISTS last_payment_id TEXT;
-- Lines made before the fee stay free.
UPDATE business_phone_lines SET billing_status = 'free' WHERE paid_until IS NULL AND billing_status = 'active';
