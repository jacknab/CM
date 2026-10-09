-- /frontdesk check-in: the client says only what kind of service they came for (Manicures, Pedicures…).
-- The waiting entry keeps that category so the turn system can hand the client to the next technician
-- who performs it; the actual service is added later, when the ticket is made.
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS requested_category_id integer;
ALTER TABLE kiosk_checkins ADD COLUMN IF NOT EXISTS requested_category text;
