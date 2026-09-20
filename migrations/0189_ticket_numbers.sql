-- 0189_ticket_numbers.sql
--
-- Replaces the raw, globally-shared appointments.id as the "Booking #"/
-- "Ticket #" shown to staff and customers with a per-store sequential
-- number starting at 1. Applies going forward only — existing rows keep
-- ticket_number NULL (display logic falls back to the real id for those,
-- exactly as today), so nothing already sent to a real customer (a
-- confirmation text, printed receipt, etc.) stops matching what the app
-- shows for that same booking.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS next_ticket_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ticket_number INTEGER;
