-- Certxa Pro text message credit packages, set in /isAdmin › Platform Settings (owner, 2026-11-03). A list of
-- { id, credits, priceCents }; the app's Credit balance screen and certxa.com/pro-credits sell these.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS solo_credit_packs JSONB NOT NULL
  DEFAULT '[{"id":"c100","credits":100,"priceCents":499},{"id":"c250","credits":250,"priceCents":799},{"id":"c500","credits":500,"priceCents":1199}]'::jsonb;
