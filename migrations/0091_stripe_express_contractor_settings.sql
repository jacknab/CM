-- Add Stripe Express contractor payout settings to store_payment_accounts
ALTER TABLE store_payment_accounts
  ADD COLUMN IF NOT EXISTS contractor_express_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contractor_payout_mode     varchar(16) NOT NULL DEFAULT 'manual';
