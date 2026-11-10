-- Card payment details asked at Certxa sign-up (owner, 2026-11-10), so Stripe's setup form starts with them filled
-- in. The date of birth is encrypted (lib/staffTaxCrypto.ts). The business structure and EIN stay on locations
-- (legal_entity_type, ein: the same fields as Business Settings). The SSN is never stored: it goes straight to Stripe.
CREATE TABLE IF NOT EXISTS owner_payment_details (
  store_id              integer PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  date_of_birth         text,
  home_same_as_business boolean NOT NULL DEFAULT false,
  home_address          text,
  home_city             text,
  home_state            text,
  home_postcode         text,
  legal_name            text,
  -- When the last 4 of the SSN went to Stripe (the digits themselves are never kept), so Get paid doesn't ask twice.
  ssn_sent_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Stripe "needs attention" alerts: when the owner was last told (push + e-mail), at most once a day.
ALTER TABLE store_payment_accounts ADD COLUMN IF NOT EXISTS attention_notified_at timestamptz;
