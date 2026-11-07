-- The cancellation/no-show terms a client agreed to when booking online (owner, 2026-11-07). The fee charged later
-- is the one saved here, never the shop's current setting: a policy change applies to new bookings only.
-- fee_terms_at is set on every online booking; NULL means an older or staff-made booking (charged by the live %).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_terms_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_percent_agreed NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_cents_agreed INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_cutoff_hours_agreed INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_text_agreed TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ;
-- A request keeps the terms from when the client sent it, for the booking it becomes when approved.
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS fee_terms JSONB;
