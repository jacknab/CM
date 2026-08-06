ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS discovered_place_id text,
  ADD COLUMN IF NOT EXISTS postcard_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS postcard_second_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_error text;

CREATE INDEX IF NOT EXISTS google_business_profiles_onboarding_reminders_idx
  ON google_business_profiles (onboarding_status, postcard_sent_at)
  WHERE is_connected = false AND postcard_sent_at IS NOT NULL;
