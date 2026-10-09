-- Account-level throttle for the automatic /manage AI business briefing.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_manage_briefing_at timestamptz;

CREATE INDEX IF NOT EXISTS users_last_manage_briefing_idx
  ON users (last_manage_briefing_at)
  WHERE last_manage_briefing_at IS NOT NULL;
