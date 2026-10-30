-- Certxa Pro Plus (owner, 2026-10-30; plans/certxa-pro-sms.md phase 3): $3/month, unlimited notification texts,
-- billed by Certxa's own renewal run (services/saas-billing.ts), not Stripe Subscriptions. Not public: it is only
-- offered to Solo (Certxa Pro) accounts, from the app.
INSERT INTO subscription_plans (code, name, description, price_monthly_cents, price_yearly_cents, is_active, is_public, sort_order, created_at, updated_at)
SELECT 'solo_plus', 'Plus', 'Certxa Pro Plus: unlimited text notifications and full app access', 300, 3000, true, false, 2, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'solo_plus');

-- One-time links that sign the app's owner into certxa.com for a single purpose (buying Plus in the browser).
-- Only a hash of the token is stored; a link works once and for 15 minutes.
CREATE TABLE IF NOT EXISTS app_web_links (
  id          serial PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  user_id     text NOT NULL,
  store_id    integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  purpose     text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_web_links_expires_idx ON app_web_links (expires_at);
