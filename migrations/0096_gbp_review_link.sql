-- Add google_review_link column to google_business_profiles
-- Stores the direct "Write a review" URL fetched from GBP metadata.newReviewUri
ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS google_review_link TEXT;
