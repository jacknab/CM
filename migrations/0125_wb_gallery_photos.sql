-- 0125_wb_gallery_photos
-- Tracks photos that salon owners explicitly upload for their website gallery.
-- Each row is also queued for Google Business Profile via gbp_photo_queue.

CREATE TABLE IF NOT EXISTS wb_gallery_photos (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  image_url     TEXT    NOT NULL,
  image_r2_key  TEXT,
  caption       TEXT,
  show_on_website BOOLEAN NOT NULL DEFAULT true,
  gbp_queue_id  INTEGER REFERENCES gbp_photo_queue(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_gallery_photos_store_id
  ON wb_gallery_photos(store_id);
