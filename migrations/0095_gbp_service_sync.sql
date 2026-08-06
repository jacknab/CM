-- Migration 0095: Google Business Profile service sync settings
-- Stores per-store sync policy for keeping GBP services in sync with Certxa

CREATE TABLE IF NOT EXISTS google_service_sync_settings (
  id                 SERIAL PRIMARY KEY,
  store_id           INTEGER NOT NULL UNIQUE REFERENCES locations(id),
  sync_enabled       BOOLEAN NOT NULL DEFAULT false,
  sync_name          BOOLEAN NOT NULL DEFAULT true,
  sync_description   BOOLEAN NOT NULL DEFAULT true,
  sync_price         BOOLEAN NOT NULL DEFAULT true,
  sync_add_new       BOOLEAN NOT NULL DEFAULT true,
  sync_remove_deleted BOOLEAN NOT NULL DEFAULT false,
  sync_mode          TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'manual'
  last_synced_at     TIMESTAMP,
  last_sync_status   TEXT,                           -- 'success' | 'failed' | null
  last_sync_error    TEXT,
  last_sync_count    INTEGER,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gsss_store_id_idx ON google_service_sync_settings(store_id);
