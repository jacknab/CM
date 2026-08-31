-- Loyalty rewards catalogue — owner-defined "spend N points → $X off" rewards.
-- The earning rate (points per $1 spent) is stored in
-- store_settings.preferences.loyalty, not here.

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id),
  name          TEXT NOT NULL,
  points_cost   INTEGER NOT NULL,
  dollar_value  NUMERIC(10,2) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_store ON loyalty_rewards (store_id);
