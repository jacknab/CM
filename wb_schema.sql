-- ============================================================
-- CERTXA WEBSITE BUILDER — DATABASE SCHEMA
-- Version: 1.0  |  Tables: wb_templates, wb_websites
--
-- Safe to import into any existing database.
-- All table names are prefixed with "wb_" to avoid conflicts.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Run with:
--   psql $DATABASE_URL -f wb_schema.sql
--
-- Tables created:
--   wb_templates  — imported salon website template packages
--   wb_websites   — tenant websites created from templates
-- ============================================================


-- ── wb_templates ─────────────────────────────────────────────
-- Stores imported template packages (ZIP → built React app).
-- The `files_path` column points to the extracted + built dist
-- directory on disk; `thumbnail` is the screenshotted PNG URL.

CREATE TABLE IF NOT EXISTS wb_templates (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL,        -- 'nail_salon' | 'barbershop' | 'hair_salon'
  description TEXT,
  thumbnail   TEXT,                        -- served at /api/templates/thumbnails/:filename
  files_path  TEXT        NOT NULL,        -- absolute path to extracted template dir on disk
  build_status  TEXT,                      -- 'pending' | 'building' | 'built' | 'failed'
  build_error   TEXT,                      -- error message if build_status = 'failed'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── wb_websites ──────────────────────────────────────────────
-- Each row is one tenant salon website.
-- `slug`    → <slug>.certxa.com subdomain routing
-- `storeid` → foreign key to the platform's locations/stores table (TEXT to match users.id style)
-- `content` → JSONB blob of { fields: [{id, label, original, current, elementType}] }
--             populated by the Puppeteer content-extraction pipeline
-- `custom_domain` / `custom_domain_status` → BYOD feature (Stripe-gated)

CREATE TABLE IF NOT EXISTS wb_websites (
  id                          SERIAL      PRIMARY KEY,
  name                        TEXT        NOT NULL,
  slug                        TEXT        NOT NULL,
  storeid                     TEXT,                       -- links to locations.id (or users.id) in host DB
  template_id                 INTEGER,                    -- references wb_templates(id)
  content                     JSONB       NOT NULL DEFAULT '{}',
  published                   BOOLEAN     NOT NULL DEFAULT false,
  published_at                TIMESTAMPTZ,
  custom_domain               TEXT,                       -- e.g. 'www.mybarbershop.com'
  custom_domain_status        TEXT,                       -- NULL | 'pending_payment' | 'active'
  custom_domain_token         TEXT,                       -- random hex token used to verify domain ownership
  stripe_checkout_session_id  TEXT,                       -- Stripe session for BYOD purchase
  assigned_subdomain          TEXT,                       -- purchased subdomain assigned to this website
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique subdomain slug — enforced at DB level
ALTER TABLE wb_websites
  ADD CONSTRAINT wb_websites_slug_unique UNIQUE (slug);

-- FK to wb_templates (deferred so template can be deleted without cascading)
ALTER TABLE wb_websites
  ADD CONSTRAINT wb_websites_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES wb_templates(id)
  ON DELETE SET NULL;

-- Index: list websites by store / tenant
CREATE INDEX IF NOT EXISTS wb_websites_storeid_idx ON wb_websites (storeid);

-- Index: look up active custom domains quickly (used on every inbound request)
CREATE INDEX IF NOT EXISTS wb_websites_custom_domain_idx
  ON wb_websites (custom_domain)
  WHERE custom_domain IS NOT NULL;

-- Index: list published sites
CREATE INDEX IF NOT EXISTS wb_websites_published_idx
  ON wb_websites (published)
  WHERE published = true;


-- ── Idempotent column additions (for upgrades on existing installs) ──────────
-- Run these if you're upgrading from an earlier version of the schema.

ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS custom_domain               TEXT;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS custom_domain_status        TEXT;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS stripe_checkout_session_id  TEXT;
ALTER TABLE wb_websites ADD COLUMN IF NOT EXISTS storeid                     TEXT;
