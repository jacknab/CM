-- Adds columns that were missing from the original schema.sql baseline on VPS installs.
-- Safe to run multiple times (IF NOT EXISTS guards on all statements).

-- staff: commission_structure_id (added in 0040 on Replit, missing on VPS schema baseline)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;

-- support_tickets: columns added in 0032 that may be missing if 0031 was baselined but 0032 wasn't applied
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_name        TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category            TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subcategory         TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_response_at    TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at   TIMESTAMPTZ;

-- addons: tiered add-on system columns added after initial schema (missing on VPS baseline)
ALTER TABLE addons ADD COLUMN IF NOT EXISTS type            TEXT NOT NULL DEFAULT 'full';
ALTER TABLE addons ADD COLUMN IF NOT EXISTS parent_addon_id INTEGER;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS is_stackable    BOOLEAN NOT NULL DEFAULT true;

-- contractors: commission_structure_id link added after initial payout schema
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;
