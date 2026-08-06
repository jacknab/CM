-- Adds a column to remember each store's Stripe Terminal Location, once
-- created, so we don't call the Stripe API to create a duplicate one
-- every time. One Location per store_payment_accounts row (i.e. per
-- connected account), matching how the rest of that table works.
--
-- Run this against the SAME database the main certxa.com app uses.
-- If your main app's schema is managed via Drizzle migrations there
-- instead, port this as a Drizzle migration in that repo — the column
-- itself is what matters, not how it's applied.

ALTER TABLE store_payment_accounts
  ADD COLUMN IF NOT EXISTS stripe_terminal_location_id TEXT;
