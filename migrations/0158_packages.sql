-- 0158_packages.sql
--
-- Catalog → Packages. A package bundles existing services + add-ons into one
-- named, single-priced, single-duration item that can be booked online or rung
-- up in the POS. Duration is always the sum of the components; price is either
-- that same sum ('sum') or an owner-set fixed amount ('fixed').
--
-- A booked package is ONE appointment carrying `package_id`, its summed
-- duration, and the package's add-ons — so all existing scheduling / calendar /
-- commission code keeps working (a package behaves like a "super-service").

CREATE TABLE IF NOT EXISTS packages (
    id                 SERIAL PRIMARY KEY,
    store_id           INTEGER REFERENCES locations(id),
    name               TEXT NOT NULL,
    description        TEXT,
    image_url          TEXT,
    pricing_mode       TEXT NOT NULL DEFAULT 'sum',   -- 'sum' | 'fixed'
    fixed_price        NUMERIC(10,2),                 -- used only when pricing_mode = 'fixed'
    sort_order         INTEGER NOT NULL DEFAULT 0,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    hidden_from_public BOOLEAN DEFAULT FALSE,
    created_at         TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_items (
    id          SERIAL PRIMARY KEY,
    package_id  INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    item_type   TEXT NOT NULL,                        -- 'service' | 'addon'
    service_id  INTEGER REFERENCES services(id),
    addon_id    INTEGER REFERENCES addons(id),
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS package_items_package_id_idx ON package_items(package_id);
CREATE INDEX IF NOT EXISTS packages_store_id_idx        ON packages(store_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES packages(id);
