-- Fix schema drift detected on fresh Replit database
-- Adds missing columns to locations and addons tables

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS auto_refill_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_threshold DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS auto_refill_amount DECIMAL(10, 2) NOT NULL DEFAULT 25.00;

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
