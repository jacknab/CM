-- Certxa Pro client referrals and credit (owner, 2026-11-15: "match GlossGenius"; routes/proReferrals.ts).
-- The pro sets a reward; on a new client's profile they choose who referred them. The new client gets their credit at
-- once, the client who referred them when the new client's first visit is paid. Credit is spent at checkout.
CREATE TABLE IF NOT EXISTS referral_programs (
  store_id INTEGER PRIMARY KEY REFERENCES locations(id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  referrer_reward_cents INTEGER NOT NULL DEFAULT 1000 CHECK (referrer_reward_cents BETWEEN 0 AND 100000),
  friend_reward_cents INTEGER NOT NULL DEFAULT 1000 CHECK (friend_reward_cents BETWEEN 0 AND 100000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_referrals (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  referrer_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  referrer_reward_cents INTEGER NOT NULL,
  friend_reward_cents INTEGER NOT NULL,
  rewarded_at TIMESTAMPTZ,                                  -- the referrer's credit, after the friend's first paid visit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, friend_id)
);

-- Every change to a client's credit: + earned, − spent on a booking (once per booking).
CREATE TABLE IF NOT EXISTS client_credits (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,                                     -- referral_friend | referral_referrer | spent | adjustment
  referral_id INTEGER,
  appointment_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_credits_customer ON client_credits (store_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_credits_spent ON client_credits (appointment_id) WHERE reason = 'spent';
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_credits_referral ON client_credits (referral_id, reason) WHERE referral_id IS NOT NULL;
