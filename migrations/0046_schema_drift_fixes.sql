-- Migration 0046: Patch all schema drift accumulated since the original baseline
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards on everything).
-- This ensures any existing installation gets all columns/tables added after baseline.

-- ── users ─────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT;

-- ── staff ─────────────────────────────────────────────────────────────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_thumb_url TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;

-- ── clients ───────────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── services ──────────────────────────────────────────────────────────────────
ALTER TABLE services ADD COLUMN IF NOT EXISTS illustration_category_id INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS custom_illustration_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT FALSE;

-- ── addons ────────────────────────────────────────────────────────────────────
ALTER TABLE addons ADD COLUMN IF NOT EXISTS type            TEXT NOT NULL DEFAULT 'full';
ALTER TABLE addons ADD COLUMN IF NOT EXISTS parent_addon_id INTEGER;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS is_stackable    BOOLEAN NOT NULL DEFAULT true;

-- ── support_tickets ───────────────────────────────────────────────────────────
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS account_name        TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_name TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category            TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subcategory         TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_response_at    TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at   TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at         TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at           TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS tags                JSONB;

-- ── support_agents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_agents (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  role          VARCHAR(32) NOT NULL DEFAULT 'agent',
  password_hash TEXT,
  first_name    TEXT,
  last_name     TEXT,
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS password_hash  TEXT;
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS first_name     TEXT;
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS last_name      TEXT;
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS avatar_url     TEXT;
ALTER TABLE support_agents ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;

-- ── service_illustration_categories ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_illustration_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url   TEXT,
  industry    TEXT NOT NULL DEFAULT 'NAIL_SALON',
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── payout_runs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_runs (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL,
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  status               VARCHAR(32) NOT NULL DEFAULT 'draft',
  total_gross          NUMERIC(12,2),
  total_deductions     NUMERIC(12,2),
  total_net            NUMERIC(12,2),
  contractor_count     INTEGER DEFAULT 0,
  notes                TEXT,
  auto_generated       BOOLEAN NOT NULL DEFAULT false,
  auto_approve_after   TIMESTAMPTZ,
  created_by_user_id   TEXT,
  approved_by_user_id  TEXT,
  approved_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE payout_runs ADD COLUMN IF NOT EXISTS auto_generated     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payout_runs ADD COLUMN IF NOT EXISTS auto_approve_after TIMESTAMPTZ;

-- ── payout_run_items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_run_items (
  id               SERIAL PRIMARY KEY,
  payout_run_id    INTEGER NOT NULL REFERENCES payout_runs(id),
  contractor_id    INTEGER,
  staff_id         INTEGER,
  contractor_name  TEXT,
  gross_amount     NUMERIC(12,2),
  service_revenue  NUMERIC(12,2),
  product_revenue  NUMERIC(12,2),
  tips             NUMERIC(12,2),
  deductions       NUMERIC(12,2),
  total_deductions NUMERIC(12,2),
  net_amount       NUMERIC(12,2),
  appointment_count INTEGER DEFAULT 0,
  payout_method    VARCHAR(32),
  status           VARCHAR(32) NOT NULL DEFAULT 'pending',
  failure_reason   TEXT,
  check_number     TEXT,
  paid_at          TIMESTAMPTZ,
  details          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS contractor_name  TEXT;
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS service_revenue  NUMERIC(12,2);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS product_revenue  NUMERIC(12,2);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS tips             NUMERIC(12,2);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS total_deductions NUMERIC(12,2);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS payout_method    VARCHAR(32);
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS status           VARCHAR(32) NOT NULL DEFAULT 'pending';
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS failure_reason   TEXT;
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS check_number     TEXT;
ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;

-- ── contractors ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractors (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL,
  staff_id                INTEGER,
  name                    TEXT NOT NULL,
  first_name              TEXT,
  last_name               TEXT,
  profile_image           TEXT,
  email                   TEXT,
  phone                   TEXT,
  role                    TEXT,
  commission_rate         NUMERIC(5,2),
  product_commission_rate NUMERIC(5,2),
  commission_structure_id INTEGER,
  payment_method          VARCHAR(32) DEFAULT 'manual',
  payout_method           VARCHAR(32),
  payment_details         JSONB DEFAULT '{}',
  tax_id                  TEXT,
  tax_classification      VARCHAR(32),
  tax_id_last4            TEXT,
  stripe_account_id       TEXT,
  onboarding_status       VARCHAR(32),
  bank_verified           BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT,
  status                  VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS first_name              TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS last_name               TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_image           TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS role                    TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS commission_rate         NUMERIC(5,2);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS product_commission_rate NUMERIC(5,2);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS payout_method           VARCHAR(32);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS tax_classification      VARCHAR(32);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS tax_id_last4            TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_account_id       TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS onboarding_status       VARCHAR(32);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_verified           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS is_active               BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS notes                   TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS commission_structure_id INTEGER;

-- ── store_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_subscriptions (
  id                       SERIAL PRIMARY KEY,
  store_id                 INTEGER NOT NULL UNIQUE,
  plan_id                  INTEGER,
  status                   VARCHAR(32) NOT NULL DEFAULT 'active',
  trial_ends_at            TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  canceled_at              TIMESTAMPTZ,
  stripe_subscription_id   TEXT,
  stripe_customer_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE store_subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- ── data_transfer_jobs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_transfer_jobs (
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL,
  user_id              TEXT,
  mode                 VARCHAR(32)  NOT NULL DEFAULT 'self_service',
  status               VARCHAR(32)  NOT NULL DEFAULT 'pending_upload',
  source_platform      VARCHAR(64),
  files_json           JSONB        NOT NULL DEFAULT '[]',
  mapping_json         JSONB        NOT NULL DEFAULT '{}',
  preview_json         JSONB        NOT NULL DEFAULT '{}',
  import_ids_json      JSONB        NOT NULL DEFAULT '{}',
  imported_counts_json JSONB        NOT NULL DEFAULT '{}',
  errors_json          JSONB        NOT NULL DEFAULT '[]',
  reject_reason        TEXT,
  review_notes         TEXT,
  reviewed_by_user_id  TEXT,
  reviewed_at          TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at         TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_data_transfer_jobs_store_id ON data_transfer_jobs (store_id);
CREATE INDEX IF NOT EXISTS idx_data_transfer_jobs_status   ON data_transfer_jobs (status);

-- ── store_payment_accounts (Stripe Connect) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS store_payment_accounts (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL UNIQUE,
  provider            VARCHAR(32) NOT NULL DEFAULT 'stripe',
  provider_account_id TEXT NOT NULL,
  status              VARCHAR(32) NOT NULL DEFAULT 'connected',
  charges_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted   BOOLEAN NOT NULL DEFAULT FALSE,
  display_name        TEXT,
  email               TEXT,
  country             TEXT,
  currency            TEXT,
  raw_data            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_store_id ON store_payment_accounts (store_id);
CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_provider ON store_payment_accounts (provider, provider_account_id);
