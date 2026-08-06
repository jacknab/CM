-- Migration 0128: Support client reviews (with photos) in service_review_matches
--
-- Previously the table only held Google review matches.
-- We now also store matches from the native "reviews" table so services can
-- display a photo from a real client submission.
--
-- Changes:
--   1. Add review_id column (FK → reviews, nullable)
--   2. Make google_review_id nullable (stores may match via client review only)
--   3. Replace the old srm_review_unique index with two partial unique indexes
--   4. Add partial unique index on review_id

ALTER TABLE service_review_matches
  ADD COLUMN IF NOT EXISTS review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE;

ALTER TABLE service_review_matches
  ALTER COLUMN google_review_id DROP NOT NULL;

-- Replace the old blanket-unique index with two partial indexes so NULLs work correctly
DROP INDEX IF EXISTS srm_review_unique;

CREATE UNIQUE INDEX IF NOT EXISTS srm_google_review_unique
  ON service_review_matches(google_review_id)
  WHERE google_review_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS srm_client_review_unique
  ON service_review_matches(review_id)
  WHERE review_id IS NOT NULL;
