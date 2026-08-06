-- Contractor Payout System: full schema for contractor direct-deposit payouts

CREATE TABLE IF NOT EXISTS contractors (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id              INTEGER REFERENCES staff(id),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  profile_image         TEXT,
  role                  TEXT DEFAULT 'stylist',
  commission_rate       DECIMAL(5,2) DEFAULT 0,
  product_commission_rate DECIMAL(5,2) DEFAULT 0,
  payout_method         TEXT DEFAULT 'ach',
  stripe_account_id     TEXT,
  stripe_onboarding_url TEXT,
  tax_classification    TEXT DEFAULT 'individual',
  tax_id_last4          TEXT,
  onboarding_status     TEXT DEFAULT 'pending',
  bank_verified         BOOLEAN DEFAULT FALSE,
  is_active             BOOLEAN DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contractors_store_id ON contractors(store_id);
CREATE INDEX IF NOT EXISTS idx_contractors_staff_id ON contractors(staff_id);

CREATE TABLE IF NOT EXISTS contractor_bank_accounts (
  id                    SERIAL PRIMARY KEY,
  contractor_id         INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  account_type          TEXT DEFAULT 'checking',
  bank_name             TEXT,
  routing_last4         TEXT,
  account_last4         TEXT,
  verification_status   TEXT DEFAULT 'pending',
  stripe_bank_account_id TEXT,
  is_default            BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cba_contractor_id ON contractor_bank_accounts(contractor_id);

CREATE TABLE IF NOT EXISTS payout_deduction_rules (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id  INTEGER REFERENCES contractors(id),
  name           TEXT NOT NULL,
  type           TEXT DEFAULT 'fixed',
  amount         DECIMAL(10,2) DEFAULT 0,
  applies_to     TEXT DEFAULT 'all',
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  id                   SERIAL PRIMARY KEY,
  store_id             INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  payout_run_item_id   INTEGER REFERENCES payout_run_items(id),
  contractor_id        INTEGER NOT NULL REFERENCES contractors(id),
  check_number         INTEGER NOT NULL,
  amount               DECIMAL(10,2) NOT NULL,
  payee_name           TEXT NOT NULL,
  memo                 TEXT,
  period_start         TEXT,
  period_end           TEXT,
  print_status         TEXT DEFAULT 'queued',
  void_status          TEXT DEFAULT 'active',
  cleared_status       TEXT DEFAULT 'outstanding',
  issued_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at           TIMESTAMP,
  voided_at            TIMESTAMP,
  cleared_at           TIMESTAMP,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pc_store_id       ON payout_checks(store_id);
CREATE INDEX IF NOT EXISTS idx_pc_contractor_id  ON payout_checks(contractor_id);

CREATE TABLE IF NOT EXISTS payout_w9_records (
  id                  SERIAL PRIMARY KEY,
  contractor_id       INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  legal_name          TEXT NOT NULL,
  business_name       TEXT,
  tax_classification  TEXT NOT NULL,
  tax_id_last4        TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  year                INTEGER NOT NULL,
  certified_at        TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_w9_contractor_id ON payout_w9_records(contractor_id);

CREATE TABLE IF NOT EXISTS payout_audit_logs (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  user_id      TEXT,
  user_email   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pal_store_id  ON payout_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_pal_action    ON payout_audit_logs(action);

CREATE TABLE IF NOT EXISTS payout_adjustments (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id  INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  amount         DECIMAL(10,2) NOT NULL,
  category       TEXT NOT NULL DEFAULT 'Manual Adjustment',
  description    TEXT NOT NULL,
  date           TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pay_adj_store_id      ON payout_adjustments(store_id);
CREATE INDEX IF NOT EXISTS idx_pay_adj_contractor_id ON payout_adjustments(contractor_id);
