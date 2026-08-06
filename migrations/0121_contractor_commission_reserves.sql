-- Migration 0121: Contractor Commission Reserves
-- Tracks pending contractor commissions so salon owners only see funds
-- that are truly available for withdrawal (Stripe balance - reserved commissions).

CREATE TABLE IF NOT EXISTS contractor_commissions (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id         INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  appointment_id        INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  service_id            INTEGER REFERENCES services(id) ON DELETE SET NULL,
  amount                INTEGER NOT NULL,                      -- in cents
  status                TEXT NOT NULL DEFAULT 'pending'        -- 'pending' | 'paid' | 'failed' | 'cancelled'
                          CHECK (status IN ('pending','paid','failed','cancelled')),
  earned_date           DATE NOT NULL,
  scheduled_payout_date DATE NOT NULL,
  paid_date             TIMESTAMPTZ,
  stripe_payout_id      TEXT,
  stripe_transfer_id    TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cc_store_status_idx       ON contractor_commissions(store_id, status);
CREATE INDEX IF NOT EXISTS cc_contractor_idx         ON contractor_commissions(contractor_id);
CREATE INDEX IF NOT EXISTS cc_scheduled_payout_idx   ON contractor_commissions(scheduled_payout_date, status);
CREATE INDEX IF NOT EXISTS cc_appointment_idx        ON contractor_commissions(appointment_id);

-- Prevent double-recording the same appointment commission per contractor
CREATE UNIQUE INDEX IF NOT EXISTS cc_appt_contractor_unique
  ON contractor_commissions(appointment_id, contractor_id)
  WHERE appointment_id IS NOT NULL;
