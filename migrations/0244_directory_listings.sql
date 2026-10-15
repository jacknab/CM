-- The public salon directory's own data (plans/salon-directory.md), separate from the
-- nail_salons sales-lead table. Every salon comes from a state license record; the
-- source of each fact is kept, and no Google Places content is stored except place_id.
CREATE TABLE IF NOT EXISTS directory_listings (
  id                  SERIAL PRIMARY KEY,
  slug                VARCHAR(160) NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  street              TEXT,
  city                TEXT,
  state               CHAR(2) NOT NULL,
  postal_code         VARCHAR(10),
  phone               VARCHAR(20),            -- +1XXXXXXXXXX, from the license record
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  geocode_source      TEXT,                   -- 'census' (US Census Geocoder, public domain)
  license_source      TEXT NOT NULL,          -- 'tx_tdlr' | 'ca_bbc' | 'fl_dbpr'
  license_number      TEXT NOT NULL,
  license_type        TEXT,
  license_status      TEXT,
  license_expires     DATE,
  license_checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  nail_reason         TEXT NOT NULL,          -- why it counts as a nail salon: 'name' | 'license_type' | 'directory_match'
  nail_salon_id       INTEGER,                -- matching nail_salons row, kept for its URL and place_id
  place_id            TEXT,
  store_id            INTEGER,                -- set once the salon runs on Certxa
  claimed_at          TIMESTAMPTZ,
  claimed_by          INTEGER,
  owner_fields        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- description, hours, photos supplied by the owner
  opted_out_at        TIMESTAMPTZ,
  opt_out_reason      TEXT,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),   -- last import that still found the license
  UNIQUE (license_source, license_number)
);
CREATE INDEX IF NOT EXISTS directory_listings_state_city_idx ON directory_listings (state, city);
CREATE INDEX IF NOT EXISTS directory_listings_nail_salon_idx ON directory_listings (nail_salon_id);
CREATE INDEX IF NOT EXISTS directory_listings_phone_idx ON directory_listings (phone);

-- "Remove this listing" requests. The listing is hidden at once (opted_out_at); the
-- request is kept so support can see who asked and reverse a bad-faith removal.
CREATE TABLE IF NOT EXISTS directory_removal_requests (
  id            SERIAL PRIMARY KEY,
  listing_id    INTEGER NOT NULL REFERENCES directory_listings(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  relationship  TEXT,
  reason        TEXT,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
