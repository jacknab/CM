-- Add structure_type (flat | member | tiered) and tiers JSONB to commission_structures
ALTER TABLE commission_structures
  ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS tiers          JSONB;
