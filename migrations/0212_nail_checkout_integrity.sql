-- A durable idempotency record. An operation and every appointment/ledger update
-- commit together or not at all; retries can safely return its stored result.
CREATE TABLE IF NOT EXISTS nail_checkout_operations (
  store_id integer NOT NULL REFERENCES locations(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS nail_checkout_card_intents (
  payment_intent_id text PRIMARY KEY,
  store_id integer NOT NULL REFERENCES locations(id),
  appointment_id integer NOT NULL REFERENCES appointments(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Existing debits are guarded by card-row locks; enforce the same rule at the
-- database boundary so a later writer cannot double-redeem the same ticket.
CREATE UNIQUE INDEX IF NOT EXISTS nail_gift_redemption_once_idx
  ON gift_card_transactions (gift_card_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND type = 'redemption';
