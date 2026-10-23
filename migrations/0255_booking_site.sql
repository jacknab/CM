-- 0255_booking_site.sql
--
-- Booking website setup (owner, 2026-10-22), GlossGenius-style, for <slug>.certxa.com:
--  * locations.booking_site: the page's look beyond the theme - accent colour, cover photo, profile photo/logo,
--    about text, Instagram handle. Changed only through PUT /api/booking-site (checked there).
--  * booking_slug_history: every link a business has given up. The old link keeps working (it redirects to the
--    current one) and stays that business's, so nobody else can take it.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS booking_site JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS booking_slug_history (
  old_slug    TEXT PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_slug_history_store_idx ON booking_slug_history (store_id);
