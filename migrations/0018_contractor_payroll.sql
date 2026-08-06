-- Contractor Payroll: commission-only payroll runs for service businesses

CREATE TABLE IF NOT EXISTS payroll_runs (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  total_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
  contractor_count INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pr_store_created_idx ON payroll_runs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_store_status_idx  ON payroll_runs(store_id, status);

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id              SERIAL PRIMARY KEY,
  payroll_run_id  INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_name      TEXT NOT NULL DEFAULT '',
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  appointment_count INTEGER NOT NULL DEFAULT 0,
  service_revenue DECIMAL(10,2) NOT NULL DEFAULT 0,
  addon_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pri_run_idx ON payroll_run_items(payroll_run_id);
