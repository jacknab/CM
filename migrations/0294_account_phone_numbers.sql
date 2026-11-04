-- Certxa Pro sign-up phone rule (owner, 2026-11-03): every account proves a mobile number by text code, and a
-- number can belong to only one account, ever. Rows here are never deleted: a number the owner replaces is
-- marked inactive and still blocks new sign-ups. No foreign key to users on purpose, so the row outlives the
-- account. `phone` is E.164.
CREATE TABLE IF NOT EXISTS account_phone_numbers (
  phone          TEXT PRIMARY KEY,
  user_id        VARCHAR NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  line_type      TEXT,
  carrier        TEXT,
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_phone_numbers_user_idx ON account_phone_numbers (user_id);

-- Text codes sent during sign-up. The code and the token handed back after a correct code are stored hashed.
CREATE TABLE IF NOT EXISTS pro_phone_verifications (
  id          SERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  line_type   TEXT,
  carrier     TEXT,
  ip          TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  token_hash  TEXT,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pro_phone_verifications_phone_idx ON pro_phone_verifications (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS pro_phone_verifications_ip_idx ON pro_phone_verifications (ip, created_at DESC);

