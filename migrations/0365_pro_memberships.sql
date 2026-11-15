-- Certxa Pro memberships (owner, 2026-11-15: "match GlossGenius"). A plan is a monthly or yearly price that includes
-- visits of chosen services each period and/or a percent off other services. A client joins from a link (they pay the
-- first period on their phone and the card is kept for renewals) or, with a card on file, from the app. Certxa charges
-- each renewal on the business's own Stripe account (lib/proMemberships.ts).
CREATE TABLE IF NOT EXISTS membership_plans (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 50),
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_membership_plans_store ON membership_plans (store_id);

-- What a plan includes: visits of a service each period.
CREATE TABLE IF NOT EXISTS membership_plan_services (
  plan_id INTEGER NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  visits_per_period INTEGER NOT NULL CHECK (visits_per_period BETWEEN 1 AND 100),
  PRIMARY KEY (plan_id, service_id)
);

-- One client's membership. The plan's price, discount and included visits are copied in when they join, so a later
-- change to the plan never changes what a member agreed to.
CREATE TABLE IF NOT EXISTS client_memberships (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  plan_id INTEGER NOT NULL REFERENCES membership_plans(id),
  customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  interval TEXT NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  includes JSONB NOT NULL DEFAULT '[]',                     -- [{ serviceId, name, visits }]
  status TEXT NOT NULL DEFAULT 'pending',                   -- pending | active | past_due | cancelled
  token TEXT UNIQUE,                                        -- the join link
  join_payment_intent TEXT,                                 -- the first payment from the join link
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_memberships_customer ON client_memberships (store_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_client_memberships_due ON client_memberships (period_end) WHERE status IN ('active', 'past_due');

-- Every charge: the first period and each renewal.
CREATE TABLE IF NOT EXISTS client_membership_charges (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES client_memberships(id),
  store_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,                                     -- paid | failed | refunded
  payment_intent TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_membership_charges_m ON client_membership_charges (membership_id);

-- A membership visit used on a booking (one per booking).
CREATE TABLE IF NOT EXISTS client_membership_uses (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES client_memberships(id),
  service_id INTEGER NOT NULL,
  appointment_id INTEGER NOT NULL UNIQUE,
  period_start TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
