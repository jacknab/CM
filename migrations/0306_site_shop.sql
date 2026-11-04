-- The Solo website's shop and "Book this look" (owner, 2026-11-04).
-- A portfolio photo can name the service it shows, so a client can book that look.
ALTER TABLE wb_gallery_photos ADD COLUMN IF NOT EXISTS service_id INTEGER;

-- Prepaid packages a pro sells: so many visits of one service for one price.
CREATE TABLE IF NOT EXISTS prepaid_packages (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  service_id  INTEGER NOT NULL,
  visits      INTEGER NOT NULL CHECK (visits BETWEEN 2 AND 50),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prepaid_packages_store_idx ON prepaid_packages (store_id);

-- A package a client has bought: the visits left on it.
CREATE TABLE IF NOT EXISTS client_packages (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  package_id   INTEGER NOT NULL,
  client_id    INTEGER NOT NULL,
  name         TEXT NOT NULL,
  service_id   INTEGER NOT NULL,
  visits_total INTEGER NOT NULL,
  visits_left  INTEGER NOT NULL CHECK (visits_left >= 0),
  price_cents  INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_packages_client_idx ON client_packages (store_id, client_id);

-- One visit used on one appointment, so it can't be used twice and can be given back.
CREATE TABLE IF NOT EXISTS client_package_uses (
  id                SERIAL PRIMARY KEY,
  client_package_id INTEGER NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  appointment_id    INTEGER NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A website sale: saved before the card is charged and delivered once, whichever of the page or Stripe confirms first.
CREATE TABLE IF NOT EXISTS site_orders (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                  -- 'gift_card' | 'package'
  amount_cents   INTEGER NOT NULL,
  details        JSONB NOT NULL,
  payment_intent TEXT UNIQUE,
  status         TEXT NOT NULL DEFAULT 'open',   -- open | paid
  result         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS site_orders_store_idx ON site_orders (store_id, created_at DESC);
