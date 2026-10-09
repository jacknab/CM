-- A device that has signed in to a salon account is remembered, so its POS can sign itself back in when
-- the browser session is lost (instead of every request failing with 401 and staff guessing why).
-- Only the SHA-256 of the token is stored; the token itself lives in an httpOnly cookie on the device.
-- Signing out, or resetting the account's password, removes the rows.
CREATE TABLE IF NOT EXISTS device_logins (
  id           serial PRIMARY KEY,
  user_id      varchar NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS device_logins_user_idx ON device_logins (user_id);
