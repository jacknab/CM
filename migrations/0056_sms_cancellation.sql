ALTER TABLE sms_settings
  ADD COLUMN IF NOT EXISTS sms_cancellation_enabled boolean NOT NULL DEFAULT true;
