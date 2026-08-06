-- Migration 0087: Contractor instant transfers
-- Records every real-time Stripe transfer fired at payment capture (Uber-like model).
-- Also adds stripe_transfer_id to payout_run_items for batch-run transfers.

CREATE TABLE IF NOT EXISTS contractor_instant_transfers (
  id                   SERIAL PRIMARY KEY,
  contractor_id        INTEGER NOT NULL,
  store_id             INTEGER NOT NULL,
  appointment_id       INTEGER,
  payment_intent_id    TEXT,
  stripe_transfer_id   TEXT,
  amount_cents         INTEGER NOT NULL,
  commission_rate      NUMERIC(5,4),
  service_amount_cents INTEGER NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',
  failure_reason       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cit_contractor_id    ON contractor_instant_transfers(contractor_id);
CREATE INDEX IF NOT EXISTS idx_cit_appointment_id   ON contractor_instant_transfers(appointment_id);
CREATE INDEX IF NOT EXISTS idx_cit_store_id         ON contractor_instant_transfers(store_id);

ALTER TABLE payout_run_items ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;
