-- payment_refunds — local audit trail for salon-initiated customer refunds.
-- Stripe remains the source of truth; this table records who/when/how-much so the
-- Payments & Payouts dashboard can show refund history without a Stripe round-trip
-- and so refunds are attributable to a Certxa user.
CREATE TABLE IF NOT EXISTS payment_refunds (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER NOT NULL,
  appointment_id         INTEGER,
  stripe_refund_id       TEXT NOT NULL,
  stripe_payment_intent  TEXT,
  stripe_charge_id       TEXT,
  amount_cents           INTEGER NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'usd',
  status                 TEXT NOT NULL DEFAULT 'pending',
  reason                 TEXT,
  created_by_user_id     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refunds_stripe_id ON payment_refunds (stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_store ON payment_refunds (store_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_appointment ON payment_refunds (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created ON payment_refunds (created_at);
