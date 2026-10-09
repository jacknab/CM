-- Team > Payroll runtime catch-up.
-- Safe to run more than once. Existing payroll values are not deleted or rewritten.

BEGIN;

CREATE TABLE IF NOT EXISTS pay_schedules (
  id                     serial PRIMARY KEY,
  store_id               integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  frequency              text NOT NULL DEFAULT 'weekly',
  anchor_date            date NOT NULL,
  period_end_offset_days integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pay_schedules_store_uidx
  ON pay_schedules (store_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                     serial PRIMARY KEY,
  store_id               integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period_start           date NOT NULL,
  period_end             date NOT NULL,
  pay_date               date,
  status                 text NOT NULL DEFAULT 'draft',
  total_commission       numeric(10,2) NOT NULL DEFAULT 0,
  tips_total             numeric(10,2) NOT NULL DEFAULT 0,
  deductions_total       numeric(10,2) NOT NULL DEFAULT 0,
  net_total              numeric(10,2) NOT NULL DEFAULT 0,
  contractor_count       integer NOT NULL DEFAULT 0,
  approved_at            timestamptz,
  approved_by            text,
  pdf_url                text,
  pdf_generated_at       timestamptz,
  checks_printed_count   integer NOT NULL DEFAULT 0,
  notes                  text,
  created_by             text,
  created_at             timestamp NOT NULL DEFAULT now(),
  finalized_at           timestamp
);

ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pay_date date;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS tips_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS deductions_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS net_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS contractor_count integer NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS checks_printed_count integer NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finalized_at timestamp;

CREATE INDEX IF NOT EXISTS pr_store_created_idx ON payroll_runs (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_store_status_idx ON payroll_runs (store_id, status);

-- Refuse to silently delete duplicate pay periods. If this raises, inspect the
-- duplicate rows before rerunning instead of losing payroll history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM payroll_runs
     GROUP BY store_id, period_start
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate payroll periods exist. Resolve duplicate (store_id, period_start) rows before adding the unique index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_store_period_uidx
  ON payroll_runs (store_id, period_start);

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id                      serial PRIMARY KEY,
  payroll_run_id          integer NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id                integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_name              text NOT NULL DEFAULT '',
  commission_rate         numeric(5,2) NOT NULL DEFAULT 0,
  product_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  appointment_count       integer NOT NULL DEFAULT 0,
  service_revenue         numeric(10,2) NOT NULL DEFAULT 0,
  addon_revenue           numeric(10,2) NOT NULL DEFAULT 0,
  product_revenue         numeric(10,2) NOT NULL DEFAULT 0,
  total_revenue           numeric(10,2) NOT NULL DEFAULT 0,
  commission_amount       numeric(10,2) NOT NULL DEFAULT 0,
  service_commission      numeric(10,2) NOT NULL DEFAULT 0,
  product_commission      numeric(10,2) NOT NULL DEFAULT 0,
  tips                    numeric(10,2) NOT NULL DEFAULT 0,
  other_earnings          numeric(10,2) NOT NULL DEFAULT 0,
  booth_rent              numeric(10,2) NOT NULL DEFAULT 0,
  other_deductions        numeric(10,2) NOT NULL DEFAULT 0,
  net_pay                 numeric(10,2) NOT NULL DEFAULT 0,
  check_number            text,
  status                  text NOT NULL DEFAULT 'pending',
  notes                   text,
  created_at              timestamp NOT NULL DEFAULT now()
);

ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_commission_rate numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_revenue numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS service_commission numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_commission numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS tips numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS other_earnings numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS booth_rent numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS other_deductions numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS net_pay numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS check_number text;

CREATE INDEX IF NOT EXISTS pri_run_idx ON payroll_run_items (payroll_run_id);

COMMIT;

-- Verification: all three values should be non-null table names.
SELECT
  to_regclass('public.pay_schedules') AS pay_schedules,
  to_regclass('public.payroll_runs') AS payroll_runs,
  to_regclass('public.payroll_run_items') AS payroll_run_items;
