-- Deposits (owner, 2026-11-04): deposit_type may now also be 'full' (the visit's whole price, no deposit_value needed).
-- The pro chooses whether a house call's travel fee counts towards the deposit.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS deposit_include_travel_fee BOOLEAN NOT NULL DEFAULT FALSE;
