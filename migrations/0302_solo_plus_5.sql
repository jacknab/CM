-- Certxa Pro Plus is $5/month (owner, 2026-11-04; was $3). New subscriptions and renewals use the plan's price.
UPDATE subscription_plans SET price_monthly_cents = 500 WHERE code = 'solo_plus';
UPDATE saas_billing_profiles p SET amount_cents = 500, updated_at = now()
  FROM subscription_plans sp WHERE sp.id = p.plan_id AND sp.code = 'solo_plus' AND p.amount_cents = 300;
