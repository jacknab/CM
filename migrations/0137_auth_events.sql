-- Auth Events Log
-- Records every login, logout, registration, password reset, and OAuth event
-- for an owner account, with IP address and user agent for security audit.

CREATE TABLE IF NOT EXISTS auth_events (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  store_id    INTEGER,
  event_type  VARCHAR(50) NOT NULL,
  -- event_type: login | failed_login | logout | register |
  --             forgot_password | password_reset | google_oauth | magic_link
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_events_store_id_idx   ON auth_events (store_id);
CREATE INDEX IF NOT EXISTS auth_events_user_id_idx    ON auth_events (user_id);
CREATE INDEX IF NOT EXISTS auth_events_created_at_idx ON auth_events (created_at DESC);
