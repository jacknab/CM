-- 0202_rentals_foundation.sql
--
-- Certxa Rentals — Phase 1 domain foundation. A separate product for
-- facility owners renting spaces (suites/booths/rooms) to independent
-- beauty professionals. All three tables are additive/new; no existing
-- table is touched. A "facility" is an existing `locations` row — Rentals
-- reuses the existing tenant unit rather than a new organization concept.
--
-- Deliberately NOT included in this phase: rent charges/payments, invoicing,
-- autopay, late fees, maintenance, documents, announcements, applications,
-- shared resources/reservations. See plans/rentals-phase-0-audit for detail.

CREATE TABLE IF NOT EXISTS rental_spaces (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'suite',
  status TEXT NOT NULL DEFAULT 'available',
  monthly_rate DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_spaces_store_id ON rental_spaces (store_id);

CREATE TABLE IF NOT EXISTS rental_professionals (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_professionals_store_id ON rental_professionals (store_id);

CREATE TABLE IF NOT EXISTS rental_agreements (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  space_id INTEGER NOT NULL REFERENCES rental_spaces(id) ON DELETE CASCADE,
  professional_id INTEGER NOT NULL REFERENCES rental_professionals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  monthly_rate DECIMAL(10, 2),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_store_id ON rental_agreements (store_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_space_id ON rental_agreements (space_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_professional_id ON rental_agreements (professional_id);
