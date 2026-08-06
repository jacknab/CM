-- Google Business Profile verification tracking
-- Adds columns to track whether a connected location is verified,
-- postcard verification state, and the mailing address used.

ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS postcard_sent_at    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS postcard_address    TEXT;
