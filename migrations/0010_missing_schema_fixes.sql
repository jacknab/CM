-- Migration: 0010_missing_schema_fixes.sql
-- Run this on your VPS database to apply schema changes that were missing
-- from the initial schema.sql snapshot.
-- All statements are idempotent — safe to run multiple times.

-- 1. Add weekly_digest_opt_out to locations (stores) table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS weekly_digest_opt_out BOOLEAN NOT NULL DEFAULT false;

-- 2. AI Chatbot conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. AI Chatbot messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
