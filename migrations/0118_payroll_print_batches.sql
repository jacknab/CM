-- Migration 0118: Payroll Print Batches + Corporate Office Addresses
-- Adds the batch printing audit table and corporate mailing address storage.

-- ─── Account Corporate Addresses ─────────────────────────────────────────────
-- One corporate office mailing address per user account (shared across all stores).
CREATE TABLE IF NOT EXISTS account_corporate_addresses (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR NOT NULL UNIQUE,
  office_name TEXT,
  address1    TEXT,
  address2    TEXT,
  city        TEXT,
  state       TEXT,
  zip         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aca_user_id ON account_corporate_addresses(user_id);

-- ─── Payroll Print Batches ────────────────────────────────────────────────────
-- Audit trail for every "Print Payroll Batch" action, including the mailer sheet.
CREATE TABLE IF NOT EXISTS payroll_print_batches (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  batch_id       TEXT NOT NULL UNIQUE,
  user_id        VARCHAR,
  payout_run_id  INTEGER,
  period_start   TEXT,
  period_end     TEXT,
  check_count    INTEGER DEFAULT 0 NOT NULL,
  total_amount   DECIMAL(12,2) DEFAULT 0 NOT NULL,
  envelope_type  TEXT DEFAULT 'window10' NOT NULL,
  checks_data    JSONB,
  mailer_printed BOOLEAN DEFAULT FALSE NOT NULL,
  printed_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reprinted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ppb_store_id ON payroll_print_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_ppb_batch_id ON payroll_print_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_ppb_printed_at ON payroll_print_batches(printed_at);
