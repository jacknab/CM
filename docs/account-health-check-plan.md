# Account Health Check — Plan

## Vision

A diagnostic tool that runs a structured series of checks across every part of an owner's account and surfaces the results in a clear, segmented view inside the support back office. Results are persisted to the database the moment they're generated so an agent can navigate away to fix something, then return to the same snapshot without re-running anything.

Longer term, the same engine can be scheduled to run automatically and push actionable findings directly to salon owners — resolving issues before they ever turn into a support ticket.

---

## Core Principles

- **Segmented & independently re-runnable.** Each segment is a self-contained check. Agents re-run only the segment they just fixed, not the entire tool.
- **Persisted, not ephemeral.** Every run (full or partial) is written to the database with a timestamp and the agent's identity. The UI loads the stored result — it never re-queries live data unless explicitly asked.
- **Tri-state results.** Every individual check resolves to one of: `pass` (green), `warn` (amber), or `fail` (red). No binary pass/fail — many issues are warnings, not hard failures.
- **Actionable.** Every non-passing check includes a one-line `action` field telling the agent exactly where to go to fix it.
- **Extensible to owners.** The segment engine is written so that a subset of checks can be exposed to owners directly — either on-demand or on a schedule — without requiring a parallel implementation.

---

## Segments

Each segment has a stable ID used when re-running it or requesting it from the API.

| # | Segment ID | Name | What It Checks |
|---|---|---|---|
| 1 | `booking_readiness` | Booking Readiness | Timezone, business hours, staff availability, staff-service assignments |
| 2 | `team_roster` | Team Roster | Staff status, portal access, roles, permissions |
| 3 | `services_catalog` | Services & Catalog | Service visibility, pricing, duration, add-ons |
| 4 | `features_settings` | Features & Settings | All feature flags, key store settings |
| 5 | `commission_payroll` | Commission & Payroll | Commission structures, staff assignments, deduction rules |
| 6 | `sms_communications` | SMS & Communications | SMS allowance, credits, Twilio config, delivery failures |
| 7 | `payments_billing` | Payments & Billing | Stripe Connect, subscription plan, trial status, wallet balance |
| 8 | `ai_receptionist` | AI Receptionist | Enabled state, phone number, Twilio webhook, OpenAI key |
| 9 | `online_presence` | Online Presence | Website, booking slug, Google Business Profile |
| 10 | `kiosk_waitlist` | Kiosk & Waitlist | Kiosk config, waitlist settings |

---

## Detailed Check Specifications

### SEG-1 — Booking Readiness

This is the most critical segment — almost every booking complaint traces to one of these four areas.

**1a. Timezone**
- Read `stores.state` and `stores.timezone`.
- Build a canonical US state → IANA timezone map server-side.
- **fail** if `timezone` is null, empty, or "UTC".
- **warn** if `timezone` does not match the expected timezone for `state` (e.g. store is in "TX" but timezone is "America/New_York").
- **pass** if timezone is set and matches the state.
- Action: `Settings → General → Timezone`

**1b. Business Hours**
- Read all rows from `business_hours` for the store.
- **fail** if no rows exist at all.
- **warn** listing specific day names for every day where `isClosed = false` but `openTime`/`closeTime` are null or empty.
- **warn** if all 7 days are marked `isClosed = true` (store is effectively closed).
- **pass** if at least one day is open with valid times.
- Action: `Settings → Business Hours`

**1c. Staff Availability**
- For each active staff member (`status != 'removed'`, `showOnCalendar = true`), read their `staff_availability` rows.
- **fail** if a staff member has zero availability rows.
- **warn** listing the specific day names with no availability for staff members with partial coverage.
- **pass** if all calendar-visible staff have full availability set.
- Output table: one row per staff member showing their name, their set days (✓), and their missing days (✗).
- Action: `Staff → [Member] → Schedule`

**1d. Staff → Service Assignments**
- Read all active services for the store.
- For each active staff member, check `staff_services` rows.
- **warn** if a staff member has zero service assignments (they will never appear in the booking flow).
- **warn** listing which services each staff member is missing (compared to all active services).
- **pass** if all calendar-visible staff are assigned to at least one service.
- Output table: staff member × service matrix with ✓/✗ cells.
- Action: `Staff → [Member] → Services`

---

### SEG-2 — Team Roster

**2a. Staff count & status**
- List all staff rows: name, role, employment type, status.
- Highlight `removed` staff still showing `showOnCalendar = true` — this is a data inconsistency.
- Show invite-pending staff (`inviteToken` not null, `joinedAt` null) with how long ago they were invited.

**2b. Portal access**
- Check `staff_portal_enabled` in `store_settings.preferences`.
- **warn** if portal is disabled but active staff exist.
- **warn** if any staff member's `permissions` JSON has an unexpected or overly permissive role.

---

### SEG-3 — Services & Catalog

**3a. Visibility**
- List all services showing: name, category, price, duration, `hiddenFromPublic`, `isActive`.
- **warn** for any service that is active but `hiddenFromPublic = true` — customers cannot book it online.
- **fail** if the store has zero active, visible services.

**3b. Pricing & duration**
- **warn** for any service with `price = 0` and no deposit policy — likely unintentional.
- **warn** for any service with no duration set.

**3c. Staff coverage gap**
- Cross-reference with SEG-1d: list services that have no staff members assigned at all — they are orphaned and unbookable.
- **fail** for any active, visible service with zero staff assignments.

---

### SEG-4 — Features & Settings

Read `store_settings.preferences` (JSON) and surface every meaningful flag.

| Check | Pass condition | Warn/Fail condition |
|---|---|---|
| Online booking enabled | `onlineBookingEnabled: true` | warn if false |
| Booking confirmation emails | configured | warn if no email set |
| SMS reminders | `smsRemindersEnabled: true` | warn if false and SMS is configured |
| Loyalty rewards | show enabled/disabled | informational |
| Waitlist | show enabled/disabled | informational |
| POS | `stores.posEnabled` | informational |
| Payment policy | `bookingPaymentPolicy` set | warn if `deposit` but Stripe not connected |
| Cancellation cutoff | `cancellationHoursCutoff > 0` | warn if 0 (no protection) |
| Late grace period | `lateGracePeriodMinutes` | informational |

---

### SEG-5 — Commission & Payroll

**5a. Commission structures**
- Query `commission_structures` for the store.
- **warn** if no structures exist.
- List all structures: name, employee %, house %, applies_to, is_default, is_active.

**5b. Staff commission assignment**
- For each active staff member, show `commissionEnabled`, `commissionRate`, `commissionStructureId`.
- **warn** for staff with `commissionEnabled = true` but `commissionStructureId = null` and no `commissionRate` set.
- **warn** for staff with `commissionEnabled = false` and `employmentType = 'contractor'` — contractors are normally commission-based.
- Output: one row per staff member with their commission status clearly shown. Unassigned staff are visually distinct.

**5c. Deduction rules**
- Query `payout_deduction_rules` for the store.
- List all active rules: name, type (fixed/percentage), amount, applies_to.
- **warn** if any rule applies to a staff member who no longer exists (foreign key points to a removed staff row).
- Show which staff members have no deduction rules (informational — may be intentional).

---

### SEG-6 — SMS & Communications

**6a. Twilio configuration**
- Check `store_settings.preferences` for `twilioAccountSid` / phone number fields, or check environment secrets presence.
- **warn** if Twilio is not configured (SMS features will silently fail).

**6b. SMS balance**
- Read `stores.smsAllowance` and `stores.platformCredits`.
- **fail** if both are 0 or null — the account cannot send any SMS.
- **warn** if `smsAllowance < 10` (nearly exhausted for the billing period).
- **warn** if `platformCredits < 0.20` (less than 10 SMS credits remaining in wallet).

**6c. Recent delivery failures**
- Count `api_error` events in `store_activity_events` with `metadata->>'errorNumeric' = '854'` in the last 30 days.
- **warn** if > 3 SMS delivery failures in the past 30 days — indicates bad phone numbers or carrier issues.

**6d. Email configuration**
- Check MAILGUN env vars are present (platform-level, not per-store).
- Check `store_settings.preferences` for notification email address.
- **warn** if no notification email is set for the store.

---

### SEG-7 — Payments & Billing

**7a. Subscription & trial**
- Read subscription plan from `user_subscriptions` / `plan_features` tables.
- Show: plan name, status, trial start/end dates, days remaining.
- **warn** if trial expires in < 7 days.
- **fail** if subscription is in a lapsed/cancelled state.

**7b. Stripe Connect**
- Check `store_payment_accounts` for the store.
- **fail** if `bookingPaymentPolicy` is `deposit` or `card_on_file` but no Stripe Connect account is linked.
- **warn** if Stripe account exists but `charges_enabled = false` (account not fully onboarded).

**7c. Platform credits wallet**
- Read `stores.platformCredits`.
- Show balance. **warn** if negative.

---

### SEG-8 — AI Receptionist

- Read AI Receptionist preferences from `store_settings.preferences`.
- **pass/warn/fail** for each of:
  - Feature enabled in subscription plan
  - Phone number provisioned
  - Twilio webhook URL set and matches expected format
  - OpenAI key available (platform-level check)
  - `aiReceptionistEnabled: true` in preferences
- Show last call date and total call count from `ai_call_logs` if the table exists.

---

### SEG-9 — Online Presence

**9a. Booking slug**
- Read `stores.bookingSlug`.
- **fail** if null or empty — the public booking page URL is broken.

**9b. Website**
- Query `wb_websites` for the store.
- **warn** if no website record exists.
- **warn** if website exists but `publishedAt` is null (built but never published).
- Show page count and last updated date.

**9c. Google Business Profile**
- Check `google_business_profiles` or equivalent table for a linked GBP.
- Show connection status and last sync date.
- **warn** if connected but last sync > 30 days ago.

---

### SEG-10 — Kiosk & Waitlist

- Check `kiosk_checkins` table / kiosk preferences in `store_settings.preferences`.
- Show whether kiosk is enabled, the kiosk URL slug, and checkins in the last 30 days.
- Show waitlist enabled/disabled and queue entries in the last 7 days.

---

## Data Model

### New table: `account_health_checks`

```sql
CREATE TABLE account_health_checks (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER NOT NULL REFERENCES locations(id),
  agent_id        INTEGER NOT NULL REFERENCES support_agents(id),
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  segments_run    TEXT[]  NOT NULL,          -- e.g. ['booking_readiness', 'team_roster']
  results         JSONB   NOT NULL,          -- full structured output, see below
  pass_count      INTEGER NOT NULL DEFAULT 0,
  warn_count      INTEGER NOT NULL DEFAULT 0,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT                       -- optional agent annotation
);

CREATE INDEX ON account_health_checks (account_id, run_at DESC);
```

### Result JSON structure

```json
{
  "booking_readiness": {
    "segmentId": "booking_readiness",
    "label": "Booking Readiness",
    "status": "fail",
    "runAt": "2026-07-31T00:00:00Z",
    "checks": [
      {
        "id": "timezone_match",
        "label": "Timezone matches store state",
        "status": "warn",
        "detail": "Store is in TX but timezone is set to America/New_York",
        "action": "Settings → General → Timezone"
      },
      {
        "id": "business_hours_set",
        "label": "Business hours configured",
        "status": "pass",
        "detail": "Open Monday–Saturday, 9 AM–7 PM"
      }
    ],
    "tables": {
      "staff_availability": [
        { "staffName": "Maria G.", "mon": true, "tue": true, "wed": false, "thu": true, "fri": true, "sat": false, "sun": false }
      ],
      "staff_services": [
        { "staffName": "Maria G.", "assigned": ["Gel Manicure", "Pedicure"], "missing": ["Acrylics"] }
      ]
    }
  }
}
```

Each segment's status rolls up from its individual checks: `fail` if any check is `fail`, `warn` if any are `warn` (and none `fail`), else `pass`.

---

## API Endpoints

All endpoints are under `/api/support/accounts/:id/health-check` and require `requireSupportAuth`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/support/accounts/:id/health-check` | Run all segments (or a subset via `?segments=seg1,seg2`) — saves to DB, returns the full result |
| `GET` | `/api/support/accounts/:id/health-check/latest` | Returns the most recent run |
| `GET` | `/api/support/accounts/:id/health-check/history` | Returns a list of past runs (id, agent, run_at, pass/warn/fail counts, notes) |
| `GET` | `/api/support/accounts/:id/health-check/:runId` | Returns a specific stored run |
| `PATCH` | `/api/support/accounts/:id/health-check/:runId` | Update notes on a stored run |
| `POST` | `/api/support/accounts/:id/health-check/:runId/segment/:segmentId` | Re-run a single segment, merge into the existing run record |

---

## Frontend — UI Design

### Location
A new **"Health Check"** tab on the `Customer360Page` (alongside Overview, Activity, Billing, etc.).

### Layout

```
┌─ Account Health Check ────────────────────────────── [Run All] [History ▾] ┐
│ Last run: 2 minutes ago by Admin Agent  •  3 ✗ Fail  5 ⚠ Warn  22 ✓ Pass │
├────────────────────────────────────────────────────────────────────────────┤
│ ✗ FAIL  Booking Readiness                            [Re-run segment]   ▾  │
│   ✗  Timezone does not match store state (TX → America/New_York)           │
│      → Settings → General → Timezone                                       │
│   ✓  Business hours configured (Mon–Sat, 9 AM–7 PM)                       │
│   ⚠  Staff availability gaps:                                              │
│      Maria G.   ✓ Mon  ✓ Tue  ✗ Wed  ✓ Thu  ✓ Fri  ✗ Sat  ✗ Sun        │
│      James K.   ✗ Mon  ✗ Tue  ✗ Wed  ✗ Thu  ✗ Fri  ✗ Sat  ✗ Sun  ← FAIL│
│   ⚠  Service assignment gaps:                                              │
│      Maria G. missing: Acrylics                                            │
│      → Staff → [member] → Services                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ ✓ PASS  Team Roster                                  [Re-run segment]   ▸  │
├────────────────────────────────────────────────────────────────────────────┤
│ ⚠ WARN  SMS & Communications                         [Re-run segment]   ▸  │
├────────────────────────────────────────────────────────────────────────────┤
│ ...                                                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

### Behaviour details
- **Collapsed by default** — segments with `pass` status load collapsed. `fail` segments auto-expand.
- **Re-run a segment** — calls `POST /health-check/:runId/segment/:segmentId`, merges result, re-renders only that card. The rest of the page stays intact.
- **History dropdown** — shows past 10 runs with agent name and timestamp. Selecting one loads it from the DB without any new queries against the store's data.
- **Annotate** — agents can add a free-text note to a run (e.g. "Fixed timezone and re-ran — all green now") saved via `PATCH /health-check/:runId`.
- **Loading state** — individual segments show a spinner when being re-run; other segments remain readable.
- **Share** — the run URL contains `?runId=NNN` so an agent can paste a link to a colleague.

---

## Server-Side Implementation Notes

### Segment runner architecture

Each segment is a standalone async function with a consistent signature:

```typescript
type SegmentRunner = (accountId: number, pool: Pool) => Promise<SegmentResult>;

interface SegmentResult {
  segmentId: string;
  label: string;
  status: "pass" | "warn" | "fail";
  runAt: string;
  checks: CheckResult[];
  tables?: Record<string, unknown[]>;
}

interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  action?: string;
}
```

All 10 runners live in `artifacts/api-server/src/lib/healthCheck/` as individual files:
- `segments/bookingReadiness.ts`
- `segments/teamRoster.ts`
- `segments/servicesCatalog.ts`
- `segments/featuresSettings.ts`
- `segments/commissionPayroll.ts`
- `segments/smsCommunications.ts`
- `segments/paymentsBilling.ts`
- `segments/aiReceptionist.ts`
- `segments/onlinePresence.ts`
- `segments/kioskWaitlist.ts`
- `index.ts` — exports the runner map and the `runHealthCheck(accountId, segments[])` orchestrator

The orchestrator runs all requested segments in **parallel** (`Promise.all`) and merges results, then writes one row to `account_health_checks`.

### State → Timezone map
A static lookup object in `artifacts/api-server/src/lib/healthCheck/stateTzMap.ts` mapping all 50 US state abbreviations to their primary IANA timezone. States that span zones (e.g. KY, TN, IN) list the majority timezone with a `multiZone: true` flag so the check emits a `warn` rather than a `fail` for those edge cases.

---

## Phase 2 — Owner-Facing Automation

Once the core tool is stable, the same `runHealthCheck()` function can power an automated owner-facing version:

1. **Scheduled run** — a cron job (e.g. weekly, or triggered 48 h after onboarding) runs the check for every active account.
2. **Filter to owner-relevant checks** — internal support checks (subscription lapse, Twilio env vars) are excluded; only actionable owner-facing items are surfaced.
3. **Delivery** — findings are sent as a structured email ("We noticed your account may have a configuration issue") or as an in-app notification on the owner's dashboard.
4. **Auto-resolve detection** — on the next scheduled run, previously warned checks that now pass are detected and a follow-up "All clear" notification is sent.

The segment architecture supports this with a single additional flag per `CheckResult`:

```typescript
ownerVisible: boolean;  // true = safe to show to the salon owner
```

---

## Files to Create / Modify

| Action | File |
|---|---|
| **Create** | `artifacts/api-server/src/lib/healthCheck/index.ts` — orchestrator |
| **Create** | `artifacts/api-server/src/lib/healthCheck/stateTzMap.ts` — state→timezone map |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/bookingReadiness.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/teamRoster.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/servicesCatalog.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/featuresSettings.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/commissionPayroll.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/smsCommunications.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/paymentsBilling.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/aiReceptionist.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/onlinePresence.ts` |
| **Create** | `artifacts/api-server/src/lib/healthCheck/segments/kioskWaitlist.ts` |
| **Create** | `artifacts/api-server/migrations/0140_account_health_checks.sql` — new table |
| **Modify** | `artifacts/api-server/src/routes/support.ts` — add 6 new endpoints |
| **Create** | `apps/support-backoffice/src/components/customer360/HealthCheckTab.tsx` |
| **Create** | `apps/support-backoffice/src/components/customer360/HealthCheckSegmentCard.tsx` |
| **Modify** | `apps/support-backoffice/src/pages/Customer360Page.tsx` — add Health Check tab |
| **Modify** | `apps/support-backoffice/src/lib/api.ts` — add `api.accounts.healthCheck.*` methods |

---

## Open Questions for Review

1. **Run access control** — should any support agent be able to run the tool, or should running (vs. viewing) be restricted to senior agents / admins?
2. **Run retention** — how long should stored runs be kept? Suggested: 90 days.
3. **Segment ordering** — the plan orders segments by criticality (Booking first). Confirm this is the preferred display order.
4. **Staff matrix display** — the staff × service assignment table could get wide for large teams. Should it paginate, scroll horizontally, or collapse to a summary count?
5. **Owner-facing phase** — is there a preferred delivery channel for Phase 2 (email, in-app notification, or both)?
