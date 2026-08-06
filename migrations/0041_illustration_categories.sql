-- Migration: add illustration category support
-- Adds the service_illustration_categories lookup table and the three
-- illustration-related columns to services that were added to the Drizzle
-- schema but never applied to the production database.

CREATE TABLE IF NOT EXISTS service_illustration_categories (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  image_url    TEXT,
  industry     TEXT NOT NULL DEFAULT 'NAIL_SALON',
  is_active    BOOLEAN DEFAULT TRUE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS illustration_category_id INTEGER REFERENCES service_illustration_categories(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS custom_illustration_url   TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS auto_assigned             BOOLEAN NOT NULL DEFAULT FALSE;
