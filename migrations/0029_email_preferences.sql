-- Email Preference Centre
-- Stores per-user opt-out preferences for non-critical Certxa system emails.
-- Critical emails (payment failed, account suspended/locked) are never gated.
-- users.id is character varying (UUID), so user_id is VARCHAR here.

CREATE TABLE IF NOT EXISTS user_email_preferences (
  id                SERIAL PRIMARY KEY,
  user_id           VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  billing_receipts  BOOLEAN NOT NULL DEFAULT TRUE,
  low_balance_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  data_operations   BOOLEAN NOT NULL DEFAULT TRUE,
  trial_reminders   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_email_prefs_user_id ON user_email_preferences(user_id);
