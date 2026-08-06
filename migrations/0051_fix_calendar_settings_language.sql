-- Migration 0051: Re-apply missing calendar_settings.language column.
-- Migration 0042 was seeded as baseline on existing Replit DBs without executing,
-- so the column may not exist. ADD COLUMN IF NOT EXISTS is safe to run again.

ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
