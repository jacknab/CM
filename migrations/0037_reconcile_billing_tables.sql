-- Reconcile billing/support schema drift on VPS instances.
-- Idempotent and safe to run multiple times.

BEGIN;

-- Ensure billing_plans exists with columns used by deploy + API joins.
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  interval TEXT NOT NULL DEFAULT 'month',
  currency TEXT NOT NULL DEFAULT 'usd',
  active BOOLEAN NOT NULL DEFAULT true,
  features_json JSONB,
  stripe_price_id TEXT,
  contacts_min NUMERIC,
  contacts_max NUMERIC,
  sms_credits NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS interval TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS features_json JSONB;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS contacts_min NUMERIC;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS contacts_max NUMERIC;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS sms_credits NUMERIC;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE public.billing_plans
SET interval = COALESCE(interval, 'month'),
    currency = COALESCE(currency, 'usd'),
    active = COALESCE(active, true),
    price_cents = COALESCE(price_cents, 0)
WHERE interval IS NULL OR currency IS NULL OR active IS NULL OR price_cents IS NULL;

ALTER TABLE public.billing_plans ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.billing_plans ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.billing_plans ALTER COLUMN price_cents SET NOT NULL;
ALTER TABLE public.billing_plans ALTER COLUMN interval SET NOT NULL;
ALTER TABLE public.billing_plans ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.billing_plans ALTER COLUMN active SET NOT NULL;

ALTER TABLE public.billing_plans ALTER COLUMN interval SET DEFAULT 'month';
ALTER TABLE public.billing_plans ALTER COLUMN currency SET DEFAULT 'usd';
ALTER TABLE public.billing_plans ALTER COLUMN active SET DEFAULT true;
ALTER TABLE public.billing_plans ALTER COLUMN price_cents SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_plans_code_unique'
      AND conrelid = 'public.billing_plans'::regclass
  ) THEN
    ALTER TABLE public.billing_plans
      ADD CONSTRAINT billing_plans_code_unique UNIQUE (code);
  END IF;
END $$;

-- Ensure subscriptions exists for joins from support/billing routes.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id SERIAL PRIMARY KEY,
  store_number INTEGER NOT NULL REFERENCES public.locations(id),
  plan_code TEXT NOT NULL REFERENCES public.billing_plans(code),
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

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS store_number INTEGER;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_code TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS interval TEXT DEFAULT 'month';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS price_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end INTEGER DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_subscriptions_store_number
  ON public.subscriptions(store_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON public.subscriptions(stripe_subscription_id);

COMMIT;
