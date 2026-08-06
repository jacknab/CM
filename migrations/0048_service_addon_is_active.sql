-- Soft-delete support for services and addons
-- Instead of hard-deleting records (which breaks appointment history),
-- owners can now deactivate items. Inactive items are hidden from
-- the kiosk, online booking, and front-desk booking flows.
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE addons   ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
