-- Add website column to locations (captured from Google Places during onboarding)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS website TEXT;
