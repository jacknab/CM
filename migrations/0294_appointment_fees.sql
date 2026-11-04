-- A no-show or late-cancel fee the pro charged from the Certxa Pro app (owner, 2026-10-22: only when the pro taps it).
-- Kept with the booking so it is charged once and shows on it.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_kind TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_charged_cents INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_payment_intent TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_charged_at TIMESTAMPTZ;
