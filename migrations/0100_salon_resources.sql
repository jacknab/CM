-- Migration 0100: Salon Resources
-- Creates booking resources (manicure stations, pedicure chairs) set up during onboarding.

CREATE TABLE IF NOT EXISTS salon_resources (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('station', 'chair', 'room', 'seat')),
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salon_resources_store_id ON salon_resources(store_id);
