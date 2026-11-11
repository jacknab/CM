-- Business Phone is paid before the numbers are shown (owner, 2026-11-11): the first $10 month, paid but no number
-- chosen yet. One row per business; it is removed when the number is bought (the line keeps the payment id).
CREATE TABLE IF NOT EXISTS business_phone_prepaid (
  store_id    integer PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  payment_id  text NOT NULL,
  amount_cents integer NOT NULL,
  paid_at     timestamptz NOT NULL DEFAULT now()
);
