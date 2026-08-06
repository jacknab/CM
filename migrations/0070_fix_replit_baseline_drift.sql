-- Migration 0070: Fix schema drift on fresh Replit database baseline.
-- Migrations 0054 and 0065 were seeded as "applied" during fresh-DB initialisation
-- without their SQL actually running (schema.sql baseline predated these columns).
-- This migration re-applies the missing columns idempotently.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS auto_refill_enabled   BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_threshold DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS auto_refill_amount    DECIMAL(10, 2) NOT NULL DEFAULT 25.00;

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
