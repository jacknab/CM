-- Persist resumable wizard state without creating a second onboarding product.
ALTER TABLE onboarding_progress
  ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}'::jsonb;