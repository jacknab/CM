---
name: Feature-Based Subscription System
description: Architecture and key files for the dynamic plan/feature/limits system that replaced all hardcoded plan checks.
---

## Overview
A fully dynamic SaaS feature-gating system. No hardcoded `if(plan === "pro")` checks anywhere. All entitlements are DB-driven.

## Tables (migration 0034)
- `features` — master registry; `id` is a TEXT primary key (e.g. `sms_notifications`); seeded with 14 features.
- `subscription_plans` — plan definitions (Free/Solo/Pro/Agency); unique index on `code`; prices in cents integers.
- `plan_features` — pivot: `plan_id` + `feature_id` + `enabled` + `limit_value (nullable int)`; unique on (plan_id, feature_id).
- `store_subscriptions` — links a store to a plan; status `active|trialing|past_due|canceled|paused`; no unique constraint — query `WHERE status IN ('active','trialing') ORDER BY id DESC LIMIT 1`.
- `feature_usage` — per-store per-feature per-period counter; `period_start` is TEXT `YYYY-MM-01`; unique on (store_id, feature_id, period_start).

## Backend
- `artifacts/api-server/src/lib/featureAccess.ts` — `resolveFeature(storeId, featureId)` returns `{enabled, limit, used, remaining, planCode}`. Falls back to `free` plan when store has no active subscription.
- `artifacts/api-server/src/lib/featureAccess.ts` — `incrementFeatureUsage(storeId, featureId, by?)` upserts usage counter safely.
- `artifacts/api-server/src/lib/featureAccess.ts` — `canUseFeature(storeId, featureId)` — quick boolean gate.
- `artifacts/api-server/src/middleware/plan-middleware.ts` — `requireFeature(featureId)` Express middleware; attach to any route that needs gating. Legacy `requirePlan()` kept as no-op for backward compat.
- `artifacts/api-server/src/routes/plans.ts` — full CRUD; registered at `/api/plans`; admin-only except `/my-features` and `/my-plan`.

## Frontend
- `artifacts/booking/src/hooks/use-subscription-features.ts` — `useSubscriptionFeatures()` returns `{hasFeature, getLimit, getFeature, planCode}`; `useFeatureGate(featureId)` for single-feature gating.
- `artifacts/booking/src/pages/Admin/BillingPlansManager.tsx` — plans list using `/api/plans`; each plan has "Features →" button.
- `artifacts/booking/src/pages/Admin/PlanFeaturesBuilder.tsx` — 3-panel UI at `/isadmin/plans/:planId/features`.

## Why
Prompt required fully dynamic system with no hardcoded plan checks. Old `plan-middleware.ts` always returned "professional" as a stub. BillingPlansManager was calling the dead `/api/billing/admin/plans` endpoint (removed with Stripe) — rewritten to use `/api/plans`.

## How to apply
- `requireFeature("staff")` middleware on any route that should be gated.
- `useFeatureGate("advanced_reporting")` in React to hide UI elements.
- Admin assigns plan to store via `POST /api/plans/stores/:storeId/subscribe`.
