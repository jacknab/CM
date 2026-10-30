-- Certxa Pro (Solo plan) SMS credits (owner, 2026-10-30; plans/certxa-pro-sms.md).
-- A Solo account without Plus spends 1 of locations.sms_credits for every text to a client. New Solo accounts
-- start with a free amount set by admins. Every change to the balance is one row in sms_credit_ledger.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS solo_free_sms_credits integer NOT NULL DEFAULT 50;
ALTER TABLE platform_settings DROP CONSTRAINT IF EXISTS platform_settings_solo_free_sms_credits_check;
ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_solo_free_sms_credits_check
  CHECK (solo_free_sms_credits >= 0 AND solo_free_sms_credits <= 10000);

CREATE TABLE IF NOT EXISTS sms_credit_ledger (
  id            serial PRIMARY KEY,
  store_id      integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  change        integer NOT NULL,
  balance_after integer NOT NULL,
  -- free_grant | purchase | text | refund | admin
  reason        text NOT NULL,
  message_type  text,
  -- Makes a grant or a purchase happen once only (e.g. 'free_grant', 'stripe:pi_...').
  reference     text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_credit_ledger_store_idx ON sms_credit_ledger (store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_ledger_reference_uq ON sms_credit_ledger (store_id, reference) WHERE reference IS NOT NULL;

-- Which balance alert was last sent to the owner ('low' at 10 left, 'empty' at 0); cleared when credits are added.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_credit_alert text;

-- Solo accounts that already exist get the free credits once, the same as a new signup.
WITH solo AS (
  SELECT DISTINCT ss.store_id
    FROM store_subscriptions ss JOIN subscription_plans p ON p.id = ss.plan_id
   WHERE p.code = 'solo' AND ss.status IN ('active', 'trialing')
     AND NOT EXISTS (SELECT 1 FROM sms_credit_ledger l WHERE l.store_id = ss.store_id AND l.reference = 'free_grant')
), granted AS (
  UPDATE locations SET sms_credits = sms_credits + COALESCE((SELECT solo_free_sms_credits FROM platform_settings ORDER BY id LIMIT 1), 50)
   WHERE id IN (SELECT store_id FROM solo)
  RETURNING id, sms_credits
)
INSERT INTO sms_credit_ledger (store_id, change, balance_after, reason, reference, note)
SELECT id, COALESCE((SELECT solo_free_sms_credits FROM platform_settings ORDER BY id LIMIT 1), 50), sms_credits, 'free_grant', 'free_grant', 'Free credits for a Solo account'
  FROM granted;
