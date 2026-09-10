-- Account owner's personal phone number, editable on Settings → Personal →
-- Personal Details. Distinct from locations.phone (the business number).

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar;
