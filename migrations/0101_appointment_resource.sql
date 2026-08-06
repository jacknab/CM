-- Migration 0101: Link appointments to salon resources
-- Adds a nullable resource_id FK so each appointment can be assigned to a station or chair.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS resource_id INTEGER REFERENCES salon_resources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_resource_id ON appointments(resource_id);
