-- 0186_deal_voucher_booking_token.sql
--
-- Opaque per-voucher booking link token. Sent alongside the human redemption
-- code in the purchase-confirmation email; resolves (via a new public
-- endpoint) to a one-step booking page with the package already selected —
-- the customer only picks a time and gives their name + phone. Deliberately
-- separate from `code` so the two credentials can't be derived from each
-- other.

ALTER TABLE deal_vouchers ADD COLUMN IF NOT EXISTS booking_token TEXT UNIQUE;
