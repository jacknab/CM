-- Tom's ownership call-back (owner, 2026-11-10): a two-digit number Tom gives the caller before hanging up and asks for
-- when he calls the salon back; only the right number verifies ownership.
ALTER TABLE salon_claim_callbacks ADD COLUMN IF NOT EXISTS verify_code text;
ALTER TABLE salon_claim_callbacks ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0;
