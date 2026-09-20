-- 0184_deal_wallet_tokens.sql
--
-- Opaque, DB-stored magic-link token for a guest customer's "My vouchers"
-- wallet page (marketplace has no real account system). Looked up by email
-- so a re-used link always reflects every voucher for that email, including
-- ones purchased after the link was first issued.

CREATE TABLE IF NOT EXISTS deal_wallet_tokens (
    token       TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS deal_wallet_tokens_email_idx ON deal_wallet_tokens(email);
