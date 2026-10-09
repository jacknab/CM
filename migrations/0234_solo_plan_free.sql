-- The Solo plan is free for now (decided 2026-10-09, to be revisited in about a year).
-- With no price there is nothing for Stripe to charge, so its Stripe price is unlinked: choosing Solo
-- activates the plan directly instead of opening a checkout.
-- For the revisit: Solo was $9.00 here and its Stripe price was price_1TtSVmRDJayCN7TTfV9etfV7 ($14.95 a month).
UPDATE subscription_plans
   SET price_monthly_cents = 0, price_yearly_cents = 0, stripe_price_id_monthly = NULL, stripe_price_id_yearly = NULL, updated_at = now()
 WHERE code = 'solo';
UPDATE billing_plans
   SET price_cents = 0, stripe_price_id = NULL, stripe_price_id_monthly = NULL, stripe_price_id_yearly = NULL, updated_at = now()
 WHERE code = 'solo';
