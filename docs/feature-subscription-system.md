# Feature-Based Subscription System

**Certxa — Platform Documentation**
*Migration 0034 · Last updated: June 2026*

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Feature Registry](#4-feature-registry)
5. [Subscription Plans](#5-subscription-plans)
6. [Plan–Feature Entitlement Matrix](#6-planfeature-entitlement-matrix)
7. [Backend: Access Layer](#7-backend-access-layer)
8. [Backend: Middleware](#8-backend-middleware)
9. [API Reference](#9-api-reference)
10. [Frontend Hooks](#10-frontend-hooks)
11. [Usage Tracking](#11-usage-tracking)
12. [Resolution Algorithm](#12-resolution-algorithm)
13. [Admin Workflows](#13-admin-workflows)
14. [Adding a New Feature](#14-adding-a-new-feature)
15. [Adding a New Plan](#15-adding-a-new-plan)
16. [Error Codes](#16-error-codes)
17. [Design Decisions](#17-design-decisions)

---

## 1. Overview

The Feature-Based Subscription System is the single source of truth for what every store on Certxa can and cannot do. It replaces hardcoded plan-name checks (`if plan === 'pro'`) with a fully data-driven entitlement model: plans, features, and limits are stored in the database and can be changed without a code deployment.

**Core properties:**

- **Database-driven** — plans and feature limits live in Postgres, not in source code.
- **No hardcoded plan names** — backend routes ask "can this store use feature X?" not "is this store on the Pro plan?".
- **Graceful degradation** — stores with no active subscription fall back to the `free` plan automatically. Infrastructure errors fail open (the route is allowed through) rather than blocking users.
- **Usage tracking** — counted features (SMS quota, staff seats, etc.) are tracked per-store per-calendar-month via an atomic upsert.
- **Admin-configurable** — platform admins can create new features, create new plans, configure which features belong to each plan, and assign plans to stores — all via API, no migrations required.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                               │
│  useSubscriptionFeatures()  useFeatureGate()                    │
│         │                       │                               │
│         └──── GET /api/plans/my-features?storeId=X ────────────►│
└─────────────────────────────────────────────────────────────────┘
                                                │
┌─────────────────────────────────────────────────────────────────┐
│  API Server (Express)                                           │
│                                                                 │
│  routes/plans.ts          — CRUD for plans, features, assign    │
│  middleware/plan-middleware.ts — requireFeature() middleware    │
│  lib/featureAccess.ts     — resolveFeature(), canUseFeature()  │
└─────────────────────────────────────────────────────────────────┘
                                                │
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                     │
│                                                                 │
│  features              — master feature registry               │
│  subscription_plans    — plan definitions + pricing            │
│  plan_features         — which features each plan includes     │
│  store_subscriptions   — store → plan assignments              │
│  feature_usage         — per-store per-feature monthly counter │
└─────────────────────────────────────────────────────────────────┘
```

### Data flow — checking access

```
Route handler or middleware
    │
    ▼
resolveFeature(storeId, featureId)
    │
    ├─ 1. Find active/trialing store_subscriptions row
    │       └─ if none → use 'free' plan as fallback
    │
    ├─ 2. Look up plan_features row (plan_id + feature_id)
    │       └─ if missing or disabled → return { enabled: false }
    │
    ├─ 3. If limit_value IS NULL → return { enabled: true, limit: null }
    │
    └─ 4. If limit_value is set → query feature_usage for current period
              └─ return { enabled: true, limit, used, remaining }
```

---

## 3. Database Schema

### 3.1 `features` — Feature Registry

```sql
CREATE TABLE features (
  id          TEXT PRIMARY KEY,              -- snake_case key, e.g. 'sms_notifications'
  name        TEXT NOT NULL,                 -- human-readable label
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`id` is the canonical string key used everywhere — in API calls, middleware calls, and frontend hooks. It must be lowercase snake_case. Only developers insert rows; admins configure plan assignments.

---

### 3.2 `subscription_plans` — Plan Definitions

```sql
CREATE TABLE subscription_plans (
  id                      SERIAL PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,  -- e.g. 'free', 'pro'
  name                    TEXT NOT NULL,
  description             TEXT,
  price_monthly_cents     INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents      INTEGER NOT NULL DEFAULT 0,
  stripe_price_id_monthly TEXT,                  -- stub for future payment reconnect
  stripe_price_id_yearly  TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  is_public               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`code` is the stable identifier used in fallback logic (`'free'`). Prices are stored in **cents** (integer) to avoid floating-point rounding.

---

### 3.3 `plan_features` — Entitlement Mapping

```sql
CREATE TABLE plan_features (
  id           SERIAL PRIMARY KEY,
  plan_id      INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_id   TEXT    NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  limit_value  INTEGER,                          -- NULL = unlimited; positive int = hard cap
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, feature_id)
);
```

This is the critical join table. A feature absent from this table for a given plan is treated as **disabled** for that plan. `limit_value` semantics:

| `limit_value` | Meaning |
|---|---|
| `NULL` | Unlimited — no cap enforced |
| `N` (positive integer) | Hard cap of N units per billing period |

---

### 3.4 `store_subscriptions` — Store → Plan Assignments

```sql
CREATE TABLE store_subscriptions (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  plan_id                INTEGER NOT NULL REFERENCES subscription_plans(id),
  status                 TEXT NOT NULL DEFAULT 'active',
  current_period_start   TIMESTAMP,
  current_period_end     TIMESTAMP,
  canceled_at            TIMESTAMP,
  stripe_subscription_id TEXT,                   -- stub for future payment reconnect
  stripe_customer_id     TEXT,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Status values:** `active` | `trialing` | `past_due` | `canceled` | `paused`

The active plan is resolved by: `WHERE store_id = ? AND status IN ('active', 'trialing') ORDER BY id DESC LIMIT 1`.

---

### 3.5 `feature_usage` — Monthly Usage Counters

```sql
CREATE TABLE feature_usage (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  feature_id      TEXT    NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  period_start    TEXT NOT NULL,                 -- 'YYYY-MM-01' (always 1st of month)
  usage_count     INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, feature_id, period_start)
);
```

Usage is reset implicitly each new calendar month — `period_start` acts as the partition key. Old rows are retained for historical audit. The unique constraint enables safe atomic upserts.

---

## 4. Feature Registry

The 14 seeded features, grouped by category:

### Booking

| Feature ID | Name | Description |
|---|---|---|
| `calendars` | Calendars | Multiple calendar views and scheduling |
| `online_booking_page` | Online Booking Page | Public self-booking page for clients |
| `waitlist` | Waitlist | Waitlist for fully-booked slots |
| `queue` | Check-in Queue | Digital check-in and walk-in queue management |

### Staff

| Feature ID | Name | Description |
|---|---|---|
| `staff` | Staff Members | Add and manage staff members |
| `commission_tracking` | Commission Tracking | Track commissions and run payroll |
| `contractors` | Contractor Management | Manage booth renters and independent contractors |

### Messaging

| Feature ID | Name | Description |
|---|---|---|
| `sms_notifications` | SMS Notifications | Automated SMS reminders and alerts to clients |

### Reporting

| Feature ID | Name | Description |
|---|---|---|
| `earnings_dashboard` | Earnings Dashboard | Revenue and earnings summary dashboard |
| `advanced_reporting` | Advanced Reporting | In-depth analytics, trends, and exportable reports |

### Website

| Feature ID | Name | Description |
|---|---|---|
| `domain` | Custom Domain | Connect a custom domain to the booking page |

### AI

| Feature ID | Name | Description |
|---|---|---|
| `ai_receptionist` | AI Receptionist | AI-powered phone receptionist that books appointments |

### Marketing

| Feature ID | Name | Description |
|---|---|---|
| `loyalty_rewards` | Loyalty Rewards | Points-based loyalty and rewards programme |

### POS

| Feature ID | Name | Description |
|---|---|---|
| `pos` | Point of Sale | In-person checkout, payments, and cash drawer |

---

## 5. Subscription Plans

| Code | Name | Monthly | Yearly |
|---|---|---|---|
| `free` | Free | $0 | $0 |
| `solo` | Solo | $29 | $290 |
| `pro` | Pro | $59 | $590 |
| `agency` | Agency | $99 | $990 |

---

## 6. Plan–Feature Entitlement Matrix

`∞` = unlimited (limit_value IS NULL) · `—` = feature not included · numbers = hard cap per billing month

| Feature | Free | Solo | Pro | Agency |
|---|---|---|---|---|
| `staff` | 2 | 3 | 10 | ∞ |
| `calendars` | 1 | 3 | 10 | ∞ |
| `sms_notifications` | 50 | 200 | 500 | 2 000 |
| `online_booking_page` | 1 | 1 | 3 | ∞ |
| `domain` | — | 1 | 1 | 3 |
| `waitlist` | ∞ | ∞ | ∞ | ∞ |
| `queue` | ∞ | ∞ | ∞ | ∞ |
| `commission_tracking` | — | ∞ | ∞ | ∞ |
| `earnings_dashboard` | — | ∞ | ∞ | ∞ |
| `advanced_reporting` | — | — | ∞ | ∞ |
| `contractors` | — | — | 5 | ∞ |
| `ai_receptionist` | — | — | ∞ | ∞ |
| `loyalty_rewards` | — | ∞ | ∞ | ∞ |
| `pos` | ∞ | ∞ | ∞ | ∞ |

---

## 7. Backend: Access Layer

File: `artifacts/api-server/src/lib/featureAccess.ts`

### `resolveStorePlan(storeId)`

```typescript
async function resolveStorePlan(storeId: number): Promise<{
  planId: number;
  planCode: string;
} | null>
```

Finds the store's active subscription. Returns the matched plan, or falls back to the `free` plan. Returns `null` only if no `free` plan exists in the database (should never happen in production).

---

### `resolveFeature(storeId, featureId)`

```typescript
async function resolveFeature(
  storeId: number,
  featureId: string
): Promise<FeatureAccess>
```

The primary entitlement resolver. Returns a `FeatureAccess` object:

```typescript
interface FeatureAccess {
  enabled: boolean;
  limit: number | null;   // null = unlimited
  used: number;           // 0 if no limit tracking
  remaining: number | null;
  planCode: string;       // which plan resolved this (e.g. 'pro')
}
```

**Example:**

```typescript
import { resolveFeature } from "../lib/featureAccess";

const access = await resolveFeature(42, "sms_notifications");
// { enabled: true, limit: 500, used: 137, remaining: 363, planCode: "pro" }

if (!access.enabled || (access.remaining ?? 1) <= 0) {
  return res.status(403).json({ error: "SMS quota exhausted" });
}
```

---

### `canUseFeature(storeId, featureId)`

```typescript
async function canUseFeature(storeId: number, featureId: string): Promise<boolean>
```

Convenience boolean check — returns `true` only when the feature is enabled and the store is not over its limit. Use this for quick guards where you do not need the full `FeatureAccess` detail.

---

### `incrementFeatureUsage(storeId, featureId, by?)`

```typescript
async function incrementFeatureUsage(
  storeId: number,
  featureId: string,
  by?: number   // default 1
): Promise<void>
```

Atomically increments the usage counter for the current billing period. Uses `INSERT ... ON CONFLICT DO UPDATE` so concurrent requests are safe without application-level locking.

**Always call this after successfully performing the metered action**, not before:

```typescript
// Send the SMS first
await sendSMS(phone, message);

// Then record the usage
await incrementFeatureUsage(storeId, "sms_notifications");
```

---

## 8. Backend: Middleware

File: `artifacts/api-server/src/middleware/plan-middleware.ts`

### `requireFeature(featureId)`

Express middleware factory. Attach it to any route that should be gated behind a feature.

```typescript
import { requireFeature } from "../middleware/plan-middleware";

router.post(
  "/appointments",
  requireFeature("calendars"),
  async (req, res) => { ... }
);
```

The middleware resolves `storeId` from (in priority order):
1. `req.params.storeId`
2. `req.query.storeId`
3. `req.body.storeId`

If no `storeId` is present the request passes through (non-store routes are unaffected).

**On success:** attaches `req.featureAccess` (the full `FeatureAccess` object) for use by the route handler.

**On failure:** returns `403` with a structured JSON body:

```json
{
  "message": "Your current plan does not include \"calendars\". Please upgrade.",
  "code": "FEATURE_NOT_ENABLED",
  "featureId": "calendars",
  "planCode": "free"
}
```

Or when over a limit:

```json
{
  "message": "You have reached your sms_notifications limit (50) for this billing period.",
  "code": "FEATURE_LIMIT_REACHED",
  "featureId": "sms_notifications",
  "planCode": "free",
  "limit": 50,
  "used": 50,
  "remaining": 0
}
```

**Fail-open policy:** if the database is unreachable, the middleware calls `next()` rather than blocking. This prevents infrastructure outages from locking users out of the app.

---

### `checkStaffLimit(storeId)`

```typescript
async function checkStaffLimit(storeId: number): Promise<{
  allowed: boolean;
  limit: number | null;
  current: number;
}>
```

Used before creating a new staff member. Queries the current staff count against the `staff` feature limit.

```typescript
const { allowed, limit, current } = await checkStaffLimit(storeId);
if (!allowed) {
  return res.status(403).json({
    error: `Staff limit reached (${current}/${limit}). Upgrade your plan to add more.`
  });
}
```

---

### `requirePlan()` — Deprecated

```typescript
/** @deprecated Use requireFeature() instead. */
function requirePlan(_minimumTier: string)
```

Kept for backward compile compatibility only. It is a no-op — it always calls `next()`. Migrate any remaining callers to `requireFeature()`.

---

## 9. API Reference

Base path: `/api/plans`

Authentication: all routes require a valid session. Admin-only routes additionally require `req.user.isAdmin === true`.

---

### Store-Scoped Endpoints

#### `GET /api/plans/my-features?storeId=X`

Returns the full feature access map for the store's active plan.

**Response:**

```json
{
  "planCode": "pro",
  "features": {
    "staff":             { "enabled": true,  "limit": 10   },
    "sms_notifications": { "enabled": true,  "limit": 500  },
    "advanced_reporting":{ "enabled": true,  "limit": null },
    "domain":            { "enabled": false, "limit": null },
    ...
  }
}
```

All active features in the registry are present in the map — disabled features have `enabled: false`. This allows the frontend to check any feature without a separate request.

---

#### `GET /api/plans/my-plan?storeId=X`

Returns the full `subscription_plans` row for the store's active plan, or `null` if no subscription exists.

```json
{
  "id": 3,
  "code": "pro",
  "name": "Pro",
  "priceMonthly": 5900,
  "priceYearly": 59000,
  "isActive": true,
  "isPublic": true,
  "sortOrder": 30
}
```

---

### Admin-Only Endpoints

#### `GET /api/plans/features`

Lists all features in the registry, ordered by `sort_order`.

#### `POST /api/plans/features`

Creates a new feature.

```json
{
  "id": "appointment_reminders",
  "name": "Appointment Reminders",
  "description": "Automated day-before reminders",
  "category": "messaging",
  "sortOrder": 35
}
```

`id` must match `/^[a-z0-9_]+$/` (lowercase snake_case). Returns `409` if the id already exists.

#### `PATCH /api/plans/features/:featureId`

Updates a feature's metadata (name, description, category, isActive, sortOrder). Does not affect plan assignments.

---

#### `GET /api/plans`

Lists all subscription plans ordered by `sort_order`.

#### `POST /api/plans`

Creates a new plan.

```json
{
  "code": "enterprise",
  "name": "Enterprise",
  "description": "Custom SLA for large brands.",
  "priceMonthly": 29900,
  "priceYearly": 299000,
  "isPublic": false,
  "sortOrder": 50
}
```

#### `PATCH /api/plans/:planId`

Updates plan metadata or pricing. Does not affect feature assignments.

#### `DELETE /api/plans/:planId`

Soft-deletes a plan (`is_active = false`). Existing subscribers are unaffected — their `store_subscriptions` row still points to the plan. Only hides the plan from future assignments.

---

#### `GET /api/plans/:planId/features`

Returns all feature assignments for a plan, joined with feature metadata.

```json
[
  {
    "featureId": "staff",
    "enabled": true,
    "limitValue": 10,
    "name": "Staff Members",
    "category": "staff"
  },
  ...
]
```

#### `PUT /api/plans/:planId/features/:featureId`

Upserts a plan–feature assignment (add or update an existing one).

```json
{ "enabled": true, "limitValue": 25 }
```

Set `"limitValue": null` for unlimited. Returns the updated `plan_features` row.

#### `DELETE /api/plans/:planId/features/:featureId`

Removes a feature from a plan. Stores on this plan immediately lose access to the feature.

---

#### `POST /api/plans/stores/:storeId/subscribe`

Assigns a plan to a store. Any existing `active` or `trialing` subscriptions are canceled first, then a new subscription row is inserted.

```json
{ "planId": 3, "status": "active" }
```

`status` must be `"active"` or `"trialing"`. Returns the new `store_subscriptions` row.

---

## 10. Frontend Hooks

File: `artifacts/booking/src/hooks/use-subscription-features.ts`

### `useSubscriptionFeatures()`

The primary hook. Fetches `/api/plans/my-features` for the currently selected store and exposes stable helper functions.

```typescript
import { useSubscriptionFeatures } from "@/hooks/use-subscription-features";

function MyComponent() {
  const { hasFeature, getLimit, planCode, isLoading } = useSubscriptionFeatures();

  if (!hasFeature("advanced_reporting")) {
    return <UpgradePrompt />;
  }

  const smsLimit = getLimit("sms_notifications"); // 500 or null
  ...
}
```

**Return shape:**

| Property | Type | Description |
|---|---|---|
| `isLoading` | `boolean` | True while the first fetch is in flight |
| `planCode` | `string \| null` | Active plan code (e.g. `"pro"`) |
| `features` | `Record<string, FeatureConfig>` | Raw feature map |
| `hasFeature(id)` | `(id: string) => boolean` | True if enabled on the plan. Returns `true` optimistically while loading |
| `getLimit(id)` | `(id: string) => number \| null` | Hard cap, or `null` if unlimited |
| `getFeature(id)` | `(id: string) => FeatureConfig \| null` | Full config object |

Data is cached for **60 seconds** (`staleTime: 60_000`) to avoid hammering the API on every render.

---

### `useFeatureGate(featureId)`

Lightweight single-feature hook. Use this when a component only needs to check one feature.

```typescript
import { useFeatureGate } from "@/hooks/use-subscription-features";

function AiReceptionistCard() {
  const { enabled, limit, isLoading, planCode } = useFeatureGate("ai_receptionist");

  if (!enabled) {
    return (
      <div className="opacity-50">
        <p>AI Receptionist requires the Pro plan or above.</p>
        <p>Your current plan: {planCode}</p>
      </div>
    );
  }

  return <AiReceptionistSetup />;
}
```

---

## 11. Usage Tracking

Usage tracking applies only to features with a numeric `limit_value` in `plan_features`. Features with `limit_value IS NULL` are never tracked in `feature_usage`.

### Billing period

The period key is always `YYYY-MM-01` (first of the current calendar month, UTC). There is no period-reset job — each new month's requests naturally create new rows under the new period key.

### Atomic upsert pattern

```sql
INSERT INTO feature_usage (store_id, feature_id, period_start, usage_count)
VALUES ($1, $2, $3, $4)
ON CONFLICT (store_id, feature_id, period_start)
DO UPDATE SET
  usage_count    = feature_usage.usage_count + EXCLUDED.usage_count,
  last_updated_at = NOW();
```

This is safe under concurrent load — no `SELECT` then `UPDATE` race condition.

### What to track

| Feature | When to increment |
|---|---|
| `sms_notifications` | After each SMS is successfully sent |
| `staff` | Not tracked per-month; checked against live count via `checkStaffLimit()` |
| `contractors` | Not tracked per-month; check live count before creation |
| `online_booking_page` | Not tracked per-month; count active pages before creation |
| `ai_receptionist` | Increment per call handled (if per-minute billing is added later) |

---

## 12. Resolution Algorithm

Complete step-by-step walkthrough of `resolveFeature(storeId, featureId)`:

```
1. SELECT plan_id, code FROM store_subscriptions
     JOIN subscription_plans ON plan_id = id
   WHERE store_id = $storeId
     AND status IN ('active', 'trialing')
   ORDER BY id DESC LIMIT 1

   → if found: use this plan
   → if not found: fallback to step 1b

1b. SELECT id, code FROM subscription_plans WHERE code = 'free' LIMIT 1
   → if not found: return { enabled: false, limit: 0, used: 0, remaining: 0 }

2. SELECT enabled, limit_value FROM plan_features
   WHERE plan_id = $planId AND feature_id = $featureId LIMIT 1

   → if not found: return { enabled: false, ... }
   → if found and enabled = false: return { enabled: false, ... }

3. if limit_value IS NULL:
   → return { enabled: true, limit: null, used: 0, remaining: null }

4. SELECT usage_count FROM feature_usage
   WHERE store_id = $storeId
     AND feature_id = $featureId
     AND period_start = 'YYYY-MM-01'
   LIMIT 1

   → used = usage_count ?? 0
   → remaining = MAX(0, limit_value - used)
   → return { enabled: true, limit: limit_value, used, remaining }
```

---

## 13. Admin Workflows

### Assigning a plan to a store

```bash
# Assign store 42 to the Pro plan (planId = 3)
curl -X POST /api/plans/stores/42/subscribe \
  -H "Content-Type: application/json" \
  -d '{ "planId": 3, "status": "active" }'
```

The system automatically cancels any existing active/trialing subscription before creating the new one. There can only ever be one active plan per store.

### Changing a feature limit on an existing plan

```bash
# Raise the SMS limit on Pro from 500 → 1000
curl -X PUT /api/plans/3/features/sms_notifications \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "limitValue": 1000 }'
```

Takes effect immediately for all stores on the Pro plan — no restart or cache flush required. The frontend cache expires within 60 seconds.

### Disabling a feature on a plan

```bash
# Remove advanced_reporting from the Solo plan
curl -X DELETE /api/plans/2/features/advanced_reporting
```

Stores on Solo lose access immediately on their next request (within 60 seconds for cached frontend sessions).

### Making a feature unlimited on a plan

```bash
# Give Agency unlimited contractors
curl -X PUT /api/plans/4/features/contractors \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "limitValue": null }'
```

---

## 14. Adding a New Feature

### Step 1 — Register the feature

```bash
curl -X POST /api/plans/features \
  -H "Content-Type: application/json" \
  -d '{
    "id": "email_campaigns",
    "name": "Email Campaigns",
    "description": "Send promotional emails to client lists",
    "category": "marketing",
    "sortOrder": 145
  }'
```

Or add to the seed in `migrations/0034_feature_subscription_system.sql` for future fresh installs.

### Step 2 — Assign it to plans

```bash
# Free: disabled (don't assign, or assign with enabled: false)
# Solo: 5 campaigns/month
curl -X PUT /api/plans/2/features/email_campaigns \
  -d '{ "enabled": true, "limitValue": 5 }'

# Pro: 50 campaigns/month
curl -X PUT /api/plans/3/features/email_campaigns \
  -d '{ "enabled": true, "limitValue": 50 }'

# Agency: unlimited
curl -X PUT /api/plans/4/features/email_campaigns \
  -d '{ "enabled": true, "limitValue": null }'
```

### Step 3 — Gate the backend route

```typescript
// In the relevant route file:
import { requireFeature } from "../middleware/plan-middleware";

router.post("/campaigns", requireFeature("email_campaigns"), async (req, res) => {
  // req.featureAccess is available here
  ...
  await incrementFeatureUsage(storeId, "email_campaigns");
});
```

### Step 4 — Gate the frontend component

```typescript
const { enabled, limit } = useFeatureGate("email_campaigns");

if (!enabled) return <UpgradePrompt feature="Email Campaigns" />;
```

No migration is needed for steps 2–4. Only step 1 touches the database.

---

## 15. Adding a New Plan

### Step 1 — Create the plan

```bash
curl -X POST /api/plans \
  -d '{
    "code": "enterprise",
    "name": "Enterprise",
    "priceMonthly": 29900,
    "priceYearly": 299000,
    "isPublic": false,
    "sortOrder": 50
  }'
# → { "id": 5, "code": "enterprise", ... }
```

### Step 2 — Configure its features

Assign each feature with the desired limit (or omit for disabled). See [Admin Workflows](#13-admin-workflows) for the `PUT /api/plans/:planId/features/:featureId` pattern.

### Step 3 — Assign stores

Use `POST /api/plans/stores/:storeId/subscribe` with the new `planId`.

No code changes required.

---

## 16. Error Codes

| HTTP | `code` field | Meaning |
|---|---|---|
| `400` | — | `storeId` missing or invalid; validation error on request body |
| `403` | `FEATURE_NOT_ENABLED` | Feature exists but is not included in the store's plan |
| `403` | `FEATURE_LIMIT_REACHED` | Feature is enabled but the monthly quota is exhausted |
| `404` | — | Plan or feature not found |
| `409` | — | Duplicate `code` (plan) or `id` (feature) |
| `500` | — | Unexpected server error |

When the middleware fails due to an infrastructure error (DB unreachable), it calls `next()` and the route proceeds — this is the **fail-open** policy.

---

## 17. Design Decisions

### Why database-driven instead of code constants?

Hardcoded plan checks (`if plan === 'pro'`) require a deployment to change any limit. With `plan_features`, a customer success agent can adjust a plan limit for a single store in seconds via the admin API, no deploy needed.

### Why fall back to `free` instead of blocking?

Stores should never become completely non-functional because a subscription expired or was canceled. The `free` plan provides a minimal usable experience. This prevents churn caused by accidental lockout.

### Why fail-open in the middleware?

A database blip during a feature-check should not take down the customer's booking page. The risk of briefly granting access to a gated feature is far lower than the risk of incorrectly blocking legitimate users.

### Why is `period_start` a `TEXT` column?

Postgres `DATE` adds implicit timezone coercion complexity. A `TEXT` key in `YYYY-MM-01` format is unambiguous, sorts correctly, and is trivially computed in any timezone.

### Why is usage tracked in `feature_usage` rather than on `store_subscriptions`?

Separating the usage table means one row per feature per period rather than ever-growing JSON blobs on the subscription row. It also makes it trivial to add new metered features without altering the subscriptions table.

### Why keep `stripe_price_id_monthly` / `stripe_price_id_yearly` on plans?

These columns are intentional stubs. Stripe Connect has been removed from the active codebase, but the columns allow a future payment provider to be wired up against existing plan records without a schema migration.

### Why `requirePlan()` instead of removing it?

Any callers compiled against the old signature would break at build time. The no-op shim keeps the codebase compiling while those callers are migrated to `requireFeature()`.
