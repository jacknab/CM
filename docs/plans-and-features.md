# Certxa — Subscription Plans & Features Guide

This document covers every subscription plan, exactly which features each plan includes, what limits apply, and step-by-step instructions for creating and managing plans through the Admin API.

---

## Plans Overview

There are five plans in the system. Four are publicly visible to customers; one (`free_trial`) is internal-only and assigned automatically at sign-up.

| Plan Code    | Name        | Monthly  | Yearly   | Public | Notes                               |
|--------------|-------------|----------|----------|--------|-------------------------------------|
| `free_trial` | Free Trial  | $0       | $0       | No     | All features, unlimited — expires   |
| `free`       | Free        | $0       | $0       | Yes    | Essential tools, hard limits        |
| `solo`       | Solo        | $29/mo   | $290/yr  | Yes    | For solo practitioners              |
| `pro`        | Pro         | $59/mo   | $590/yr  | Yes    | Growing salons, multi-staff         |
| `agency`     | Agency      | $99/mo   | $990/yr  | Yes    | Large operations, multi-location    |

> Prices are stored in **cents** in the database (`price_monthly_cents`, `price_yearly_cents`).

---

## Feature Registry

These are all 14 features currently in the system. The `id` column is the string key used everywhere — in API calls, middleware, and frontend hooks.

| Feature ID             | Name                   | Category    | Description                                                    |
|------------------------|------------------------|-------------|----------------------------------------------------------------|
| `staff`                | Staff Members          | staff       | Add and manage staff members                                   |
| `calendars`            | Calendars              | booking     | Multiple calendar views and scheduling                         |
| `sms_notifications`    | SMS Notifications      | messaging   | Automated SMS reminders and alerts to clients                  |
| `online_booking_page`  | Online Booking Page    | booking     | Public-facing booking page for clients to self-book            |
| `domain`               | Custom Domain          | website     | Connect a custom domain to the booking page                    |
| `waitlist`             | Waitlist               | booking     | Allow clients to join a waitlist for fully-booked slots        |
| `queue`                | Check-in Queue         | booking     | Digital check-in and walk-in queue management                  |
| `commission_tracking`  | Commission Tracking    | staff       | Track commissions and run payroll for staff                    |
| `earnings_dashboard`   | Earnings Dashboard     | reporting   | Revenue and earnings summary dashboard                         |
| `advanced_reporting`   | Advanced Reporting     | reporting   | In-depth analytics, trends, and exportable reports             |
| `contractors`          | Contractor Management  | staff       | Manage booth renters and independent contractors               |
| `ai_receptionist`      | AI Receptionist        | ai          | AI-powered phone receptionist that books appointments          |
| `loyalty_rewards`      | Loyalty Rewards        | marketing   | Points-based loyalty and rewards programme for clients         |
| `pos`                  | Point of Sale          | pos         | In-person checkout, payments, and cash drawer management       |

---

## Plan–Feature Matrix

A `limit` of **—** means unlimited. A number means a hard monthly cap. A blank cell means the feature is not included in that plan.

| Feature                | Free Trial | Free  | Solo  | Pro    | Agency   |
|------------------------|------------|-------|-------|--------|----------|
| `staff`                | —          | 2     | 3     | 10     | —        |
| `calendars`            | —          | 1     | 3     | 10     | —        |
| `sms_notifications`    | —          | 50    | 200   | 500    | 2,000    |
| `online_booking_page`  | —          | 1     | 1     | 3      | —        |
| `domain`               | —          |       | 1     | 1      | 3        |
| `waitlist`             | —          | —     | —     | —      | —        |
| `queue`                | —          | —     | —     | —      | —        |
| `commission_tracking`  | —          |       | —     | —      | —        |
| `earnings_dashboard`   | —          |       | —     | —      | —        |
| `advanced_reporting`   | —          |       |       | —      | —        |
| `contractors`          | —          |       |       | 5      | —        |
| `ai_receptionist`      | —          |       |       | —      | —        |
| `loyalty_rewards`      | —          |       | —     | —      | —        |
| `pos`                  | —          | —     | —     | —      | —        |

> **Free Trial**: Automatically granted to all new sign-ups. It assigns every feature with no limits. Once `trial_ends_at` passes, the system falls back to the `free` plan automatically — no manual intervention needed.

---

## How Plans Are Enforced

### Backend (API routes)

Any route can be gated with the `requireFeature` middleware:

```typescript
import { requireFeature } from "../middleware/plan-middleware";

// Gate a single feature — blocks if not enabled on the store's plan
app.post("/api/waitlist", isAuthenticated, requireFeature("waitlist"), handler);

// Gate with a counted limit — blocks once the monthly cap is reached
app.post("/api/sms/send", isAuthenticated, requireFeature("sms_notifications"), handler);
```

When a store exceeds a limit, the API responds:
```json
{ "code": "FEATURE_LIMIT_REACHED", "message": "You have reached your sms_notifications limit (200) for this billing period." }
```

When a feature is not on the plan:
```json
{ "code": "FEATURE_NOT_ENABLED", "message": "Your current plan does not include \"ai_receptionist\". Please upgrade to access this feature." }
```

To increment usage after a successful action:
```typescript
import { incrementFeatureUsage } from "../lib/featureAccess";

await incrementFeatureUsage(storeId, "sms_notifications");
```

### Frontend (React hooks)

```typescript
import { useFeatureGate } from "@/hooks/use-subscription-features";

function WaitlistButton() {
  const { enabled, limit } = useFeatureGate("waitlist");
  if (!enabled) return <UpgradePrompt feature="waitlist" />;
  return <Button>Join Waitlist</Button>;
}
```

Or wrap entire routes:
```tsx
// In App.tsx — already used for waitlist, pos, timeclock, rewardPoints
<Route path="/waitlist" element={
  <OwnerOnlyRoute>
    <FeatureGuard feature="waitlist">
      <Waitlist />
    </FeatureGuard>
  </OwnerOnlyRoute>
} />
```

---

## Admin API Reference

All plan management endpoints require an **admin session**. There is no public UI — these are called directly via the API.

### Base URL
```
/api/plans
```

---

### 1. Create a Feature

```http
POST /api/plans/features
Content-Type: application/json

{
  "id": "gift_cards",
  "name": "Gift Cards",
  "description": "Sell and redeem gift cards in-store and online",
  "category": "pos",
  "isActive": true
}
```

**Fields:**

| Field         | Type    | Required | Notes                                       |
|---------------|---------|----------|---------------------------------------------|
| `id`          | string  | Yes      | Unique slug, snake_case (e.g. `gift_cards`) |
| `name`        | string  | Yes      | Human-readable display name                 |
| `description` | string  | No       | Shown in the admin UI                       |
| `category`    | string  | Yes      | Groups features: `booking`, `staff`, `messaging`, `reporting`, `ai`, `marketing`, `pos`, `website` |
| `isActive`    | boolean | No       | Defaults to `true`                          |

**Response:** `201 Created` — the created feature object.

---

### 2. Update a Feature

```http
PATCH /api/plans/features/:featureId
Content-Type: application/json

{
  "name": "Gift Cards & Vouchers",
  "isActive": false
}
```

Deactivating a feature (`isActive: false`) hides it from all plan assignments but does not remove existing plan-feature rows.

---

### 3. List All Features

```http
GET /api/plans/features
```

Returns all features ordered by `sort_order`, then `category`, then `name`.

---

### 4. Create a Plan

```http
POST /api/plans
Content-Type: application/json

{
  "name": "Enterprise",
  "description": "Custom plan for enterprise accounts",
  "priceMonthly": 19900,
  "priceYearly": 199000,
  "stripePriceIdMonthly": "price_xxx",
  "stripePriceIdYearly": "price_yyy"
}
```

**Fields:**

| Field                  | Type    | Required | Notes                           |
|------------------------|---------|----------|---------------------------------|
| `name`                 | string  | Yes      | Display name                    |
| `description`          | string  | No       |                                 |
| `priceMonthly`         | integer | No       | In **cents**. Default: `0`      |
| `priceYearly`          | integer | No       | In **cents**. Default: `0`      |
| `stripePriceIdMonthly` | string  | No       | Stripe Price ID for monthly billing |
| `stripePriceIdYearly`  | string  | No       | Stripe Price ID for yearly billing  |

> The `planCode` is auto-generated from the name (lowercased, spaces → underscores). To use a custom code, add a `planCode` field explicitly.

**Response:** `201 Created` — the created plan object including its numeric `id`.

---

### 5. Update a Plan

```http
PATCH /api/plans/:planId
Content-Type: application/json

{
  "priceMonthly": 24900,
  "stripePriceIdMonthly": "price_new_xxx"
}
```

---

### 6. List All Plans

```http
GET /api/plans
```

Returns all plans with their associated feature entitlements.

---

### 7. Add or Update a Feature on a Plan

This is the key call for configuring what each plan can do. Use it to both add a new feature and change its limit.

```http
PUT /api/plans/:planId/features/:featureId
Content-Type: application/json

{
  "enabled": true,
  "limitValue": 1000
}
```

**Fields:**

| Field        | Type           | Notes                                                      |
|--------------|----------------|------------------------------------------------------------|
| `enabled`    | boolean        | `true` = feature is available on this plan                 |
| `limitValue` | integer / null | Monthly hard cap. `null` = unlimited. Must be ≥ 1 if set. |

**Example — give the Pro plan 1,000 SMS per month:**
```http
PUT /api/plans/3/features/sms_notifications
{ "enabled": true, "limitValue": 1000 }
```

**Example — add unlimited AI Receptionist to Agency:**
```http
PUT /api/plans/4/features/ai_receptionist
{ "enabled": true, "limitValue": null }
```

**Response:** `200 OK` — the updated plan-feature row.

---

### 8. Remove a Feature from a Plan

```http
DELETE /api/plans/:planId/features/:featureId
```

Removes the feature entitlement. The feature itself remains in the registry.

**Response:** `200 OK` — `{ "ok": true }`

---

### 9. Assign a Plan to a Store

```http
POST /api/plans/stores/:storeId/subscribe
Content-Type: application/json

{
  "planId": 3,
  "status": "active"
}
```

**Fields:**

| Field    | Type   | Notes                                    |
|----------|--------|------------------------------------------|
| `planId` | number | The numeric ID of the plan               |
| `status` | string | `"active"` or `"trialing"`. Default: `"active"` |

This cancels any existing active/trialing subscription for the store before creating the new one. The new billing period starts immediately and runs for one calendar month.

**Response:** `201 Created` — the new `store_subscriptions` row.

---

## Common Workflows

### Add a brand-new feature to all paid plans

```bash
# 1. Register the feature
POST /api/plans/features
{ "id": "sms_campaigns", "name": "SMS Campaigns", "category": "messaging" }

# 2. Add to Solo (limited)
PUT /api/plans/2/features/sms_campaigns
{ "enabled": true, "limitValue": 2 }

# 3. Add to Pro (more)
PUT /api/plans/3/features/sms_campaigns
{ "enabled": true, "limitValue": 10 }

# 4. Add to Agency (unlimited)
PUT /api/plans/4/features/sms_campaigns
{ "enabled": true, "limitValue": null }
```

### Upgrade a store from Free to Pro manually

```bash
# Find the Pro plan's ID first
GET /api/plans
# → id: 3

POST /api/plans/stores/42/subscribe
{ "planId": 3, "status": "active" }
```

### Check what a store can currently access

```bash
GET /api/plans/my-features?storeId=42
```

Returns:
```json
{
  "planCode": "pro",
  "features": {
    "staff":              { "enabled": true, "limit": 10 },
    "sms_notifications":  { "enabled": true, "limit": 500 },
    "ai_receptionist":    { "enabled": true, "limit": null },
    "waitlist":           { "enabled": true, "limit": null }
  }
}
```

---

## Fallback Behaviour

| Situation                              | Result                                    |
|----------------------------------------|-------------------------------------------|
| Store has no subscription row          | Falls back to `free` plan limits          |
| Trial has expired                      | Falls back to `free` plan limits          |
| Feature not in `plan_features` table   | Feature is treated as disabled (`false`)  |
| Database unreachable during check      | Fails open — feature is allowed           |
| `requireFeature` on a metered feature  | Blocks once `usage_count >= limit_value`  |

Usage counters reset automatically on the 1st of each calendar month (`period_start = YYYY-MM-01`).
