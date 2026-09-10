-- Business Details settings: legal structure + federal tax ID.
-- Surfaced on Settings → Business → Business Details. Both optional, free-text
-- (the entity type is a fixed picklist in the UI but stored as text so it can
-- evolve without a migration).

ALTER TABLE locations ADD COLUMN IF NOT EXISTS legal_entity_type text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS ein               text;
