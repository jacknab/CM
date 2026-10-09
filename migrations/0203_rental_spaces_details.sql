-- 0203_rental_spaces_details.sql
--
-- Certxa Rentals — Phase 2 (Spaces). Additive columns on rental_spaces only:
-- a public-ish description (distinct from the owner-private `notes`) and a
-- freeform amenities list. No existing table touched, no destructive change.
-- Depends on 0202_rentals_foundation.sql having created rental_spaces.

ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '[]'::jsonb;
