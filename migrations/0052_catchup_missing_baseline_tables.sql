-- Migration 0052: Re-apply all tables that were seeded as baseline without
-- executing on Replit dev DBs. Every statement uses IF NOT EXISTS so it is
-- completely safe to run on any DB that already has some or all of these tables.

-- ─── From 0034: Feature-based subscription system ────────────────────────────

CREATE TABLE IF NOT EXISTS "features" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL DEFAULT 'general',
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_features_category"  ON "features" ("category");
CREATE INDEX IF NOT EXISTS "idx_features_is_active" ON "features" ("is_active");

CREATE TABLE IF NOT EXISTS "plan_features" (
  "id"           SERIAL PRIMARY KEY,
  "plan_id"      INTEGER NOT NULL REFERENCES "subscription_plans"("id") ON DELETE CASCADE,
  "feature_id"   TEXT    NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "limit_value"  INTEGER,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_plan_feature_uidx" ON "plan_features" ("plan_id", "feature_id");
CREATE INDEX IF NOT EXISTS "idx_plan_features_plan_id"    ON "plan_features" ("plan_id");
CREATE INDEX IF NOT EXISTS "idx_plan_features_feature_id" ON "plan_features" ("feature_id");

CREATE TABLE IF NOT EXISTS "store_subscriptions" (
  "id"                      SERIAL PRIMARY KEY,
  "store_id"                INTEGER NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "plan_id"                 INTEGER NOT NULL REFERENCES "subscription_plans"("id"),
  "status"                  TEXT    NOT NULL DEFAULT 'active',
  "current_period_start"    TIMESTAMP,
  "current_period_end"      TIMESTAMP,
  "canceled_at"             TIMESTAMP,
  "stripe_subscription_id"  TEXT,
  "stripe_customer_id"      TEXT,
  "created_at"              TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_store_id"     ON "store_subscriptions" ("store_id");
CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_plan_id"      ON "store_subscriptions" ("plan_id");
CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_status"       ON "store_subscriptions" ("status");
CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_store_status" ON "store_subscriptions" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "feature_usage" (
  "id"              SERIAL PRIMARY KEY,
  "store_id"        INTEGER NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "feature_id"      TEXT    NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
  "period_start"    TEXT    NOT NULL,
  "usage_count"     INTEGER NOT NULL DEFAULT 0,
  "last_updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_usage_store_feature_period_uidx" ON "feature_usage" ("store_id", "feature_id", "period_start");
CREATE INDEX IF NOT EXISTS "idx_feature_usage_store_id"   ON "feature_usage" ("store_id");
CREATE INDEX IF NOT EXISTS "idx_feature_usage_feature_id" ON "feature_usage" ("feature_id");

-- ─── From 0044: Stripe Connect salon payment accounts ────────────────────────

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

-- ─── From 0024: Website builder tables ───────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS wb_websites (
  id                         SERIAL PRIMARY KEY,
  name                       TEXT NOT NULL,
  slug                       TEXT NOT NULL UNIQUE,
  storeid                    TEXT,
  template_id                INTEGER,
  content                    JSONB NOT NULL DEFAULT '{}',
  published                  BOOLEAN NOT NULL DEFAULT false,
  published_at               TIMESTAMP WITH TIME ZONE,
  custom_domain              TEXT,
  custom_domain_status       TEXT,
  custom_domain_token        TEXT,
  stripe_checkout_session_id TEXT,
  assigned_subdomain         TEXT,
  ssl_status                 TEXT,
  ssl_provisioned_at         TIMESTAMP WITH TIME ZONE,
  ssl_error                  TEXT,
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wb_purchased_subdomains (
  id                         SERIAL PRIMARY KEY,
  storeid                    TEXT NOT NULL,
  subdomain                  TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT,
  status                     TEXT NOT NULL DEFAULT 'pending_payment',
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at                 TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS wb_image_library (
  id           SERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  category     TEXT NOT NULL,
  original_url TEXT,
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
