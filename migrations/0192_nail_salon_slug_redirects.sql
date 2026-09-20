-- 0192_nail_salon_slug_redirects.sql
--
-- ~336 of 47,511 nail_salons rows have promotional text baked into `name`
-- (e.g. "World Nails At Tustin (10% OFF New Customers)"). The slug generator
-- truncates the slugified name to a hard 36 chars with no word-boundary
-- trimming, so these produce ugly, mid-word-cut URLs (e.g.
-- ".../world-nails-at-tustin-10-off-new-cu-north-tustin-street-orange-...").
-- A one-off script (scripts/regenerate-promo-slugs.ts) regenerates just
-- these slugs from a cleaned name. Since some of these pages may already be
-- indexed, every old slug is preserved here so lookups 301-redirect to the
-- new slug instead of 404ing.

CREATE TABLE IF NOT EXISTS nail_salon_slug_redirects (
  old_slug VARCHAR(160) PRIMARY KEY,
  salon_id INTEGER NOT NULL REFERENCES nail_salons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nail_salon_slug_redirects_salon_id_idx ON nail_salon_slug_redirects(salon_id);
