-- Add sms_tokens column to locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_tokens INTEGER NOT NULL DEFAULT 0;
