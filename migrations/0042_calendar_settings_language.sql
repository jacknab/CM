-- Add language preference column to calendar_settings.
-- Was present in the Drizzle schema but never applied to the production database.
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
