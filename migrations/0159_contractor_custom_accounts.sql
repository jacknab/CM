-- 0159_contractor_custom_accounts.sql
--
-- Contractor payouts move from Stripe Express (contractor completes hosted
-- onboarding) to recipient-configured Custom connected accounts (Certxa creates
-- a transfers-only account and collects just legal name + US bank details).
--
-- See .claude/skills/stripe-connect-payouts/SKILL.md and
-- artifacts/api-server/src/lib/stripeContractorAccounts.ts.

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS account_type          text DEFAULT 'custom',   -- 'express' (legacy) | 'custom'
  ADD COLUMN IF NOT EXISTS country               text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS requirements_due      jsonb,                   -- snapshot of Stripe requirements.currently_due
  ADD COLUMN IF NOT EXISTS stripe_tos_accepted_at timestamp with time zone;

-- Any contractor that already has a Stripe account got it via the old Express
-- flow. Mark them 'express'; scripts/migrate-contractors-to-custom.ts then
-- creates a fresh Custom account for each and flips them back to 'custom'.
-- Rows with no Stripe account yet stay 'custom' (their first account will be Custom).
UPDATE contractors SET account_type = 'express' WHERE stripe_account_id IS NOT NULL;

ALTER TABLE contractor_bank_accounts
  ADD COLUMN IF NOT EXISTS stripe_external_account_id text;   -- the ba_… once attached to the Stripe account
