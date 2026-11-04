-- Certxa Pro Plus switch for text messages (owner, 2026-11-03). On: the account's notification texts are free.
-- Off: every text the account sends takes 1 credit. Plus turns it on when it starts and off when it ends
-- (routes/soloPlus.ts, services/saas-billing.ts backToSolo), and it can be switched by hand.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sms_plus BOOLEAN NOT NULL DEFAULT false;

UPDATE locations l SET sms_plus = true
 WHERE EXISTS (
   SELECT 1 FROM store_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.store_id = l.id AND p.code = 'solo_plus' AND s.status IN ('active', 'trialing')
 );
