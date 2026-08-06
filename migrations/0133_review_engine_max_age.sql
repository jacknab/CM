-- Add max_review_age_days to google_review_engine_settings
-- Controls how old a review can be before the engine skips auto-reply.
-- Default 30 days prevents mass-replying to historical reviews on first GBP connect.
ALTER TABLE google_review_engine_settings
  ADD COLUMN IF NOT EXISTS max_review_age_days INTEGER NOT NULL DEFAULT 30;
