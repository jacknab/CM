-- Payment links (Certxa Pro app, owner 2026-11-03): the pro texts a client a link to pay a booking by card on
-- certxa.com/pay/<token>. Paid on the business's own Stripe account; the booking is then marked paid.
CREATE TABLE IF NOT EXISTS pay_links (
  id             SERIAL PRIMARY KEY,
  token          TEXT NOT NULL UNIQUE,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 50),
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',
  payment_intent TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pay_links_appointment_idx ON pay_links (appointment_id);
