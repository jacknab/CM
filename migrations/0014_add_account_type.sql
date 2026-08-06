-- Migration: add account_type column to users table
-- Used to identify temporary "tester" accounts created for demo sessions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(32);
