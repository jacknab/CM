-- Campaign compliance review fields
-- Adds rejection_reason and reviewed_at so the review pipeline can record
-- exactly why a campaign was rejected and when the review ran.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMP WITH TIME ZONE;

-- New statuses: pending_review, rejected (join existing draft/scheduled/sending/sent)
-- No enum change needed — status is plain TEXT.
