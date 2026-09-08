-- Per-appointment self-service "manage my booking" token.
-- Sent in client confirmation/reminder SMS as certxa.com/b/<token> so a client
-- can view and cancel *their one* booking without exposing the numeric id or
-- letting anyone enumerate bookings by phone number.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_token text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_udx
  ON appointments (manage_token)
  WHERE manage_token IS NOT NULL;
