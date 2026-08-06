-- Add automatic no-show toggle to calendar settings
ALTER TABLE calendar_settings
ADD COLUMN IF NOT EXISTS auto_mark_no_shows BOOLEAN NOT NULL DEFAULT false;
