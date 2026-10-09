-- Phones that receive booking push notifications in the Certxa Pro app.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   owner_push_devices   one row per phone. token is the Expo push token the app registered.
--                        A phone that signs out, or whose token Apple or Google reports as gone,
--                        has its row deleted.

CREATE TABLE IF NOT EXISTS owner_push_devices (
  id           serial PRIMARY KEY,
  store_id     integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  token        text NOT NULL,
  platform     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_push_devices_token_unique ON owner_push_devices (token);
CREATE INDEX IF NOT EXISTS owner_push_devices_store_idx ON owner_push_devices (store_id);
