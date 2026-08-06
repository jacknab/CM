-- GBP Auth Failure Tracking
-- Adds three columns to google_business_profiles to track OAuth disconnection events.
-- When a refresh token is revoked or expired:
--   reconnect_required = true  → worker skips this store until the owner reconnects
--   auth_failure_at           → timestamp of the first failure
--   auth_failure_reason       → sanitized reason string (never exposes raw token data)
--
-- Cleared automatically when the owner completes a new OAuth flow.

ALTER TABLE google_business_profiles
  ADD COLUMN IF NOT EXISTS reconnect_required  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auth_failure_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_failure_reason TEXT;

-- Partial index — only indexes rows that actually need reconnecting (keeps it tiny).
CREATE INDEX IF NOT EXISTS gbp_reconnect_required_idx
  ON google_business_profiles(reconnect_required)
  WHERE reconnect_required = TRUE;
