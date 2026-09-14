-- Migration 0180: nail_salons.slug + directory_inquiries
--
-- Backs the rewritten /nail-salons and /salon/:slug directory (previously
-- backed by a static public/salon-data.json snapshot) directly off the
-- nail_salons table migrated from the asset_discovery scraper DB.
--
-- `slug` preserves the exact URLs already indexed under the old JSON-backed
-- directory — backfilled by a one-off script matching on place_id against
-- that JSON, not generated fresh here, so existing SEO equity isn't lost.
--
-- `directory_inquiries` captures "have a question about this business?"
-- submissions from unclaimed (not-yet-on-Certxa) salon pages — real leads
-- for the sales/prospecting pipeline, replacing the old static /contact link.

ALTER TABLE nail_salons ADD COLUMN IF NOT EXISTS slug varchar(160);
CREATE UNIQUE INDEX IF NOT EXISTS nail_salons_slug_unique ON nail_salons(slug);

CREATE TABLE IF NOT EXISTS directory_inquiries (
  id         serial PRIMARY KEY,
  salon_id   integer NOT NULL REFERENCES nail_salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text NOT NULL,
  message    text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_directory_inquiries_salon ON directory_inquiries(salon_id);
