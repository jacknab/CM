-- Re-applies the columns from 0099_gbp_verification_status.sql that were
-- baseline-seeded on the VPS (recorded as applied but never executed).
-- Safe to run against any DB: IF NOT EXISTS is a no-op when already present.

ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS postcard_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS postcard_address    TEXT;
