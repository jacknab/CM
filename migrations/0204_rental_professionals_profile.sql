-- 0204_rental_professionals_profile.sql
--
-- Certxa Rentals — Phase 3 (Professionals). Additive columns on
-- rental_professionals only: structured identity, business profile, and
-- online-presence fields. No existing table touched, no destructive change.
-- Depends on 0202_rentals_foundation.sql having created rental_professionals.
--
-- `status` stays a plain TEXT column (no CHECK constraint) — the controlled
-- vocabulary (active | pending | inactive | former) lives in
-- shared/rentalProfessionals.ts, matching the rest of this schema's
-- text-with-comment convention over pgEnum.

ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE rental_professionals ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;
