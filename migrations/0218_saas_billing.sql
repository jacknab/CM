-- In-house monthly billing for the Certxa SaaS plans (replaces Stripe Subscriptions).
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
-- Stripe still stores the card. Certxa decides when and how much to charge.
--
--   saas_billing_profiles   one row per store: the card on file, the amount to charge, and the
--                           dates. last_charged_at is the date of the last successful charge.
--                           next_charge_at is last_charged_at plus interval_days (31) and is the
--                           date the next cycle is due. next_attempt_at is when the billing run
--                           will next try the card - the same as next_charge_at until a charge
--                           fails, then pushed out by the retry schedule.
--   saas_billing_charges    one row per charge attempt, successful or not. Never deleted with the
--                           store or the profile - it is the financial record.
--
-- No card numbers are stored here. Only Stripe ids, the brand, the last four digits and the expiry.

CREATE TABLE IF NOT EXISTS saas_billing_profiles (
  id                       serial PRIMARY KEY,
  store_id                 integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  plan_id                  integer REFERENCES subscription_plans(id),
  amount_cents             integer NOT NULL CHECK (amount_cents > 0),
  currency                 text NOT NULL DEFAULT 'usd',
  interval_days            integer NOT NULL DEFAULT 31 CHECK (interval_days BETWEEN 1 AND 366),
  stripe_customer_id       text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  card_brand               text,
  card_last4               text,
  card_exp_month           integer,
  card_exp_year            integer,
  status                   text NOT NULL DEFAULT 'active',
  last_charged_at          timestamptz,
  next_charge_at           timestamptz NOT NULL,
  next_attempt_at          timestamptz NOT NULL,
  failed_attempts          integer NOT NULL DEFAULT 0,
  last_attempt_at          timestamptz,
  last_error               text,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  locked_until             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS saas_billing_profiles_store_unique ON saas_billing_profiles (store_id);
CREATE INDEX IF NOT EXISTS saas_billing_profiles_due_idx ON saas_billing_profiles (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS saas_billing_charges (
  id                       bigserial PRIMARY KEY,
  profile_id               integer REFERENCES saas_billing_profiles(id) ON DELETE SET NULL,
  store_id                 integer NOT NULL,
  plan_id                  integer,
  amount_cents             integer NOT NULL,
  currency                 text NOT NULL DEFAULT 'usd',
  period_start             timestamptz NOT NULL,
  period_end               timestamptz NOT NULL,
  attempt_number           integer NOT NULL DEFAULT 1,
  trigger                  text NOT NULL DEFAULT 'scheduled',
  status                   text NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  failure_code             text,
  failure_message          text,
  idempotency_key          text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS saas_billing_charges_idempotency_unique ON saas_billing_charges (idempotency_key);
CREATE INDEX IF NOT EXISTS saas_billing_charges_store_idx ON saas_billing_charges (store_id, created_at);
CREATE INDEX IF NOT EXISTS saas_billing_charges_profile_status_idx ON saas_billing_charges (profile_id, status);
