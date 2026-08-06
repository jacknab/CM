-- Migration: 0024_replit_migration_schema_sync.sql
-- Adds all tables and columns that exist in the codebase schema but are
-- missing from the Replit database. All statements use IF NOT EXISTS so this
-- is fully idempotent — safe to run multiple times.

-- ─── 1. locations: missing columns ──────────────────────────────────────────
ALTER TABLE locations ADD COLUMN IF NOT EXISTS parking_options         JSONB;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS accessibility_features  JSONB;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS beverage_options        JSONB;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS platform_credits        DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- ─── 2. wb_templates table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wb_templates (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT,
  thumbnail    TEXT,
  files_path   TEXT NOT NULL,
  build_status TEXT,
  build_error  TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─── 3. wb_websites table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wb_websites (
  id                        SERIAL PRIMARY KEY,
  name                      TEXT NOT NULL,
  slug                      TEXT NOT NULL UNIQUE,
  storeid                   TEXT,
  template_id               INTEGER,
  content                   JSONB NOT NULL DEFAULT '{}',
  published                 BOOLEAN NOT NULL DEFAULT false,
  published_at              TIMESTAMP WITH TIME ZONE,
  custom_domain             TEXT,
  custom_domain_status      TEXT,
  custom_domain_token       TEXT,
  stripe_checkout_session_id TEXT,
  assigned_subdomain        TEXT,
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─── 4. wb_purchased_subdomains table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS wb_purchased_subdomains (
  id                        SERIAL PRIMARY KEY,
  storeid                   TEXT NOT NULL,
  subdomain                 TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending_payment',
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at                TIMESTAMP WITH TIME ZONE
);

-- ─── 5. wb_image_library table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wb_image_library (
  id           SERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  category     TEXT NOT NULL,
  original_url TEXT,
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
