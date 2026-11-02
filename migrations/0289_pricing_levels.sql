-- Pricing levels for barbershops and hair salons (owner, 2026-11-02; lib/pricingLevels.ts). Additive only: nothing is
-- dropped or renamed, and a business that sets up no levels (every nail salon) prices exactly as before.
--
--   pricing_levels          the owner's levels (Standard, Senior, Master…), per store
--   staff.pricing_level_id  the level a professional is on (none = the service's standard price)
--   service_level_prices    a service's price on a level
--   staff_services.price_override   one professional's own price for a service (wins over the level)
--   appointments.pricing_level_id / pricing_level_name   the level the price came from, kept with the appointment's
--                           service_price, so changing a level later never changes a past appointment
CREATE TABLE IF NOT EXISTS pricing_levels (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_levels_store ON pricing_levels (store_id, sort_order);

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pricing_level_id INTEGER REFERENCES pricing_levels(id);

CREATE TABLE IF NOT EXISTS service_level_prices (
  service_id        INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  pricing_level_id  INTEGER NOT NULL REFERENCES pricing_levels(id) ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  PRIMARY KEY (service_id, pricing_level_id)
);

ALTER TABLE staff_services ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2) CHECK (price_override IS NULL OR price_override >= 0);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pricing_level_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pricing_level_name TEXT;
