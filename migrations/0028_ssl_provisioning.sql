-- Migration: 0028_ssl_provisioning.sql
-- Adds SSL certificate provisioning state columns to wb_websites.
-- All statements use IF NOT EXISTS / safe defaults — fully idempotent.

ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS ssl_status        TEXT;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS ssl_provisioned_at TIMESTAMPTZ;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS ssl_error         TEXT;
