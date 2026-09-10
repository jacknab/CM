-- Payroll rebuild — auto pay-period runs + printable paychecks (commission-only).
--
-- Reshapes the (empty) payroll_runs / payroll_run_items tables and adds
-- pay_schedules. The legacy payout_* / contractor_* subsystem is frozen, not
-- touched here — its 15 runs / 16 checks of real history stay in place.

CREATE TABLE IF NOT EXISTS pay_schedules (
  id                     serial PRIMARY KEY,
  store_id               integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  frequency              text NOT NULL DEFAULT 'weekly',   -- weekly | biweekly | semimonthly | monthly
  anchor_date            date NOT NULL,                    -- first pay date; periods roll forward from here
  period_end_offset_days integer NOT NULL DEFAULT 0,       -- 0 = period ends on pay date; 7 = ends a week before
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

-- ── payroll_runs: reshape (table is empty) ────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pay_date             date;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS tips_total           numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS deductions_total     numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS net_total            numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at          timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by          text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pdf_url              text;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS pdf_generated_at     timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS checks_printed_count integer NOT NULL DEFAULT 0;

-- One auto-created run per elapsed period per store.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_store_period_uidx
  ON payroll_runs (store_id, period_start);

-- ── payroll_run_items: reshape (table is empty) ──────────────────────────
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS service_commission      numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_commission      numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_revenue         numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS product_commission_rate numeric(5,2)  NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS tips                    numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS other_earnings          numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS booth_rent              numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS other_deductions        numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS net_pay                 numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_run_items ADD COLUMN IF NOT EXISTS check_number            text;
