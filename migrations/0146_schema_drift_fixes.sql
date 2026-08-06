-- Fix schema drift detected on startup (2026-08-02)
-- staff: mailing address columns added to schema but missing from DB
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_address1 TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_address2 TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_city TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_state TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_zip TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mailing_country TEXT DEFAULT 'US';

-- appointments: checked_in_at and created_at missing from DB
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- support_agents: name and updated_at missing from DB
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
