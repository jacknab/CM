-- Service Images Library: Certxa's default professional service image catalog
-- Images are organized by service category and available across salon websites,
-- booking pages, and menus.  Designed for future FK from services.default_image_id.

CREATE TABLE IF NOT EXISTS service_images (
  id            SERIAL PRIMARY KEY,
  name          TEXT          NOT NULL,
  slug          TEXT          NOT NULL UNIQUE,
  category      TEXT          NOT NULL,
  subcategory   TEXT,
  image_url     TEXT,
  thumbnail_url TEXT,
  r2_key        TEXT,
  description   TEXT,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_images_category   ON service_images (category);
CREATE INDEX IF NOT EXISTS idx_service_images_slug       ON service_images (slug);
CREATE INDEX IF NOT EXISTS idx_service_images_sort       ON service_images (category, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_service_images_active     ON service_images (is_active);
