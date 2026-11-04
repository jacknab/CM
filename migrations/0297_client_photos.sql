-- Before/after photos on a client's profile (Certxa Pro app, owner 2026-11-03). Private to the business unless the pro
-- puts one on their own website's gallery (gallery_photo_id = the wb_gallery_photos row). Never sent to Google.
CREATE TABLE IF NOT EXISTS client_photos (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id      INTEGER NOT NULL,
  appointment_id INTEGER,
  kind           TEXT,
  url            TEXT NOT NULL,
  note           TEXT,
  gallery_photo_id INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_photos_client_idx ON client_photos (store_id, client_id, created_at DESC);
