-- Add-on Groups (owner, 2026-11-05): reusable lists of existing add-ons, assigned to many services at once.
-- A group only points at add-on records, it never copies them: price, time, photo and tier stay on the add-on.
-- Assigning a group writes ordinary service_addons links (manual = false), so booking, the POS, the kiosk,
-- Autumn, the tablets' offline copy and older Pro app builds read add-ons exactly as before (lib/addonGroups.ts).

CREATE TABLE IF NOT EXISTS addon_groups (
  id         serial PRIMARY KEY,
  store_id   integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS addon_groups_store_id_idx ON addon_groups (store_id);

CREATE TABLE IF NOT EXISTS addon_group_items (
  id         serial PRIMARY KEY,
  group_id   integer NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  addon_id   integer NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (group_id, addon_id)
);
CREATE INDEX IF NOT EXISTS addon_group_items_addon_id_idx ON addon_group_items (addon_id);

CREATE TABLE IF NOT EXISTS service_addon_groups (
  id         serial PRIMARY KEY,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  group_id   integer NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  UNIQUE (service_id, group_id)
);
CREATE INDEX IF NOT EXISTS service_addon_groups_group_id_idx ON service_addon_groups (group_id);

-- true: the owner linked this add-on to the service by hand (every link that exists today).
-- false: the link is there only because one of the service's add-on groups holds the add-on.
ALTER TABLE service_addons ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT true;
