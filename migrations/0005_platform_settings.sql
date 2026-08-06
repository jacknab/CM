-- Migration: Create platform_settings table
-- This migration creates a table to store platform-wide settings

CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  trial_period_days INTEGER NOT NULL DEFAULT 30,
  mailgun_api_key TEXT,
  mailgun_domain TEXT,
  mailgun_from_email TEXT,
  mailgun_from_name TEXT,
  mailgun_enabled BOOLEAN DEFAULT false,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  twilio_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings if table is empty
INSERT INTO platform_settings (
  trial_period_days,
  mailgun_from_email,
  mailgun_from_name
) SELECT 
  30,
  'noreply@yourdomain.com',
  'Booking Platform'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings);

-- Create index for efficient lookups
CREATE UNIQUE INDEX platform_settings_single_row ON platform_settings ((1));
