-- 0256_booking_offer_valid_days.sql
--
-- Booking approval (Solo plan, owner 2026-10-23): when the professional offers a client other times instead of
-- the one they asked for, the client gets a link by text. booking_offer_valid_days is how many days that link
-- stays open (default 3). Requests that are still waiting are found by the sweeper through the second index.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS booking_offer_valid_days INTEGER NOT NULL DEFAULT 3;
CREATE INDEX IF NOT EXISTS booking_requests_open_expiry_idx ON booking_requests (expires_at) WHERE status IN ('requested', 'offered');
