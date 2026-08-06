-- Migration: 0011_vps_schema_sync.sql
-- Adds all tables and columns that exist in the codebase schema but are
-- missing from the VPS database. All statements use IF NOT EXISTS so this
-- is fully idempotent — safe to run multiple times.

-- ─── 1. locations: missing columns ──────────────────────────────────────────
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_allowance          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_credits            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_credits_total_purchased INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS weekly_digest_opt_out  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_training_sandbox    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sandbox_parent_store_id INTEGER;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS late_grace_period_minutes INTEGER DEFAULT 15;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cancellation_hours_cutoff INTEGER DEFAULT 24;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pos_enabled            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS store_latitude         DECIMAL(10, 8);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS store_longitude        DECIMAL(11, 8);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS yelp_alias             TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS facebook_page_id       TEXT;

-- ─── 2. services: missing deposit columns ────────────────────────────────────
ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_amount   DECIMAL(10, 2);

-- ─── 3. appointments: missing columns ───────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_required        BOOLEAN DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount          DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_paid            BOOLEAN DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gift_card_id            INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gift_card_amount        DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS loyalty_points_earned   INTEGER DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_rule         TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_parent_id    INTEGER;

-- ─── 4. staff: missing columns ───────────────────────────────────────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions          TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'active';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employment_type      TEXT DEFAULT 'employee';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS invite_token         TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS invite_expires_at    TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS invited_at           TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS joined_at            TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS removed_at           TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS invited_by_user_id   TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_changed     BOOLEAN DEFAULT false;

-- ─── 5. customers: skipped — table dropped by 0075_drop_customers.sql ───────

-- ─── 6. billing_plans ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_plans (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  price_cents     DECIMAL(12, 0) NOT NULL,
  contacts_min    DECIMAL(12, 0),
  contacts_max    DECIMAL(12, 0),
  stripe_price_id   TEXT,
  stripe_product_id TEXT,
  interval        TEXT DEFAULT 'month',
  sms_credits     DECIMAL(12, 0),
  currency        TEXT DEFAULT 'usd',
  active          BOOLEAN DEFAULT true,
  features_json   JSONB,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── 7. stripe_customers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_customers (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  customer_id   TEXT NOT NULL UNIQUE,
  store_number  INTEGER REFERENCES locations(id) UNIQUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  deleted_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id       ON stripe_customers (user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id   ON stripe_customers (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_store_number  ON stripe_customers (store_number);

-- ─── 8. stripe_subscriptions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id                    SERIAL PRIMARY KEY,
  customer_id           TEXT NOT NULL UNIQUE,
  subscription_id       TEXT,
  price_id              TEXT,
  current_period_start  BIGINT,
  current_period_end    BIGINT,
  cancel_at_period_end  BOOLEAN DEFAULT false,
  payment_method_brand  TEXT,
  payment_method_last4  TEXT,
  status                TEXT NOT NULL DEFAULT 'not_started',
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  deleted_at            TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_customer_id     ON stripe_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subs_subscription_id ON stripe_subscriptions (subscription_id);

-- ─── 9. subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      SERIAL PRIMARY KEY,
  store_number            INTEGER NOT NULL REFERENCES locations(id),
  plan_code               TEXT NOT NULL REFERENCES billing_plans(code),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  status                  TEXT,
  current_period_end      TEXT,
  current_period_start    TEXT,
  interval                TEXT DEFAULT 'month',
  price_id                TEXT,
  cancel_at_period_end    INTEGER DEFAULT 0,
  payment_method_brand    TEXT,
  payment_method_last4    TEXT,
  seat_quantity           INTEGER DEFAULT 1,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_number    ON subscriptions (store_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id   ON subscriptions (stripe_subscription_id);

-- ─── 10. stripe_orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_orders (
  id                  SERIAL PRIMARY KEY,
  checkout_session_id TEXT NOT NULL,
  payment_intent_id   TEXT NOT NULL,
  customer_id         TEXT NOT NULL,
  amount_subtotal     BIGINT NOT NULL,
  amount_total        BIGINT NOT NULL,
  currency            TEXT NOT NULL,
  payment_status      TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  deleted_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id       ON stripe_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_checkout_session  ON stripe_orders (checkout_session_id);

-- ─── 11. scheduled_plan_changes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id                      SERIAL PRIMARY KEY,
  stripe_subscription_id  TEXT NOT NULL,
  new_plan_code           TEXT NOT NULL REFERENCES billing_plans(code),
  interval                TEXT,
  effective_at            BIGINT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
  created_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_sub_id ON scheduled_plan_changes (stripe_subscription_id);

-- ─── 12. customer_billing_profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_billing_profiles (
  id                          SERIAL PRIMARY KEY,
  user_id                     TEXT NOT NULL UNIQUE REFERENCES users(id),
  salon_id                    INTEGER REFERENCES locations(id),
  stripe_customer_id          TEXT UNIQUE,
  default_payment_method_id   TEXT,
  customer_email              TEXT,
  customer_name               TEXT,
  billing_phone               TEXT,
  billing_address_line1       TEXT,
  billing_address_line2       TEXT,
  billing_city                TEXT,
  billing_state               TEXT,
  billing_zip                 TEXT,
  billing_country             TEXT DEFAULT 'US',
  tax_exempt_status           TEXT DEFAULT 'none',
  preferred_currency          TEXT DEFAULT 'usd',
  current_plan_id             INTEGER REFERENCES billing_plans(id),
  current_subscription_status TEXT DEFAULT 'none',
  trial_ends_at               TIMESTAMP,
  current_period_start        TIMESTAMP,
  current_period_end          TIMESTAMP,
  cancel_at_period_end        BOOLEAN DEFAULT false,
  canceled_at                 TIMESTAMP,
  subscription_started_at     TIMESTAMP,
  lifetime_value_cents        BIGINT DEFAULT 0,
  total_successful_payments   INTEGER DEFAULT 0,
  total_failed_payments       INTEGER DEFAULT 0,
  last_payment_date           TIMESTAMP,
  last_payment_amount_cents   BIGINT,
  last_failed_payment_date    TIMESTAMP,
  last_failed_payment_reason  TEXT,
  delinquent                  BOOLEAN DEFAULT false,
  account_hold                BOOLEAN DEFAULT false,
  internal_billing_notes      TEXT,
  account_status              TEXT DEFAULT 'active',
  suspended_at                TIMESTAMP,
  locked_at                   TIMESTAMP,
  suspended_reason            TEXT,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cbp_user_id            ON customer_billing_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_cbp_salon_id           ON customer_billing_profiles (salon_id);
CREATE INDEX IF NOT EXISTS idx_cbp_stripe_customer_id ON customer_billing_profiles (stripe_customer_id);

-- ─── 13. invoice_records ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_records (
  id                      SERIAL PRIMARY KEY,
  stripe_invoice_id       TEXT NOT NULL UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  salon_id                INTEGER REFERENCES locations(id),
  invoice_number          TEXT,
  status                  TEXT,
  paid                    BOOLEAN DEFAULT false,
  attempted               BOOLEAN DEFAULT false,
  forgiven                BOOLEAN DEFAULT false,
  collection_method       TEXT,
  currency                TEXT DEFAULT 'usd',
  subtotal_cents          BIGINT DEFAULT 0,
  tax_cents               BIGINT DEFAULT 0,
  total_cents             BIGINT DEFAULT 0,
  amount_paid_cents       BIGINT DEFAULT 0,
  amount_remaining_cents  BIGINT DEFAULT 0,
  hosted_invoice_url      TEXT,
  invoice_pdf_url         TEXT,
  billing_reason          TEXT,
  period_start            TIMESTAMP,
  period_end              TIMESTAMP,
  due_date                TIMESTAMP,
  paid_at                 TIMESTAMP,
  attempted_at            TIMESTAMP,
  next_payment_attempt    TIMESTAMP,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_invoice_id   ON invoice_records (stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_salon_id            ON invoice_records (salon_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_stripe_customer_id  ON invoice_records (stripe_customer_id);

-- ─── 14. payment_transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                          SERIAL PRIMARY KEY,
  stripe_payment_intent_id    TEXT,
  stripe_charge_id            TEXT UNIQUE,
  stripe_invoice_id           TEXT,
  salon_id                    INTEGER REFERENCES locations(id),
  user_id                     TEXT REFERENCES users(id),
  status                      TEXT,
  payment_method_brand        TEXT,
  payment_method_last4        TEXT,
  payment_method_fingerprint  TEXT,
  card_exp_month              INTEGER,
  card_exp_year               INTEGER,
  amount_cents                BIGINT DEFAULT 0,
  currency                    TEXT DEFAULT 'usd',
  failure_code                TEXT,
  failure_message             TEXT,
  receipt_url                 TEXT,
  refunded                    BOOLEAN DEFAULT false,
  refund_amount_cents         BIGINT DEFAULT 0,
  dispute_status              TEXT,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_txn_salon_id       ON payment_transactions (salon_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_charge_id ON payment_transactions (stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_stripe_pi_id   ON payment_transactions (stripe_payment_intent_id);

-- ─── 15. stripe_webhook_events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id                    SERIAL PRIMARY KEY,
  stripe_event_id       TEXT NOT NULL UNIQUE,
  event_type            TEXT NOT NULL,
  api_version           TEXT,
  processed             BOOLEAN DEFAULT false,
  processing_attempts   INTEGER DEFAULT 0,
  processing_error      TEXT,
  payload_json          JSONB,
  received_at           TIMESTAMP DEFAULT NOW(),
  processed_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id  ON stripe_webhook_events (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type      ON stripe_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed ON stripe_webhook_events (processed);

-- ─── 16. billing_activity_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_activity_logs (
  id            SERIAL PRIMARY KEY,
  salon_id      INTEGER REFERENCES locations(id),
  user_id       TEXT REFERENCES users(id),
  event_type    TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'info',
  message       TEXT NOT NULL,
  metadata_json JSONB,
  source        TEXT DEFAULT 'system',
  ip_address    TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_activity_salon_id    ON billing_activity_logs (salon_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_user_id     ON billing_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_activity_event_type  ON billing_activity_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_billing_activity_created_at  ON billing_activity_logs (created_at);

-- ─── 17. refunds ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id                      SERIAL PRIMARY KEY,
  stripe_refund_id        TEXT UNIQUE,
  stripe_charge_id        TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id       TEXT,
  salon_id                INTEGER REFERENCES locations(id),
  user_id                 TEXT REFERENCES users(id),
  initiated_by_user_id    TEXT REFERENCES users(id),
  amount_cents            BIGINT NOT NULL,
  currency                TEXT DEFAULT 'usd',
  reason                  TEXT,
  internal_reason_notes   TEXT,
  refund_type             TEXT DEFAULT 'manual',
  status                  TEXT NOT NULL DEFAULT 'pending',
  receipt_url             TEXT,
  metadata_json           JSONB,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_salon_id          ON refunds (salon_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id  ON refunds (stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_charge_id  ON refunds (stripe_charge_id);

-- ─── 18. subscription_plan_changes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plan_changes (
  id                      SERIAL PRIMARY KEY,
  salon_id                INTEGER REFERENCES locations(id),
  user_id                 TEXT REFERENCES users(id),
  stripe_subscription_id  TEXT,
  old_plan_id             INTEGER REFERENCES billing_plans(id),
  new_plan_id             INTEGER REFERENCES billing_plans(id),
  old_price_cents         BIGINT,
  new_price_cents         BIGINT,
  change_type             TEXT,
  proration_used          BOOLEAN DEFAULT false,
  prorated_amount_cents   BIGINT,
  effective_date          TIMESTAMP,
  initiated_by            TEXT,
  reason                  TEXT,
  metadata_json           JSONB,
  created_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_salon_id       ON subscription_plan_changes (salon_id);
CREATE INDEX IF NOT EXISTS idx_sub_plan_changes_stripe_sub_id  ON subscription_plan_changes (stripe_subscription_id);

-- ─── 19. google_business_accounts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_business_accounts (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  user_id             VARCHAR NOT NULL REFERENCES users(id),
  google_account_id   TEXT NOT NULL,
  account_name        TEXT,
  access_token        TEXT,
  refresh_token       TEXT,
  token_expiry        TIMESTAMP,
  scopes              TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gba_store_id_idx         ON google_business_accounts (store_id);
CREATE INDEX IF NOT EXISTS gba_user_id_idx          ON google_business_accounts (user_id);
CREATE INDEX IF NOT EXISTS gba_google_account_id_idx ON google_business_accounts (google_account_id);

-- ─── 20. google_business_locations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_business_locations (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL REFERENCES locations(id),
  user_id                 VARCHAR NOT NULL REFERENCES users(id),
  business_account_id     INTEGER NOT NULL REFERENCES google_business_accounts(id),
  location_resource_name  TEXT NOT NULL,
  location_id             TEXT NOT NULL,
  location_name           TEXT,
  address                 TEXT,
  phone                   TEXT,
  is_selected             BOOLEAN DEFAULT false,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gbl_store_id_idx              ON google_business_locations (store_id);
CREATE INDEX IF NOT EXISTS gbl_user_id_idx               ON google_business_locations (user_id);
CREATE INDEX IF NOT EXISTS gbl_business_account_id_idx   ON google_business_locations (business_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS gbl_location_resource_name_uidx ON google_business_locations (location_resource_name);

-- ─── 21. google_business_sync_logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_business_sync_logs (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER REFERENCES locations(id),
  user_id         VARCHAR REFERENCES users(id),
  location_id     INTEGER REFERENCES google_business_locations(id),
  sync_type       TEXT NOT NULL,
  status          TEXT NOT NULL,
  error_message   TEXT,
  reviews_synced  INTEGER,
  synced_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gbsl_store_id_idx    ON google_business_sync_logs (store_id);
CREATE INDEX IF NOT EXISTS gbsl_location_id_idx ON google_business_sync_logs (location_id);
CREATE INDEX IF NOT EXISTS gbsl_synced_at_idx   ON google_business_sync_logs (synced_at);

-- google_reviews: add new FK column if missing
ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS gb_location_id INTEGER REFERENCES google_business_locations(id);

-- google_business_profiles: add location_address if missing
ALTER TABLE google_business_profiles ADD COLUMN IF NOT EXISTS location_address TEXT;

-- ─── 22. Training system tables ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_action_categories (
  id                SERIAL PRIMARY KEY,
  slug              VARCHAR(64) NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  default_help_level INTEGER NOT NULL DEFAULT 3,
  high_risk         BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS training_action_steps (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES training_action_categories(id) ON DELETE CASCADE,
  "order"     INTEGER NOT NULL DEFAULT 0,
  step_json   JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_steps_category ON training_action_steps (category_id);

CREATE TABLE IF NOT EXISTS training_user_state (
  id              SERIAL PRIMARY KEY,
  user_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     INTEGER NOT NULL REFERENCES training_action_categories(id) ON DELETE CASCADE,
  help_level      INTEGER NOT NULL DEFAULT 3,
  success_streak  INTEGER NOT NULL DEFAULT 0,
  failures        INTEGER NOT NULL DEFAULT 0,
  total_attempts  INTEGER NOT NULL DEFAULT 0,
  last_seen_at    TIMESTAMP,
  graduated_at    TIMESTAMP,
  pinned_level    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_user_category ON training_user_state (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_training_state_user ON training_user_state (user_id);

CREATE TABLE IF NOT EXISTS training_events (
  id                SERIAL PRIMARY KEY,
  user_id           VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id       INTEGER NOT NULL REFERENCES training_action_categories(id) ON DELETE CASCADE,
  type              VARCHAR(32) NOT NULL,
  help_level_at_time INTEGER NOT NULL,
  occurred_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata          JSONB
);
CREATE INDEX IF NOT EXISTS idx_training_events_user_cat ON training_events (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_training_events_occurred ON training_events (occurred_at);

CREATE TABLE IF NOT EXISTS training_user_profile (
  user_id                     VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  graduated_at                TIMESTAMP,
  graduation_notified_owner   BOOLEAN NOT NULL DEFAULT false,
  graduation_staff_notified   BOOLEAN NOT NULL DEFAULT false,
  day7_digest_sent_at         TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_settings (
  store_id                        INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  enabled                         BOOLEAN NOT NULL DEFAULT true,
  auto_enroll_new_staff           BOOLEAN NOT NULL DEFAULT true,
  graduation_min_days             INTEGER NOT NULL DEFAULT 7,
  show_help_bubble_after_graduation BOOLEAN NOT NULL DEFAULT true
);

-- ─── 23. conversations / messages (AI chatbot) ───────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── 24. Seed sms_allowance from legacy sms_tokens ──────────────────────────
UPDATE locations
SET sms_allowance = sms_tokens
WHERE sms_allowance = 0 AND sms_tokens > 0;
