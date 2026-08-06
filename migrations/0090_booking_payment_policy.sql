-- 0090: Online booking payment policy
-- Adds store-level payment policy settings, Stripe info on clients,
-- and full payment tracking columns on appointments.

-- ── locations: payment policy fields ────────────────────────────────────────
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS booking_payment_policy TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deposit_type           TEXT,
  ADD COLUMN IF NOT EXISTS deposit_value          DECIMAL(10,2);

-- ── clients: Stripe card-on-file storage ────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS card_brand               TEXT,
  ADD COLUMN IF NOT EXISTS card_last4               TEXT,
  ADD COLUMN IF NOT EXISTS card_exp_month           INTEGER,
  ADD COLUMN IF NOT EXISTS card_exp_year            INTEGER;

-- ── appointments: full payment tracking ─────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_policy           TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deposit_collected        DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS remaining_balance         DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status           TEXT NOT NULL DEFAULT 'none';
