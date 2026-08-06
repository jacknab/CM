-- Migration 0130: Preserve Google reviewer avatars, review media, and owner replies.
-- All fields are optional so existing reviews and older API payloads remain valid.

ALTER TABLE google_reviews
  ADD COLUMN IF NOT EXISTS reviewer_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS google_review_resource_name TEXT,
  ADD COLUMN IF NOT EXISTS review_media_items JSONB,
  ADD COLUMN IF NOT EXISTS owner_reply JSONB,
  ADD COLUMN IF NOT EXISTS review_reply_url TEXT;