-- Migration: 0027_vps_catchup.sql
-- Comprehensive catch-up for VPS databases that missed migrations 0014–0026.
-- Every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — fully idempotent.
-- Run this once on the VPS to restore login and sync the schema.

-- ─── users table ─────────────────────────────────────────────────────────────
-- account_type was added in 0014; its absence causes SELECT from users to crash
-- with "column does not exist", which makes the login endpoint return 500.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(32);

-- ─── appointments table ──────────────────────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_requested_staff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_hidden        BOOLEAN NOT NULL DEFAULT false;

-- ─── locations table ─────────────────────────────────────────────────────────
ALTER TABLE locations ADD COLUMN IF NOT EXISTS parking_options        JSONB DEFAULT '[]';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS accessibility_features JSONB DEFAULT '[]';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS beverage_options       JSONB;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS platform_credits       DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sales_tax_rate         DECIMAL(5,4)  NOT NULL DEFAULT 0.0000;

-- ─── products table ──────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS upc            TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2);

-- ─── Website builder tables ───────────────────────────────────────────────────
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
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS wb_purchased_subdomains (
  id                         SERIAL PRIMARY KEY,
  storeid                    TEXT NOT NULL,
  subdomain                  TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT,
  status                     TEXT NOT NULL DEFAULT 'pending_payment',
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at                 TIMESTAMP WITH TIME ZONE
);

-- ─── Contractor / payout tables ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractors (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id                INTEGER REFERENCES staff(id),
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  profile_image           TEXT,
  role                    TEXT DEFAULT 'stylist',
  commission_rate         DECIMAL(5,2) DEFAULT 0,
  product_commission_rate DECIMAL(5,2) DEFAULT 0,
  payout_method           TEXT DEFAULT 'ach',
  stripe_account_id       TEXT,
  stripe_onboarding_url   TEXT,
  tax_classification      TEXT DEFAULT 'individual',
  tax_id_last4            TEXT,
  onboarding_status       TEXT DEFAULT 'pending',
  bank_verified           BOOLEAN DEFAULT FALSE,
  is_active               BOOLEAN DEFAULT TRUE,
  notes                   TEXT,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contractors_store_id ON contractors(store_id);
CREATE INDEX IF NOT EXISTS idx_contractors_staff_id ON contractors(staff_id);

CREATE TABLE IF NOT EXISTS contractor_bank_accounts (
  id                     SERIAL PRIMARY KEY,
  contractor_id          INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  account_type           TEXT DEFAULT 'checking',
  bank_name              TEXT,
  routing_last4          TEXT,
  account_last4          TEXT,
  verification_status    TEXT DEFAULT 'pending',
  stripe_bank_account_id TEXT,
  is_default             BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cba_contractor_id ON contractor_bank_accounts(contractor_id);

CREATE TABLE IF NOT EXISTS payout_deduction_rules (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id INTEGER REFERENCES contractors(id),
  name          TEXT NOT NULL,
  type          TEXT DEFAULT 'fixed',
  amount        DECIMAL(10,2) DEFAULT 0,
  applies_to    TEXT DEFAULT 'all',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pdr_store_id ON payout_deduction_rules(store_id);

CREATE TABLE IF NOT EXISTS payout_runs (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  total_gross         DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_deductions    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_net           DECIMAL(12,2) NOT NULL DEFAULT 0,
  contractor_count    INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by_user_id  TEXT,
  approved_by_user_id TEXT,
  approved_at         TIMESTAMP,
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pr_store_status  ON payout_runs(store_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_store_created ON payout_runs(store_id, created_at);

CREATE TABLE IF NOT EXISTS payout_run_items (
  id                SERIAL PRIMARY KEY,
  payout_run_id     INTEGER NOT NULL REFERENCES payout_runs(id) ON DELETE CASCADE,
  contractor_id     INTEGER NOT NULL REFERENCES contractors(id),
  contractor_name   TEXT NOT NULL DEFAULT '',
  appointment_count INTEGER NOT NULL DEFAULT 0,
  service_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  product_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  tips              DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions        JSONB,
  total_deductions  DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  payout_method     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  stripe_transfer_id TEXT,
  failure_reason    TEXT,
  check_number      INTEGER,
  paid_at           TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pri_run_id        ON payout_run_items(payout_run_id);
CREATE INDEX IF NOT EXISTS idx_pri_contractor_id ON payout_run_items(contractor_id);

CREATE TABLE IF NOT EXISTS payout_checks (
  id                 SERIAL PRIMARY KEY,
  store_id           INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  payout_run_item_id INTEGER REFERENCES payout_run_items(id),
  contractor_id      INTEGER NOT NULL REFERENCES contractors(id),
  check_number       INTEGER NOT NULL,
  amount             DECIMAL(10,2) NOT NULL,
  payee_name         TEXT NOT NULL,
  memo               TEXT,
  period_start       TEXT,
  period_end         TEXT,
  print_status       TEXT DEFAULT 'queued',
  void_status        TEXT DEFAULT 'active',
  cleared_status     TEXT DEFAULT 'outstanding',
  issued_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at         TIMESTAMP,
  voided_at          TIMESTAMP,
  cleared_at         TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pc_store_id      ON payout_checks(store_id);
CREATE INDEX IF NOT EXISTS idx_pc_contractor_id ON payout_checks(contractor_id);

CREATE TABLE IF NOT EXISTS payout_w9_records (
  id                 SERIAL PRIMARY KEY,
  contractor_id      INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  legal_name         TEXT NOT NULL,
  business_name      TEXT,
  tax_classification TEXT NOT NULL,
  tax_id_last4       TEXT,
  address            TEXT,
  city               TEXT,
  state              TEXT,
  zip                TEXT,
  year               INTEGER NOT NULL,
  certified_at       TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_w9_contractor_id ON payout_w9_records(contractor_id);

CREATE TABLE IF NOT EXISTS payout_audit_logs (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  user_id     TEXT,
  user_email  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pal_store_id ON payout_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_pal_action   ON payout_audit_logs(action);

CREATE TABLE IF NOT EXISTS payout_adjustments (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  amount        DECIMAL(10,2) NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Manual Adjustment',
  description   TEXT NOT NULL,
  date          TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_adj_store_id      ON payout_adjustments(store_id);
CREATE INDEX IF NOT EXISTS idx_pay_adj_contractor_id ON payout_adjustments(contractor_id);

-- ─── AI receptionist tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_call_log (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES locations(id),
  call_sid         TEXT,
  caller_phone     TEXT,
  caller_name      TEXT,
  outcome          TEXT NOT NULL DEFAULT 'in_progress',
  appointment_id   INTEGER REFERENCES appointments(id),
  duration_seconds INTEGER,
  started_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMP,
  notes            TEXT,
  transcript       JSONB
);

CREATE TABLE IF NOT EXISTS call_usage_records (
  id                 SERIAL PRIMARY KEY,
  call_log_id        INTEGER REFERENCES ai_call_log(id),
  store_id           INTEGER NOT NULL REFERENCES locations(id),
  call_sid           TEXT,
  duration_seconds   INTEGER NOT NULL DEFAULT 0,
  audio_tokens_in    INTEGER NOT NULL DEFAULT 0,
  audio_tokens_out   INTEGER NOT NULL DEFAULT 0,
  text_tokens_in     INTEGER NOT NULL DEFAULT 0,
  text_tokens_out    INTEGER NOT NULL DEFAULT 0,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  total_tokens       INTEGER NOT NULL DEFAULT 0,
  cached_tokens      INTEGER NOT NULL DEFAULT 0,
  raw_usage          JSONB,
  tool_call_count    INTEGER NOT NULL DEFAULT 0,
  ai_response_count  INTEGER NOT NULL DEFAULT 0,
  twilio_minutes     DECIMAL(10,4) NOT NULL DEFAULT 0,
  twilio_est_cost    DECIMAL(10,6) NOT NULL DEFAULT 0,
  openai_est_cost    DECIMAL(10,6) NOT NULL DEFAULT 0,
  total_est_cost     DECIMAL(10,6) NOT NULL DEFAULT 0,
  termination_reason TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon_usage_limits (
  store_id               INTEGER PRIMARY KEY REFERENCES locations(id),
  max_call_duration_min  INTEGER NOT NULL DEFAULT 12,
  max_daily_minutes      INTEGER NOT NULL DEFAULT 480,
  max_monthly_cost_usd   DECIMAL(10,2) NOT NULL DEFAULT 200,
  max_concurrent_calls   INTEGER NOT NULL DEFAULT 3,
  idle_timeout_seconds   INTEGER NOT NULL DEFAULT 30,
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_silence_incidents (
  id                  SERIAL PRIMARY KEY,
  call_log_id         INTEGER REFERENCES ai_call_log(id),
  store_id            INTEGER NOT NULL REFERENCES locations(id),
  call_sid            TEXT,
  layer               TEXT NOT NULL,
  silence_duration_ms INTEGER NOT NULL,
  recovery_action     TEXT NOT NULL,
  occurred_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add transcript column in case ai_call_log already existed without it
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS transcript JSONB;
