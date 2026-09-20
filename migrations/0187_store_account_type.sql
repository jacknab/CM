-- 0187_store_account_type.sql
--
-- Distinguishes which Stripe Connect account "shape" a store is on:
--   'standard' — connected via the legacy OAuth flow (owner manages their
--                own independent Stripe dashboard; every existing row is
--                this, hence the default).
--   'express'  — created directly by the platform (stripe.accounts.create),
--                enabling Stripe's embedded onboarding/management components
--                with no redirect to stripe.com.
-- Previously the Stripe account `type` was only ever written into the
-- unused `raw_data` JSONB blob and never read back — this is the first real,
-- queryable column for it, needed so onboarding/disconnect logic can branch
-- correctly per account.

ALTER TABLE store_payment_accounts ADD COLUMN IF NOT EXISTS account_type VARCHAR(16) NOT NULL DEFAULT 'standard';
