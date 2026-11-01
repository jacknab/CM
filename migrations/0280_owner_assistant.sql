-- The /manage assistant (owner, 2026-11-01): it can look things up and change account and front desk settings, but
-- only after the owner confirms. A proposed change waits here until the owner taps Confirm or Cancel.
-- The conversation is kept so it is still there when the owner comes back.
-- (No semicolons inside strings here: the migration runner splits on them.)
CREATE TABLE IF NOT EXISTS assistant_actions (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  summary     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  result      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS assistant_actions_user_idx ON assistant_actions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  action_ids  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_user_idx ON assistant_messages (user_id, created_at DESC);
