-- Add google_oauth_allowlist to platform_settings
-- Comma-separated list of allowed emails/domains for Google OAuth login.
-- Empty = open to all. Example: alice@example.com,@certxa.com

-- Ensure the platform_settings table exists before altering it.
-- Some VPS installs may be missing this table if the earlier migration
-- (0005_platform_settings.sql) ran in soft mode and was silently skipped.
CREATE TABLE IF NOT EXISTS platform_settings (
  id                  SERIAL PRIMARY KEY,
  trial_period_days   INTEGER NOT NULL DEFAULT 30,
  mailgun_api_key     TEXT,
  mailgun_domain      TEXT,
  mailgun_from_email  TEXT,
  mailgun_from_name   TEXT,
  mailgun_enabled     BOOLEAN DEFAULT false,
  twilio_account_sid  TEXT,
  twilio_auth_token   TEXT,
  twilio_phone_number TEXT,
  twilio_enabled      BOOLEAN DEFAULT false,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Ensure at least one settings row exists
INSERT INTO platform_settings (trial_period_days)
SELECT 30
WHERE NOT EXISTS (SELECT 1 FROM platform_settings);

-- Add the new column (safe to re-run — IF NOT EXISTS is idempotent)
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS google_oauth_allowlist TEXT NOT NULL DEFAULT '';
