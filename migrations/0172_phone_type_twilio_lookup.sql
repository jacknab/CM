-- Twilio Lookup (Line Type Intelligence): know definitively whether a
-- client's phone number can receive SMS (mobile/VoIP) or can't (landline),
-- so campaigns and automated sends can skip numbers that would just fail —
-- cutting Twilio spend and store SMS-credit waste.

ALTER TABLE client_phones ADD COLUMN IF NOT EXISTS phone_type_source text NOT NULL DEFAULT 'heuristic';
ALTER TABLE client_phones ADD COLUMN IF NOT EXISTS phone_type_checked_at timestamptz;
ALTER TABLE client_phones ADD COLUMN IF NOT EXISTS carrier_name text;

CREATE INDEX IF NOT EXISTS client_phones_phone_type_idx ON client_phones (phone_type);
