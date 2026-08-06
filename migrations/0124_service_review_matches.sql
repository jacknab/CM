-- Migration: service_review_matches
-- Stores OpenAI-matched Google review → service associations for website template display.
-- Each row records the best matching service for a given Google review.

CREATE TABLE IF NOT EXISTS service_review_matches (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  google_review_id  INTEGER NOT NULL REFERENCES google_reviews(id) ON DELETE CASCADE,
  service_id        INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 1.0,  -- 0.0–1.0 from OpenAI
  matched_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS srm_store_id_idx    ON service_review_matches(store_id);
CREATE INDEX IF NOT EXISTS srm_service_id_idx  ON service_review_matches(service_id);
CREATE UNIQUE INDEX IF NOT EXISTS srm_review_unique ON service_review_matches(google_review_id);
