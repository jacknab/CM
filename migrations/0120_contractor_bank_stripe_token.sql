-- Add Stripe tokenization columns to contractor_bank_accounts
ALTER TABLE contractor_bank_accounts
  ADD COLUMN IF NOT EXISTS stripe_bank_account_token text,
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS account_holder_type text;
