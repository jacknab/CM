-- 0206_rent_charges_and_payments.sql
--
-- Certxa Rentals — Phase 5 (Rent & Payments), manual-payments scope only (no
-- Stripe integration this phase — see the Phase 5 report for why). Two new
-- tables, both additive; no existing table touched.
--
-- rent_charges: a specific amount owed for a specific billing period,
-- generated from rental_agreements. UNIQUE(agreement_id, period_start) is
-- what actually prevents duplicate charge generation — charge generation
-- always does INSERT ... ON CONFLICT (agreement_id, period_start) DO NOTHING.
--
-- rent_payments: money actually received against a charge. Manual only
-- (method: cash | check | other) — no card data of any kind is ever stored.

CREATE TABLE IF NOT EXISTS rent_charges (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  agreement_id INTEGER NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  professional_id INTEGER NOT NULL REFERENCES rental_professionals(id) ON DELETE CASCADE,
  space_id INTEGER NOT NULL REFERENCES rental_spaces(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'unpaid',
  voided_at TIMESTAMP,
  voided_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rent_charges_store_id ON rent_charges (store_id);
CREATE INDEX IF NOT EXISTS idx_rent_charges_agreement_id ON rent_charges (agreement_id);
CREATE INDEX IF NOT EXISTS idx_rent_charges_professional_id ON rent_charges (professional_id);
CREATE INDEX IF NOT EXISTS idx_rent_charges_space_id ON rent_charges (space_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rent_charges_agreement_period ON rent_charges (agreement_id, period_start);

CREATE TABLE IF NOT EXISTS rent_payments (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  agreement_id INTEGER NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  professional_id INTEGER NOT NULL REFERENCES rental_professionals(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  paid_at TIMESTAMP NOT NULL,
  recorded_by_user_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rent_payments_store_id ON rent_payments (store_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_charge_id ON rent_payments (charge_id);
