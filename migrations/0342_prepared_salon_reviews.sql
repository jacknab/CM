-- Google reviews on an unclaimed prepared salon's page (owner, 2026-11-11): Google's Places API gives up to five reviews
-- with the rating and total; Google's terms let us keep them at most 30 days, so they are refreshed every 30 days and
-- deleted when older (lib/preparedReviews.ts). Gone once the salon claims its page.
CREATE TABLE IF NOT EXISTS prepared_salon_reviews (
  store_id   integer PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  place_id   text NOT NULL,
  rating     numeric(2,1),
  total      integer,
  reviews    jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
