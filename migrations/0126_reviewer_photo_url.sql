-- Migration 0126: Add reviewer_photo_url to google_reviews
--
-- The Google My Business API returns reviewer.profilePhotoUrl on each review.
-- Storing it lets us display the reviewer's Google profile photo on website
-- service cards and the reviews section without making live API calls.

ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url TEXT;
