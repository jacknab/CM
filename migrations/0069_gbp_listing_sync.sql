-- Migration 0069: Add listing sync tracking columns to google_business_profiles
ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS listing_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_booking_url TEXT;
