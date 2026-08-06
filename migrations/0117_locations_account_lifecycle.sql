-- Migration 0117: Add account lifecycle columns to locations table
-- Adds suspended_at, suspended_reason, locked_at (referenced in billing routes
-- but missing from schema, causing as-any casts to work around type errors).
-- Also adds stripe_price_id_monthly/yearly to billing_plans for plan-level price IDs.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS locked_at       TIMESTAMPTZ;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id_yearly  TEXT;
