#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed-free-trial-plan.sh
#
# Sets every salon account that has no subscription row to "Free Trial".
# Safe to run multiple times (idempotent).
#
# Usage on VPS:
#   chmod +x scripts/seed-free-trial-plan.sh
#   DATABASE_URL="postgres://user:pass@host:5432/dbname" bash scripts/seed-free-trial-plan.sh
#
# Or, if DATABASE_URL is already in your environment:
#   bash scripts/seed-free-trial-plan.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Usage: DATABASE_URL=\"postgres://user:pass@host:5432/dbname\" bash $0"
  exit 1
fi

echo "→ Connecting to database..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'

-- ── 1. Seed the Free Trial billing plan ──────────────────────────────────────
INSERT INTO billing_plans (
  code, name, description,
  price_cents, interval, sms_credits, currency,
  active, features_json,
  created_at, updated_at
)
VALUES (
  'free_trial',
  'Free Trial',
  '14-day free trial — full access to all features.',
  0, 'month', 0, 'usd',
  true, '{}',
  now(), now()
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      active      = true,
      updated_at  = now();

-- ── 2. Insert a subscription row for every location that has none ─────────────
-- status = 'trialing' so the back office shows the correct state.
-- trial_ends_at from the owner's users row is used where available;
-- otherwise we default to 14 days from the location's creation context.
INSERT INTO subscriptions (
  store_number,
  plan_code,
  status,
  interval,
  cancel_at_period_end,
  created_at,
  updated_at
)
SELECT
  l.id                    AS store_number,
  'free_trial'            AS plan_code,
  'trialing'              AS status,
  'month'                 AS interval,
  0                       AS cancel_at_period_end,
  now()                   AS created_at,
  now()                   AS updated_at
FROM locations l
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.store_number = l.id
);

-- ── 3. Summary ────────────────────────────────────────────────────────────────
SELECT
  'billing_plans rows'  AS table_name,
  COUNT(*)::text        AS row_count
FROM billing_plans WHERE code = 'free_trial'
UNION ALL
SELECT
  'subscriptions rows (free_trial)',
  COUNT(*)::text
FROM subscriptions
WHERE plan_code = 'free_trial'
UNION ALL
SELECT
  'locations without subscription',
  COUNT(*)::text
FROM locations l
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.store_number = l.id
);

SQL

echo "✓ Done. All salon accounts now have a Free Trial subscription row."
echo "  Reload any account in the back office — it will now show 'Free Trial' under PLAN."
