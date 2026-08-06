-- Auto-refill columns for platform credits
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS auto_refill_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_threshold decimal(10,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS auto_refill_amount decimal(10,2) NOT NULL DEFAULT 25.00;
