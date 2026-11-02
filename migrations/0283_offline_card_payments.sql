-- Card payments taken on the M2 reader while the internet was down (owner, 2026-11-02). The Certxa app saves the
-- payment on the tablet with a reference (offline_ref) and sends it to Stripe once the internet is back; the /nail
-- sale arrives with the same reference. This row joins the two: which ticket it paid, and what Stripe said.
-- status: waiting (not sent to Stripe yet) | paid | declined (the bank refused it after the client left).
CREATE TABLE IF NOT EXISTS offline_card_payments (
  id                 SERIAL PRIMARY KEY,
  store_id           INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  offline_ref        TEXT NOT NULL UNIQUE,
  appointment_id     INTEGER,
  amount_cents       INTEGER,
  idempotency_key    TEXT,
  payment_intent_id  TEXT,
  status             TEXT NOT NULL DEFAULT 'waiting',
  error              TEXT,
  recorded_at        TIMESTAMPTZ,
  forwarded_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offline_card_payments_store ON offline_card_payments (store_id, status);
