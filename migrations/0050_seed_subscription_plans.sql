-- Migration 0050: Ensure subscription_plans table exists and seed Basic /
-- Professional / Enterprise plans.
--
-- The CREATE TABLE IF NOT EXISTS guard makes this safe on any DB that seeded
-- migration 0034 as baseline without executing it (common on Replit dev DBs).
-- ON CONFLICT DO NOTHING keeps the INSERTs idempotent.

CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id"                      SERIAL PRIMARY KEY,
  "code"                    TEXT NOT NULL,
  "name"                    TEXT NOT NULL,
  "description"             TEXT,
  "price_monthly_cents"     INTEGER NOT NULL DEFAULT 0,
  "price_yearly_cents"      INTEGER NOT NULL DEFAULT 0,
  "stripe_price_id_monthly" TEXT,
  "stripe_price_id_yearly"  TEXT,
  "is_active"               BOOLEAN NOT NULL DEFAULT true,
  "is_public"               BOOLEAN NOT NULL DEFAULT true,
  "sort_order"              INTEGER NOT NULL DEFAULT 0,
  "created_at"              TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_code_uidx"
  ON "subscription_plans" ("code");

CREATE INDEX IF NOT EXISTS "idx_subscription_plans_is_active"
  ON "subscription_plans" ("is_active");

CREATE INDEX IF NOT EXISTS "idx_subscription_plans_sort_order"
  ON "subscription_plans" ("sort_order");

INSERT INTO subscription_plans
  (code, name, description, price_monthly_cents, price_yearly_cents, sort_order, is_active, is_public, created_at, updated_at)
VALUES
  ('basic',        'Basic',        'Perfect for solo nail technicians and independent artists', 4900,  49000, 10, true, true, NOW(), NOW()),
  ('professional', 'Professional', 'Ideal for nail salons with a small team',                  9900,  99000, 20, true, true, NOW(), NOW()),
  ('enterprise',   'Enterprise',   'Built for established salons with large teams',            19900, 199000, 30, true, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
