-- Schema fixes applied during Replit import migration
-- Adds missing columns that were not included in the baseline schema

ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_thumb_url TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS tags JSONB;
