-- Add hidden_from_public flag to service_categories, services, and addons
-- When true, the item is excluded from the public booking page and kiosk check-in

ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS hidden_from_public boolean NOT NULL DEFAULT false;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS hidden_from_public boolean NOT NULL DEFAULT false;

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS hidden_from_public boolean NOT NULL DEFAULT false;
