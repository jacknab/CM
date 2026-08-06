-- Migration 0034: Feature-Based Subscription System
-- Creates: features, subscription_plans, plan_features, store_subscriptions, feature_usage
-- Seeds:   14 core features, 4 plans (Free/Solo/Pro/Agency), full plan-feature mappings.

-- ─── Feature Registry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "features" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL DEFAULT 'general',
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_features_category"
  ON "features" ("category");

CREATE INDEX IF NOT EXISTS "idx_features_is_active"
  ON "features" ("is_active");

-- ─── Subscription Plans ───────────────────────────────────────────────────────
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

-- ─── Plan Features ────────────────────────────────────────────────────────────
-- limit_value: NULL = unlimited, positive integer = hard cap per billing period.
CREATE TABLE IF NOT EXISTS "plan_features" (
  "id"           SERIAL PRIMARY KEY,
  "plan_id"      INTEGER NOT NULL REFERENCES "subscription_plans"("id") ON DELETE CASCADE,
  "feature_id"   TEXT    NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "limit_value"  INTEGER,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_plan_feature_uidx"
  ON "plan_features" ("plan_id", "feature_id");

CREATE INDEX IF NOT EXISTS "idx_plan_features_plan_id"
  ON "plan_features" ("plan_id");

CREATE INDEX IF NOT EXISTS "idx_plan_features_feature_id"
  ON "plan_features" ("feature_id");

-- ─── Store Subscriptions ──────────────────────────────────────────────────────
-- One row per subscription event. Active plan = MAX(id) WHERE store_id = X
-- AND status IN ('active', 'trialing').
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

CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_store_id"
  ON "store_subscriptions" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_plan_id"
  ON "store_subscriptions" ("plan_id");

CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_status"
  ON "store_subscriptions" ("status");

CREATE INDEX IF NOT EXISTS "idx_store_subscriptions_store_status"
  ON "store_subscriptions" ("store_id", "status");

-- ─── Feature Usage ────────────────────────────────────────────────────────────
-- period_start: 'YYYY-MM-DD' (always the 1st of the billing month).
-- Upsert pattern: INSERT ... ON CONFLICT DO UPDATE SET usage_count = usage_count + N.
CREATE TABLE IF NOT EXISTS "feature_usage" (
  "id"              SERIAL PRIMARY KEY,
  "store_id"        INTEGER NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "feature_id"      TEXT    NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
  "period_start"    TEXT    NOT NULL,
  "usage_count"     INTEGER NOT NULL DEFAULT 0,
  "last_updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_usage_store_feature_period_uidx"
  ON "feature_usage" ("store_id", "feature_id", "period_start");

CREATE INDEX IF NOT EXISTS "idx_feature_usage_store_id"
  ON "feature_usage" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_feature_usage_feature_id"
  ON "feature_usage" ("feature_id");

-- ─── Seed: Feature Registry ───────────────────────────────────────────────────
INSERT INTO "features" ("id", "name", "description", "category", "sort_order") VALUES
  ('staff',               'Staff Members',         'Add and manage staff members',                             'staff',     10),
  ('calendars',           'Calendars',             'Multiple calendar views and scheduling',                   'booking',   20),
  ('sms_notifications',   'SMS Notifications',     'Automated SMS reminders and alerts to clients',            'messaging', 30),
  ('online_booking_page', 'Online Booking Page',   'Public-facing booking page for clients to self-book',     'booking',   40),
  ('domain',              'Custom Domain',         'Connect a custom domain to the booking page',              'website',   50),
  ('waitlist',            'Waitlist',              'Allow clients to join a waitlist for fully-booked slots',  'booking',   60),
  ('queue',               'Check-in Queue',        'Digital check-in and walk-in queue management',           'booking',   70),
  ('commission_tracking', 'Commission Tracking',   'Track commissions and run payroll for staff',              'staff',     80),
  ('earnings_dashboard',  'Earnings Dashboard',    'Revenue and earnings summary dashboard',                   'reporting', 90),
  ('advanced_reporting',  'Advanced Reporting',    'In-depth analytics, trends, and exportable reports',       'reporting', 100),
  ('contractors',         'Contractor Management', 'Manage booth renters and independent contractors',         'staff',     110),
  ('ai_receptionist',     'AI Receptionist',       'AI-powered phone receptionist that books appointments',    'ai',        120),
  ('loyalty_rewards',     'Loyalty Rewards',       'Points-based loyalty and rewards programme for clients',   'marketing', 130),
  ('pos',                 'Point of Sale',         'In-person checkout, payments, and cash drawer management', 'pos',       140)
ON CONFLICT ("id") DO NOTHING;

-- ─── Seed: Subscription Plans ─────────────────────────────────────────────────
INSERT INTO "subscription_plans"
  ("code", "name", "description", "price_monthly_cents", "price_yearly_cents", "is_active", "is_public", "sort_order")
VALUES
  ('free',   'Free',   'Get started with essential booking tools at no cost.',        0,     0,     true, true, 10),
  ('solo',   'Solo',   'Perfect for solo practitioners and independent stylists.',    2900,  29000, true, true, 20),
  ('pro',    'Pro',    'For growing salons and multi-staff teams.',                   5900,  59000, true, true, 30),
  ('agency', 'Agency', 'Unlimited scale for large salons and multi-location brands.', 9900, 99000, true, true, 40)
ON CONFLICT ("code") DO NOTHING;

-- ─── Seed: Plan Features — Free ───────────────────────────────────────────────
-- NULL::INTEGER cast is required in UNION ALL to avoid type-inference errors when
-- mixing integer literals and NULLs across branches.
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value")
SELECT id, 'staff',               true, 2::INTEGER            FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'calendars',           true, 1::INTEGER            FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'sms_notifications',   true, 50::INTEGER           FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'online_booking_page', true, 1::INTEGER            FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'waitlist',            true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'queue',               true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'free' UNION ALL
SELECT id, 'pos',                 true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'free'
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;

-- ─── Seed: Plan Features — Solo ───────────────────────────────────────────────
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value")
SELECT id, 'staff',               true, 3::INTEGER            FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'calendars',           true, 3::INTEGER            FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'sms_notifications',   true, 200::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'online_booking_page', true, 1::INTEGER            FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'domain',              true, 1::INTEGER            FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'waitlist',            true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'queue',               true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'commission_tracking', true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'earnings_dashboard',  true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'pos',                 true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo' UNION ALL
SELECT id, 'loyalty_rewards',     true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'solo'
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;

-- ─── Seed: Plan Features — Pro ────────────────────────────────────────────────
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value")
SELECT id, 'staff',               true, 10::INTEGER           FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'calendars',           true, 10::INTEGER           FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'sms_notifications',   true, 500::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'online_booking_page', true, 3::INTEGER            FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'domain',              true, 1::INTEGER            FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'waitlist',            true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'queue',               true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'commission_tracking', true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'earnings_dashboard',  true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'advanced_reporting',  true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'contractors',         true, 5::INTEGER            FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'pos',                 true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'loyalty_rewards',     true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro' UNION ALL
SELECT id, 'ai_receptionist',     true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'pro'
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;

-- ─── Seed: Plan Features — Agency ────────────────────────────────────────────
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value")
SELECT id, 'staff',               true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'calendars',           true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'sms_notifications',   true, 2000::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'online_booking_page', true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'domain',              true, 3::INTEGER             FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'waitlist',            true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'queue',               true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'commission_tracking', true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'earnings_dashboard',  true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'advanced_reporting',  true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'contractors',         true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'pos',                 true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'loyalty_rewards',     true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency' UNION ALL
SELECT id, 'ai_receptionist',     true, NULL::INTEGER          FROM "subscription_plans" WHERE "code" = 'agency'
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;
