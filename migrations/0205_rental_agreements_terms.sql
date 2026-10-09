-- 0205_rental_agreements_terms.sql
--
-- Certxa Rentals — Phase 4 (Rental Agreements / Leases). Additive columns on
-- rental_agreements only: contractual rent terms, deposit, notice period,
-- notes, and an explicit termination timestamp distinct from the originally
-- contracted end date. No existing table touched, no destructive change.
-- Depends on 0202_rentals_foundation.sql having created rental_agreements.
--
-- `monthly_rate` (from 0202) is left in place, unused going forward —
-- superseded by rent_amount + rent_frequency since rent isn't always
-- monthly. No data exists yet to migrate, but dropping a column is a
-- destructive schema change this project avoids on principle.
--
-- `status` stays a plain TEXT column — only "active" | "terminated" are ever
-- persisted now (see shared/rentalAgreements.ts); every other lifecycle
-- state the owner sees is derived from status + dates, never stored.

ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS rent_amount DECIMAL(10, 2);
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS rent_frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10, 2);
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS notice_period_days INTEGER;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMP;
