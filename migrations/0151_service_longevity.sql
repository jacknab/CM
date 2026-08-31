-- Service Longevity — how long a service's result typically lasts before the
-- client would generally need it redone, stored as free text (e.g. "3 weeks",
-- "3–4 weeks", "4–6 weeks").
--
-- This is NOT the appointment duration. It is purely informational and must not
-- affect calendar scheduling, availability, appointment length, or booking
-- duration. Nullable so every existing service keeps working with no value.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS longevity text;
