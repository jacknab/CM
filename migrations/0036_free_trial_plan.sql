-- Migration 0036: Free Trial Plan
-- Creates a 'free_trial' plan with ALL features enabled and unlimited limits.
-- Users are assigned this plan when they sign up; it stays active until
-- trial_ends_at (on the users table) has passed, after which featureAccess.ts
-- falls back to the 'free' plan automatically.

-- ─── Insert free_trial plan (idempotent) ─────────────────────────────────────
INSERT INTO "subscription_plans"
  ("code", "name", "description", "price_monthly_cents", "price_yearly_cents", "is_active", "is_public", "sort_order")
VALUES
  ('free_trial', 'Free Trial', 'Full access to all features during your free trial period.', 0, 0, true, false, 5)
ON CONFLICT ("code") DO NOTHING;

-- ─── Grant ALL features (unlimited) to the free_trial plan ───────────────────
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value")
SELECT p.id, f.id, true, NULL::INTEGER
FROM "subscription_plans" p
CROSS JOIN "features" f
WHERE p.code = 'free_trial'
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;

-- ─── Backfill: assign free_trial subscription to existing stores whose user ───
-- is still on an active trial (subscription_status = 'trial' and trial not yet
-- expired), and who do not already have any store_subscription row.
INSERT INTO "store_subscriptions" ("store_id", "plan_id", "status", "current_period_start", "current_period_end")
SELECT
  l.id                          AS store_id,
  p.id                          AS plan_id,
  'trialing'                    AS status,
  u.trial_started_at            AS current_period_start,
  u.trial_ends_at               AS current_period_end
FROM "locations" l
JOIN "users" u ON u.id = l.user_id
JOIN "subscription_plans" p ON p.code = 'free_trial'
WHERE u.subscription_status = 'trial'
  AND u.trial_ends_at IS NOT NULL
  AND u.trial_ends_at > NOW()
  AND NOT EXISTS (
    SELECT 1 FROM "store_subscriptions" ss WHERE ss.store_id = l.id
  );
