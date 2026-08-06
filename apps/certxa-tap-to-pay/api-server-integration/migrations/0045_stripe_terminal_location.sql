-- Rename this file to match the next available number after the
-- highest existing migration in artifacts/api-server/migrations/
-- (0044_stripe_connect.sql was the most recent one Replit showed us —
-- confirm the current highest before applying).
--
-- Adds a column to remember each store's Stripe Terminal Location once
-- created, so getOrCreateTerminalLocationId() doesn't call the Stripe
-- API to create a duplicate one on every request.

ALTER TABLE store_payment_accounts
  ADD COLUMN IF NOT EXISTS stripe_terminal_location_id TEXT;
