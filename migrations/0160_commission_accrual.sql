-- 0160_commission_accrual.sql
--
-- Continuous commission accrual: one row per completed appointment, written the
-- moment it completes (see lib/commissionAccrual.ts) instead of recomputed from
-- scratch every time a payroll/payout run is created. `contractor_commissions`
-- already existed in the schema but nothing wrote to it — this brings it online
-- and adds the equivalent table for plain (W-2) employees.

-- Link accrual rows to the run item that swept them, and make appointment_id
-- unique so a completion retry / edit-after-complete can't double-accrue.
ALTER TABLE contractor_commissions ADD COLUMN IF NOT EXISTS payout_run_item_id INTEGER REFERENCES payout_run_items(id);
CREATE UNIQUE INDEX IF NOT EXISTS cc_appointment_unique_idx ON contractor_commissions(appointment_id) WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_commission_accruals (
    id                  SERIAL PRIMARY KEY,
    store_id            INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    staff_id            INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    appointment_id      INTEGER,
    service_id          INTEGER,
    amount              INTEGER NOT NULL,                       -- cents
    status              TEXT NOT NULL DEFAULT 'pending',         -- pending | included_in_run | paid | cancelled
    earned_date         DATE NOT NULL,
    payroll_run_item_id INTEGER REFERENCES payroll_run_items(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sca_store_status_idx ON staff_commission_accruals(store_id, status);
CREATE INDEX IF NOT EXISTS sca_staff_idx         ON staff_commission_accruals(staff_id);
CREATE INDEX IF NOT EXISTS sca_earned_date_idx    ON staff_commission_accruals(earned_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS sca_appointment_unique_idx ON staff_commission_accruals(appointment_id) WHERE appointment_id IS NOT NULL;
