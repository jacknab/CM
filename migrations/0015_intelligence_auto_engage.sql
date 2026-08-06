-- Migration: add auto_engage_enabled to sms_settings
-- Controls whether the Intelligence system autonomously sends SMS messages.
-- Defaults to TRUE so existing stores keep their current behaviour.

ALTER TABLE sms_settings
  ADD COLUMN IF NOT EXISTS auto_engage_enabled BOOLEAN NOT NULL DEFAULT TRUE;
