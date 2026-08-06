-- Migration 0127: Add photo_url to reviews (user-submitted photos)
--
-- Allows clients to optionally attach a photo when submitting a review via
-- the public review form. The URL points to an R2 (or local) stored image.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_url TEXT;
