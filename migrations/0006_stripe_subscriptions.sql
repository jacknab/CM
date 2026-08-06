-- Migration: Add Stripe Subscription Tables

-- Create enum for subscription status (idempotent)
DO $$ BEGIN
  CREATE TYPE stripe_subscription_status AS ENUM (
    'not_started', 'incomplete', 'incomplete_expired', 'trialing',
    'active', 'past_due', 'canceled', 'unpaid', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for order status (idempotent)
DO $$ BEGIN
  CREATE TYPE stripe_order_status AS ENUM ('pending', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stripe_customers (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL UNIQUE,
  store_number INTEGER UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id TEXT UNIQUE NOT NULL,
  subscription_id TEXT DEFAULT NULL,
  price_id TEXT DEFAULT NULL,
  current_period_start BIGINT DEFAULT NULL,
  current_period_end BIGINT DEFAULT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  payment_method_brand TEXT DEFAULT NULL,
  payment_method_last4 TEXT DEFAULT NULL,
  status stripe_subscription_status NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS stripe_orders (
    id SERIAL PRIMARY KEY,
    checkout_session_id TEXT NOT NULL,
    payment_intent_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    amount_subtotal BIGINT NOT NULL,
    amount_total BIGINT NOT NULL,
    currency TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    status stripe_order_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents NUMERIC NOT NULL,
  contacts_min NUMERIC,
  contacts_max NUMERIC,
  stripe_price_id TEXT,
  interval TEXT DEFAULT 'month',
  sms_credits NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  store_number INTEGER NOT NULL REFERENCES locations(id),
  plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  current_period_end TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  interval TEXT DEFAULT 'month',
  price_id TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id SERIAL PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  new_plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  interval TEXT,
  effective_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO billing_plans (code, name, description, price_cents, contacts_min, contacts_max, interval, sms_credits) VALUES
('starter', 'Starter Plan', 'Perfect for small businesses', 2900, 0, 100, 'month', 500),
('professional', 'Professional Plan', 'Great for growing businesses', 4900, 101, 500, 'month', 1500),
('enterprise', 'Enterprise Plan', 'For large businesses', 8900, 501, 9999, 'month', 5000)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON stripe_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_store_number ON stripe_customers(store_number);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id ON stripe_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_subscription_id ON stripe_subscriptions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_customer_id ON stripe_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_checkout_session ON stripe_orders(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_number ON subscriptions(store_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_subscription_id ON scheduled_plan_changes(stripe_subscription_id);
