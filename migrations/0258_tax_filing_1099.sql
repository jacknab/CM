-- 0258_tax_filing_1099.sql
--
-- 1099-NEC filing for salons' contractors through TaxBandits (plans/1099-filing-taxbandits.md, 2026-10-24).
--
-- salon_tax_payer: the salon as the payer on its contractors' 1099s — legal name, EIN (encrypted with
--   STAFF_TAX_ENCRYPTION_KEY, last 4 beside it), address, contact. taxbandits_business_id is the payer record
--   TaxBandits made the first time it filed for the salon (reused afterwards).
-- tax_filing_orders: one purchase of a filing package — which tax year, how many forms, price, the Stripe payment,
--   and the TaxBandits submission it became.
-- tax_filing_forms: one contractor's 1099-NEC in an order — amount, TaxBandits record id, and its federal / state /
--   contractor-copy status as TaxBandits reports it.

CREATE TABLE IF NOT EXISTS salon_tax_payer (
  store_id                 INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  legal_name               TEXT,
  ein_enc                  TEXT,
  ein_last4                TEXT,
  address1                 TEXT,
  address2                 TEXT,
  city                     TEXT,
  state                    TEXT,
  zip                      TEXT,
  contact_first_name       TEXT,
  contact_last_name        TEXT,
  phone                    TEXT,
  email                    TEXT,
  taxbandits_business_id   TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_filing_orders (
  id                        SERIAL PRIMARY KEY,
  store_id                  INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  tax_year                  INTEGER NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment | paid | filing | filed | failed | cancelled
  form_count                INTEGER NOT NULL,
  mail_copies               BOOLEAN NOT NULL DEFAULT FALSE,
  price_per_form_cents      INTEGER NOT NULL,
  mail_per_form_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents               INTEGER NOT NULL,
  checkout_session_id       TEXT,
  payment_intent_id         TEXT,
  paid_at                   TIMESTAMPTZ,
  submission_id             TEXT,
  filed_at                  TIMESTAMPTZ,
  last_error                TEXT,
  created_by_user_id        TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tax_filing_orders_store_year_idx ON tax_filing_orders (store_id, tax_year);
CREATE UNIQUE INDEX IF NOT EXISTS tax_filing_orders_session_idx ON tax_filing_orders (checkout_session_id) WHERE checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tax_filing_forms (
  id                 SERIAL PRIMARY KEY,
  order_id           INTEGER NOT NULL REFERENCES tax_filing_orders(id) ON DELETE CASCADE,
  store_id           INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id           INTEGER NOT NULL REFERENCES staff(id),
  tax_year           INTEGER NOT NULL,
  amount             NUMERIC(12,2) NOT NULL,
  recipient_name     TEXT,
  record_id          TEXT,
  federal_status     TEXT,
  state_status       TEXT,
  copy_status        TEXT,
  errors             JSONB,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tax_filing_forms_order_idx ON tax_filing_forms (order_id);
CREATE INDEX IF NOT EXISTS tax_filing_forms_store_year_idx ON tax_filing_forms (store_id, tax_year, staff_id);
