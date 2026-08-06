-- Migration: create commission_structures table
-- This table was defined in the Drizzle schema but never had a migration file.
-- Applied directly via psql on Replit dev DB; this file ensures VPS parity.

CREATE TABLE IF NOT EXISTS commission_structures (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  employee_percent DECIMAL(5,2) NOT NULL,
  house_percent    DECIMAL(5,2) NOT NULL,
  applies_to       TEXT DEFAULT 'both',
  is_default       BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_store_id ON commission_structures(store_id);
