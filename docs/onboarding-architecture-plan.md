# Certxa Onboarding Architecture Plan

> **Status:** Proposal — no code changes made.  
> **Purpose:** Senior SaaS architect-level blueprint for a modular, scalable onboarding system.  
> **Instruction:** Review and approve before any implementation begins.

---

## Table of Contents

1. [Current Architecture Review](#1-current-architecture-review)
2. [Existing Data Model Map](#2-existing-data-model-map)
3. [Modular Onboarding System Design](#3-modular-onboarding-system-design)
4. [Recommended User Experience](#4-recommended-user-experience)
5. [Database Recommendations](#5-database-recommendations)
6. [Dependency Map](#6-dependency-map)
7. [Implementation Roadmap](#7-implementation-roadmap)

---

## 1. Current Architecture Review

### Frontend

| Concern | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Routing | react-router-dom v7 |
| State / Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| Build | Vite 7 |
| Mobile (staff / owner) | Expo SDK 56 + Expo Router |

**Routing structure (`App.tsx`)**  
Routes are organized into three access tiers:
- **Public routes** — `/`, `/auth`, `/book/:slug`, `/kiosk/:slug`, contractor onboarding portal (`/contractor-onboarding/:token`)
- **Authenticated owner routes** — dashboard, calendar, staff, services, payroll, settings, website builder, POS, campaigns, AI receptionist, etc.
- **Staff-only routes** — staff portal, staff dashboard, staff POS, staff calendar

**Route guards in place:**
- `StaffPortalGuard` — restricts staff to `STAFF_ALLOWED_PATHS`
- `OwnerOnlyRoute` — blocks staff from owner pages
- `AccountStatusGate` — handles trial expiry, suspension
- `SoloGuard` — redirects "Solo" plan users away from team features

### Backend

| Concern | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript + esbuild (CJS bundle) |
| Framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 (Replit managed) |
| Auth | Session-based (`SESSION_SECRET`), `isAuthenticated` middleware |
| File storage | Cloudflare R2 (via `lib/r2.ts`) |
| Email | Mailgun (`lib/mail.ts`) |
| SMS | Twilio |
| Payments | Stripe Connect + Stripe Terminal |
| AI | OpenAI Realtime API (AI Receptionist) |

**Route files in `artifacts/api-server/src/routes/`:**
`websites`, `templates`, `subdomains`, `billing`, `stripeConnect`, `stripeWebhook`, `clients`, `bookingPayments`, `payroll`, `contractorPayouts`, `aiReceptionist`, `intelligence`, `googleReviewEngine`, `liveChat`, `blog`, `health`, `systemStatus`, `sync`, `sync-jobs`, `staffWorkPhotos`, `usage`, `imageLibrary`, `siteAssets`, `plans`, `subscription`, `support`, `validate`

### Existing Setup Screens

| Screen | Path | Status |
|---|---|---|
| Main onboarding wizard | `/onboarding` | ✅ Exists (5 steps) |
| Google Business Profile setup | Component in onboarding | ✅ Exists (8 states) |
| AI Receptionist enrollment | `/manage/ai-receptionist/setup` | ✅ Exists |
| Payment / Stripe Connect setup | `/manage/payment-settings` | ✅ Exists |
| Staff payout setup | `/staff/members/:id` → PayoutsSetup tab | ✅ Exists |
| Add team member wizard | `AddTeamMemberWizard.tsx` (in payouts) | ✅ Exists |
| Contractor onboarding portal | `/contractor-onboarding/:token` | ✅ Exists (magic link) |
| Data transfer / migration | `/data-transfer` | ✅ Exists |
| POS settings | `/pos-settings` | ✅ Exists |
| Calendar settings | `/calendar-settings` | ✅ Exists |
| Services management | `/services` | ✅ Exists |

**What does NOT exist yet:**
- Unified onboarding hub / checklist dashboard
- Persistent per-store setup progress tracking
- Flow-to-flow navigation (finish one flow → prompted to start next)
- Completion gates (block certain features until prerequisites are met)
- Staff-specific guided onboarding (separate from owner flows)

---

## 2. Existing Data Model Map

### Salon / Store Profile

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Store | `locations` | `name`, `email`, `timezone`, `slug` | `GET/PATCH /api/settings/store` | Business Settings |
| Store Settings | `store_settings` | `currency`, `language`, feature flags | `GET/PATCH /api/settings` | Features Settings |
| Calendar Settings | `calendar_settings` | `slot_interval`, `allow_online_booking`, `language` | `GET/PATCH /api/calendar-settings` | Calendar Settings |
| Business Hours | `business_hours` | `day_of_week`, `open_time`, `close_time` | `GET/PATCH /api/business-hours` | Business Settings |
| Booking Policy | `booking_payment_policies` | cancellation rules, deposit rules | `GET/POST /api/booking-payment-policy` | Online Booking page |

**Missing for onboarding:** No `setup_complete` flag on `locations`; no onboarding checkpoint per store.

### Users / Auth

| Entity | Table | Key Columns | Notes |
|---|---|---|---|
| Owner user | `users` | `id` (UUID), `email`, `store_id` | Session-based auth |
| Staff user | `staff` | `email`, `role_id`, `is_active`, `store_id` | Separate login path (`/api/auth/staff-login`) |
| Staff OTP | `staff_sms_otps` | `staff_id`, `phone`, `code` | Mobile app auth |
| Staff PIN | `staff_pins` | `staff_id`, `pin_hash` | POS clock-in |

### Staff / Team Members

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Staff member | `staff` | `first_name`, `last_name`, `email`, `role_id`, `is_active` | `GET/POST/PATCH /api/staff` | Staff Overview / Profile |
| Staff availability | `staff_availability` | `staff_id`, `day_of_week`, `start_time`, `end_time` | `GET/PATCH /api/staff/:id/availability` | Staff Working Hours |
| Staff ↔ Services | `staff_services` | `staff_id`, `service_id` | `GET/PATCH /api/staff/:id/services` | Staff Profile → Services tab |
| Roles | `roles` | `id`, `name` | Part of staff routes | Team Permissions |
| Permissions | `permissions` | `role_id`, `action` | `PATCH /api/staff/:id/permission-level` | Team Permissions |
| Timeclock | `timeclock` | `staff_id`, `clock_in`, `clock_out` | `/api/timeclock` | Timeclock page |
| Pay rates | (in `staff` or separate) | commission %, service rates | `GET/PATCH /api/staff/:id/pay-rates` | Staff Pay Rates |

**Missing for onboarding:** No "invite staff via email" flow from within an onboarding context; no bulk service assignment step.

### Services / Categories

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Service Category | `service_categories` | `name`, `color`, `location_id`, `sort_order` | `GET/POST /api/service-categories` | Services page |
| Service | `services` | `name`, `price`, `duration`, `category_id` | `GET/POST/PATCH /api/services` | Services page |
| Service Add-ons | `service_options` / `addons` | `service_id`, `name`, `price` | `GET/POST /api/services/:id/options` | Service detail |
| Illustration categories | `service_illustration_categories` | AI-generated visual icons | `/api/illustration-categories` | Services page |

**Missing for onboarding:** No guided "build your first menu" flow; categories must exist before services can be created.

### Products / Inventory

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Product | `products` | `sku`, `name`, `price`, `stock_quantity`, `cost` | `/api/products` | Products (within POS or Services) |

### Commission Structures / Payroll

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Commission structure | `commission_structures` | `store_id`, `type` (percentage/flat), `rate`, `applies_to` | `/api/commission-structures` | Payroll Settings |
| Contractor profile | `contractors` | `staff_id`, `tax_id`, `stripe_account_id` | `/api/contractors` | Payouts → Contractors |
| Payout run | `payout_runs` | `store_id`, `period_start`, `period_end`, `status` | `/api/payroll/runs` | Payroll → Run |
| Payout items | `payout_run_items` | `run_id`, `contractor_id`, `amount` | Part of payout run routes | Payroll → Run detail |
| Direct deposit | `contractor_direct_deposits` | `contractor_id`, `stripe_account_id` | Contractor setup flow | Staff Financial Hub |
| Deductions | `payroll_deductions` | `store_id`, `name`, `amount`, `type` | `/api/payroll/deductions` | Payroll Settings |

**Missing for onboarding:** Commission structures can be complex; no wizard-style setup that walks owners through the typical nail salon compensation models (hourly vs. commission vs. booth rental).

### Payment Settings

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Stripe Connect | `store_payment_accounts` | `store_id`, `stripe_account_id`, `status` | `/api/payments/connect` | Payment Settings |
| Terminal | (runtime config) | reader config | `/api/payments/terminal/*` | Payment Settings |
| Tax settings | `store_settings` | `tax_rate`, `tax_services`, `tax_products` | Part of store settings | POS Settings |

### Booking / Calendar Configuration

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Calendar settings | `calendar_settings` | `slot_interval`, `buffer_time`, `max_advance_days` | `/api/calendar-settings` | Calendar Settings |
| Business hours | `business_hours` | days, times per day | `/api/business-hours` | Business Settings |
| Booking policy | `booking_payment_policies` | deposit %, cancellation window | `/api/booking-payment-policy` | Online Booking |
| Resources / Equipment | `salon_resources` | `name`, `type`, `location_id` | `/api/resources` | Resource Settings |
| Appointment resources | `appointment_resources` | `appointment_id`, `resource_id` | Booking engine | Calendar |

### Customer Settings

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Client | `clients` | `first_name`, `last_name`, `email`, `phone`, `loyalty_points` | `/api/clients` | Clients |
| Client phones | `client_phones` | `client_id`, `phone_number_e164` | Part of client routes | Client detail |
| Loyalty | (in `store_settings`) | loyalty toggle, points rules | `/api/settings` | Loyalty page |

### Website Builder Settings

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Website | `wb_websites` | `store_id`, `name`, `slug`, `published`, `template_id`, `publisher_type` | `/api/websites` | Website Builder → My Websites |
| Template | `wb_templates` / `launchsite_templ` | `name`, `thumbnail`, `html` | `/api/templates` | Website Builder → Templates |
| Subdomain | `purchased_subdomains` | `store_id`, `subdomain`, `status` | `/api/subdomains` | Website Builder |
| Blog posts | `blog_posts` | `store_id`, `title`, `content` | `/api/blog` | Website Builder |

### Google Business Profile

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| GBP connection | `google_business_profiles` | `store_id`, `access_token_enc`, `refresh_token_enc` | `/api/gbp` | Marketing → GBP |
| GBP location | `google_business_locations` | `profile_id`, `location_name` | Part of GBP routes | GBP setup |
| Review engine | `google_review_engine_settings` | `store_id`, `auto_reply_enabled`, `tone` | `/api/review-engine` | Reviews page |
| Post queue | `gbp_post_queue` | `store_id`, `content`, `status` | `/api/gbp/posts` | GBP post management |

### AI Receptionist

| Entity | Table | Key Columns | API Endpoints | UI Screen |
|---|---|---|---|---|
| Settings | `ai_receptionist_settings` | `store_id`, `enabled`, `phone_number`, `greeting` | `GET/PATCH /api/ai-receptionist/settings` | AI Receptionist Enrollment |
| Call log | `ai_call_log` | `store_id`, `caller_number`, `intent`, `outcome` | `/api/ai-receptionist/call-logs` | AI Call Logs |

**Missing for onboarding:** Twilio phone number provisioning is not self-serve; requires manual configuration today.

### Existing Onboarding Table

| Entity | Table | Notes |
|---|---|---|
| Onboarding submission | `onboarding_submissions` | Tracks initial signup data; fields TBD from schema |

**Gap:** `onboarding_submissions` stores initial form data but there is no `onboarding_progress` table tracking which flows have been completed per store.

---

## 3. Modular Onboarding System Design

### Design Principles

1. **Flows are independent modules** — each flow is a self-contained wizard that can be entered from the dashboard checklist, a direct link, or an in-app prompt.
2. **Progress is persistent** — completion state lives in the database, not the browser.
3. **Flows are additive** — adding a new Certxa feature means adding a new flow module; nothing else changes.
4. **Prerequisites are soft gates** — the system warns about unmet dependencies but never hard-blocks unless data is strictly required.
5. **Staff onboarding is separate** — staff see a simplified onboarding when they first log in, scoped to their role.
6. **Flows can be revisited** — completing a flow doesn't lock it; owners can re-enter any flow at any time.

---

### Flow A — Salon Owner Initial Setup

**Purpose:** Establish the business foundation. This is the only required flow before Certxa is usable.

**Trigger:** Immediately after email verification / account creation.

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Business name & category | `name`, `business_type` | `locations` |
| 2 | Location & address | `address`, `city`, `state`, `zip`, `timezone` | `locations` |
| 3 | Business hours | hours per day | `business_hours` |
| 4 | Booking URL slug | `slug` (e.g. `glamour-nails`) | `locations` |
| 5 | Branding (logo + accent color) | `logo_url`, `brand_color` | `store_settings` |
| 6 | Done / Launch | Marks flow complete | `onboarding_progress` |

**What already exists:** Steps 1–4 exist in `/onboarding` (current 5-step wizard). Steps 5–6 are missing.

**Missing pieces:**
- Logo/branding upload step
- Completion flag persistence
- Redirect to onboarding hub after completion

---

### Flow B — Team Members Setup

**Purpose:** Build the salon team so the calendar and POS can function.

**Trigger:** Prompted from onboarding hub after Flow A is complete.

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Define roles | `roles` (Manager, Stylist, Front Desk, etc.) | `roles` |
| 2 | Add first team member | `first_name`, `last_name`, `email`, `role_id` | `staff` |
| 3 | Set their services | Which services this staff member performs | `staff_services` |
| 4 | Set their working hours | Days/times available | `staff_availability` |
| 5 | Set commission eligibility | Yes/No, links to Flow C | `staff` settings |
| 6 | Invite (send email invite) | Trigger email → staff portal | Email via Mailgun |
| 7 | Add more or continue | Loop or proceed to hub | `onboarding_progress` |

**What already exists:** `AddTeamMemberWizard.tsx` exists but is buried in `/payouts/contractors/`. `StaffWorkingHours.tsx` and staff service assignment exist as standalone pages.

**Missing pieces:**
- Centralized "add first staff" flow at onboarding time
- Role creation step (today roles seem pre-seeded)
- Email invite integration within the onboarding context
- Progress tracking per staff member added

---

### Flow C — Commission & Payroll Setup

**Purpose:** Define how staff get paid so payroll runs correctly.

**Trigger:** Prompted after Flow B, or when first staff member is marked commission-eligible.

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Choose compensation model | hourly / commission % / flat rate / booth rental | `commission_structures` |
| 2 | Service commissions | Per-service or global rate | `commission_structures` |
| 3 | Product commissions | Retail product sale commission % | `commission_structures` |
| 4 | Tips handling | How tips distribute (keep own / pool) | `store_settings` |
| 5 | Payroll deductions | Booth rental, product deductions | `payroll_deductions` |
| 6 | Pay period setup | Weekly / biweekly / monthly | `store_settings` / `payout_runs` config |
| 7 | Tax document preferences | 1099 collection reminder | `contractors` |

**What already exists:** `PayrollSettings.tsx` covers deductions and pay periods. `StaffPayRates.tsx` handles individual rates. `commission_structures` table exists.

**Missing pieces:**
- Wizard-style compensation model chooser ("Which best describes your salon?")
- Global-vs-per-service commission configurator in a single flow
- Tips distribution setup step

---

### Flow D — Services Menu Setup

**Purpose:** Create the service catalog so clients can book and POS can ring up services.

**Trigger:** Prompted after Flow A (no staff dependency; can be done solo).

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Create first category | `name`, `color` | `service_categories` |
| 2 | Add services to category | `name`, `price`, `duration` | `services` |
| 3 | Add add-ons (optional) | `name`, `price`, `duration_add` | `service_options` |
| 4 | Assign staff to services | Which staff can perform each service | `staff_services` |
| 5 | Set booking visibility | Online-bookable yes/no per service | `services.is_bookable` |
| 6 | Add more categories | Loop back | — |
| 7 | Done | Marks flow complete | `onboarding_progress` |

**What already exists:** `/services` page with full CRUD. Staff assignment exists. No onboarding-context wizard.

**Missing pieces:**
- Guided wizard mode for first-time service creation
- "Import from common nail salon services" shortcut (pre-fill templates)
- No explicit `is_bookable` toggle per service (may exist in schema, needs verification)

---

### Flow E — POS & Payments Setup

**Purpose:** Enable checkout — both cash and card.

**Trigger:** Prompted from onboarding hub; soft prerequisite is having at least one service.

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Connect Stripe | Stripe Connect OAuth | `store_payment_accounts` |
| 2 | Tax configuration | `tax_rate`, which items are taxable | `store_settings` |
| 3 | Tips configuration | Preset percentages, custom | `store_settings` |
| 4 | Terminal setup (optional) | Stripe Terminal reader pairing | Runtime / `store_payment_accounts` |
| 5 | Receipt preferences | Email/SMS receipts, branding | `store_settings` |
| 6 | POS grid layout | Categories, quick-add buttons | `pos_grids`, `pos_grid_slots` |

**What already exists:** `PaymentSettings.tsx` covers Stripe Connect end-to-end. `POSSettings.tsx` covers tax + dual screen. Terminal setup exists in payment settings.

**Missing pieces:**
- Unified flow that chains Stripe → Tax → Tips → Terminal → Receipt in sequence
- POS grid setup step within onboarding context

---

### Flow F — Booking & Calendar Setup

**Purpose:** Fine-tune the appointment experience for both owners and clients.

**Trigger:** Prompted after Flow D (services) and Flow A (hours). Can be done after services.

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Slot interval | 15 / 30 / 60 min | `calendar_settings` |
| 2 | Buffer time between appointments | minutes | `calendar_settings` |
| 3 | Online booking toggle | Enable/disable | `calendar_settings` |
| 4 | Advance booking window | Max days ahead clients can book | `calendar_settings` |
| 5 | Cancellation policy | Hours notice required, deposit rules | `booking_payment_policies` |
| 6 | Confirmation & reminder settings | Email/SMS timing | `store_settings` |
| 7 | Resource setup (optional) | Tables, rooms, equipment | `salon_resources` |

**What already exists:** `CalendarSettings.tsx` and `OnlineBooking.tsx` cover most of these. `booking_payment_policies` table exists.

**Missing pieces:**
- No guided first-run flow; all settings are scattered across separate settings pages
- Resource setup has its own page (`/settings/resources`) but isn't linked to a flow

---

### Flow G — Marketing & Growth Setup

**Purpose:** Get the salon discovered online and drive repeat visits.

**Trigger:** Optional; prompted from hub after core setup is complete.

**Sub-flows (each independently completable):**

| Sub-flow | Steps | Existing UI |
|---|---|---|
| **G1: Website Builder** | Pick template → customize → publish | `/website-builder` ✅ |
| **G2: Google Business Profile** | Connect Google → verify location → sync hours/services | `GoogleBusinessProfileSetup.tsx` ✅ |
| **G3: Client Reminders** | Enable SMS/email reminders → set timing | Settings pages ✅ |
| **G4: Review Collection** | Enable auto-review requests → set review engine tone | `Reviews.tsx` ✅ |
| **G5: Loyalty Program** | Enable loyalty → set point rules | `Loyalty.tsx` ✅ |
| **G6: Campaigns** | Create first campaign | `Campaigns.tsx` ✅ |

**Missing pieces:**
- No hub that surfaces these as a cohesive "grow your business" checklist
- GBP connection is partially wired in existing `/onboarding` (step 4) but not persistent
- No cross-promotion: completing website builder doesn't prompt GBP, etc.

---

### Flow H — AI Receptionist Setup

**Purpose:** Configure the AI phone agent to handle bookings 24/7.

**Trigger:** Optional; requires Twilio phone number (currently manual).

**Steps:**

| # | Step | Data Captured | Table(s) |
|---|---|---|---|
| 1 | Enable AI Receptionist | Toggle | `ai_receptionist_settings` |
| 2 | Business info review | Confirm hours, services, staff shown to caller | `ai_receptionist_settings` |
| 3 | Greeting message | Custom greeting text | `ai_receptionist_settings` |
| 4 | Booking rules | Which services are phone-bookable | `ai_receptionist_settings` |
| 5 | Escalation settings | When to transfer to human | `ai_receptionist_settings` |
| 6 | Test call | Live test via browser | — |

**What already exists:** `AiReceptionistEnrollment.tsx` at `/manage/ai-receptionist/setup` covers most of these steps.

**Missing pieces:**
- Self-serve Twilio phone number provisioning (currently manual VPS config)
- Test call UI within the onboarding step

---

## 4. Recommended User Experience

### Immediately After Signup

```
Sign Up → Email Verification → Flow A (Required) → Onboarding Hub
```

Flow A is the only mandatory gate. It takes ~3 minutes. After completing it, the owner lands on the **Onboarding Hub** — a persistent dashboard that shows all available flows with completion status.

### The Onboarding Hub

This is a new page at `/onboarding/hub` or surfaced as a dismissible banner on the main dashboard. Think of it like Shopify's "Set up your store" checklist.

```
╔══════════════════════════════════════════════════════╗
║  Get Certxa ready for your first client              ║
║  ─────────────────────────────────────────────────── ║
║  ✅ Business Setup          [Complete]                ║
║  ⚡ Services Menu           [Start →]  ← next       ║
║  ○  Team Members            [Start →]                ║
║  ○  Booking & Calendar      [Start →]  locked*       ║
║  ○  POS & Payments          [Optional] [Start →]     ║
║  ○  Commission & Payroll    [Optional] [Start →]     ║
║  ○  Marketing & Growth      [Optional] [Start →]     ║
║  ○  AI Receptionist         [Optional] [Start →]     ║
╚══════════════════════════════════════════════════════╝
* soft lock: can unlock but shows dependency warning
```

### Required vs Optional

| Flow | Required? | Can be deferred? |
|---|---|---|
| A — Business Setup | ✅ Required | No — gate before dashboard |
| D — Services | ✅ Required (for booking to work) | Yes — but booking is broken without it |
| B — Team Members | Optional | Yes — solo operator use case |
| F — Booking & Calendar | Recommended | Yes — defaults are sensible |
| E — POS & Payments | Optional | Yes — cash-only workflow still works |
| C — Commission & Payroll | Optional | Yes — only matters with staff |
| G — Marketing & Growth | Optional | Yes |
| H — AI Receptionist | Optional | Yes |

### Progress Tracking

- Completion is stored per store in `onboarding_progress` (new table — see §5).
- Each flow has a `status`: `not_started` / `in_progress` / `complete` / `skipped`.
- Each step within a flow has individual completion tracking for resume capability.
- The hub shows a global % complete ("Your salon is 60% set up").
- A persistent but dismissible banner on the main dashboard shows the next recommended flow.

### Resume Capability

When a user returns mid-flow:
- The flow wizard reads `onboarding_progress.last_step` and resumes at the correct step.
- Completing a step immediately saves to the DB (no "save all at the end" risk).
- Flows that have been partially completed show "Continue →" instead of "Start →" on the hub.

### Staff vs Owner Onboarding

**Owner flow:** Full hub with all 8 flows as described above.

**Staff first login:**  
A lightweight, 3-screen guided moment (not a full flow):
1. Confirm name and profile photo
2. Review their assigned services and hours
3. Set up their PIN (for POS clock-in)

Staff do not see the full onboarding hub. They go directly to their staff dashboard after the 3-screen welcome.

---

## 5. Database Recommendations

### New Tables Required

#### `onboarding_flows`
Master registry of available flows. Allows new features to register their flow without code changes to the hub.

```sql
CREATE TABLE onboarding_flows (
  id            SERIAL PRIMARY KEY,
  key           VARCHAR(64) NOT NULL UNIQUE,   -- e.g. 'business_setup', 'team_members'
  title         VARCHAR(128) NOT NULL,
  description   TEXT,
  category      VARCHAR(32),                   -- 'required', 'recommended', 'optional'
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `onboarding_steps`
Step registry per flow. Allows each flow to declare its steps independently.

```sql
CREATE TABLE onboarding_steps (
  id            SERIAL PRIMARY KEY,
  flow_id       INTEGER NOT NULL REFERENCES onboarding_flows(id),
  key           VARCHAR(64) NOT NULL,           -- e.g. 'business_hours'
  title         VARCHAR(128) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_skippable  BOOLEAN NOT NULL DEFAULT false
);
```

#### `onboarding_progress`
Per-store progress state. One row per store per flow.

```sql
CREATE TABLE onboarding_progress (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id),
  flow_id       INTEGER NOT NULL REFERENCES onboarding_flows(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'not_started',
                -- 'not_started' | 'in_progress' | 'complete' | 'skipped'
  last_step_key VARCHAR(64),                    -- which step to resume on
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  skipped_at    TIMESTAMPTZ,
  metadata      JSONB,                          -- flow-specific context
  UNIQUE(store_id, flow_id)
);
```

#### `onboarding_step_completions`
Granular per-step tracking for accurate resume and analytics.

```sql
CREATE TABLE onboarding_step_completions (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES locations(id),
  flow_id       INTEGER NOT NULL REFERENCES onboarding_flows(id),
  step_key      VARCHAR(64) NOT NULL,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by  VARCHAR(255),                   -- user_id or staff_id
  UNIQUE(store_id, flow_id, step_key)
);
```

### Modification to Existing Tables

```sql
-- Track whether a store has completed initial setup (used by AccountStatusGate)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT false;

-- Track staff first-login welcome completion
ALTER TABLE staff ADD COLUMN IF NOT EXISTS welcome_complete BOOLEAN NOT NULL DEFAULT false;
```

### Seed Data

On deploy, seed `onboarding_flows` and `onboarding_steps` with the 8 flows. Because these are in a table, adding a new feature's onboarding is a migration + DB seed — no frontend hub code changes needed.

---

## 6. Dependency Map

```
Flow A: Business Setup (REQUIRED FIRST)
        │
        ├──────────────────────┐
        ↓                      ↓
Flow D: Services Menu     Flow B: Team Members
        │                      │
        │              ┌───────┴───────┐
        │              ↓               ↓
        │     Flow C: Commission   (Staff can now be
        │             & Payroll     assigned to services)
        │                          ↓
        ├──────────────────────────┘
        ↓
Flow F: Booking & Calendar
        │
        ↓
Flow E: POS & Payments
        │
        ├──────────────────────┐
        ↓                      ↓
Flow G: Marketing         Flow H: AI Receptionist
        │                      │
        ↓                      ↓
    (Independent)          (Independent)
```

### Correct Setup Order

1. **Flow A** (Business Setup) — Provides store foundation; all other flows require this.
2. **Flow D** (Services) — Needed for booking to work and for staff assignment.
3. **Flow B** (Team Members) — Staff need services to exist to be assigned.
4. **Flow C** (Commission/Payroll) — Needs staff to exist.
5. **Flow F** (Booking & Calendar) — Needs services; benefits from staff being configured.
6. **Flow E** (POS & Payments) — Needs services for the POS grid; benefits from tax/tip config.
7. **Flow G** (Marketing) — Benefits from services and hours being accurate for GBP sync and website.
8. **Flow H** (AI Receptionist) — Benefits from all the above; AI needs to know services, hours, staff.

**Important:** Flows G and H are fully parallel to each other and can be done in any order after Flow A.

---

## 7. Implementation Roadmap

---

### Phase 1 — Core Onboarding Framework

**Purpose:** Build the scaffolding everything else plugs into. No user-visible onboarding features yet.

**Complexity:** Medium  
**Estimated effort:** 2–3 days

**Database changes:**
- New migration: `onboarding_flows`, `onboarding_steps`, `onboarding_progress`, `onboarding_step_completions`
- `ALTER TABLE locations ADD COLUMN setup_complete`
- `ALTER TABLE staff ADD COLUMN welcome_complete`
- Seed data for 8 flows + their steps

**API changes:**
- `GET /api/onboarding/progress` — returns all flows with status for current store
- `PATCH /api/onboarding/progress/:flowKey` — updates flow status
- `POST /api/onboarding/progress/:flowKey/steps/:stepKey/complete` — marks a step done
- `POST /api/onboarding/progress/:flowKey/skip` — marks a flow skipped

**New files:**
- `artifacts/api-server/src/routes/onboarding.ts` — route handlers
- `artifacts/api-server/migrations/0116_onboarding_framework.sql`

**UI components needed:**
- `artifacts/booking/src/components/onboarding/FlowWrapper.tsx` — shared step layout (progress bar, back/next, skip)
- `artifacts/booking/src/components/onboarding/OnboardingHub.tsx` — the checklist dashboard
- `artifacts/booking/src/hooks/use-onboarding-progress.ts` — TanStack Query hook
- `artifacts/booking/src/pages/OnboardingHub.tsx` — page at `/onboarding/hub`
- Route added to `App.tsx`

**Potential risks:**
- `onboarding_submissions` table already exists; need to check if it conflicts with new schema
- `setup_complete` on `locations` needs to not break existing `AccountStatusGate` logic

---

### Phase 2 — Owner / Business Setup Flow (Replace Existing)

**Purpose:** Replace the existing 5-step `/onboarding` wizard with a Flow A implementation that writes to the new progress tables.

**Complexity:** Low (mostly refactor)  
**Estimated effort:** 1–2 days

**Files affected:**
- `artifacts/booking/src/pages/Onboarding.tsx` — refactor to use `FlowWrapper`, add logo/branding step, write completion to `onboarding_progress`
- `artifacts/booking/src/components/onboarding/flows/BusinessSetupFlow.tsx` — extracted flow component
- `artifacts/api-server/src/routes/onboarding.ts` — Flow A endpoints

**Database changes:** None (uses existing `locations`, `business_hours`, `store_settings`; adds completion row to `onboarding_progress`)

**API changes:**
- Existing `/api/settings/store` and `/api/business-hours` endpoints are reused
- Step completion calls the new `POST /api/onboarding/progress/business_setup/steps/:step/complete`

**UI components needed:**
- Branding upload step (logo + color picker) within the flow
- Completion screen that redirects to Onboarding Hub

**Potential risks:**
- Existing users who already completed the old `/onboarding` flow — need a migration that marks `business_setup` as complete for stores with existing `locations.name` populated

---

### Phase 3 — Team Members Onboarding Flow

**Purpose:** Build Flow B as a standalone guided wizard.

**Complexity:** Medium  
**Estimated effort:** 3–4 days

**Files affected:**
- New: `artifacts/booking/src/components/onboarding/flows/TeamSetupFlow.tsx`
- Refactor: reuse `AddTeamMemberWizard.tsx` logic (currently in `pages/payouts/`)
- `artifacts/booking/src/pages/Staff*.tsx` — no changes, flow reuses existing APIs

**Database changes:** None (uses `staff`, `staff_availability`, `staff_services`, `roles`)

**API changes:** Existing staff APIs are fully sufficient. Add step completion hooks.

**UI components needed:**
- Role creation step (or display existing roles with option to add)
- Staff invite step that triggers email via Mailgun
- "Add another staff member / I'm done" branching step

**Potential risks:**
- Email invite system needs to be confirmed working (Mailgun keys required on VPS)
- Solo-operator stores should be able to skip this flow entirely without friction

---

### Phase 4 — Services Menu Onboarding Flow

**Purpose:** Build Flow D as a guided catalog builder.

**Complexity:** Medium  
**Estimated effort:** 2–3 days

**Files affected:**
- New: `artifacts/booking/src/components/onboarding/flows/ServiceMenuFlow.tsx`
- `artifacts/booking/src/pages/Services.tsx` — no changes; flow reuses existing APIs

**Database changes:** None (uses `service_categories`, `services`, `service_options`, `staff_services`)

**API changes:** Existing service APIs are sufficient. Add step completion hooks.

**UI components needed:**
- Pre-filled "quick start" service templates (Manicure, Pedicure, Gel, Acrylics, etc.) that owners can one-click import
- Step that links to "assign staff" (bridges to Team flow if staff exist)

**Potential risks:**
- Quick-start templates need a small seed dataset; careful not to pollute production stores
- Staff assignment step silently no-ops if no staff exist yet — show a "add staff later" path

---

### Phase 5 — Commission & Payroll Onboarding Flow

**Purpose:** Build Flow C as a compensation model wizard.

**Complexity:** High  
**Estimated effort:** 4–5 days

**Files affected:**
- New: `artifacts/booking/src/components/onboarding/flows/CommissionSetupFlow.tsx`
- `artifacts/booking/src/pages/PayrollSettings.tsx` — no changes; flow reuses existing APIs

**Database changes:** None (uses `commission_structures`, `payroll_deductions`)

**API changes:**
- May need a `POST /api/onboarding/commission-structures/bulk` to allow setting up multiple structures in one wizard submission

**UI components needed:**
- "Which model best describes your salon?" card picker (hourly / commission % / flat rate / booth rental)
- Per-service vs global commission toggle
- Tips distribution selector

**Potential risks:**
- This is the most business-logic-heavy flow; incorrect commission setup causes payroll errors
- Should include a preview/summary step before committing
- Some stores may have a mixed model (some staff hourly, some commission) — the flow needs to support per-staff overrides

---

### Phase 6 — POS & Payments Onboarding Flow

**Purpose:** Build Flow E chaining Stripe → Tax → Tips → Terminal → Receipt.

**Complexity:** Medium  
**Estimated effort:** 2–3 days

**Files affected:**
- New: `artifacts/booking/src/components/onboarding/flows/POSSetupFlow.tsx`
- `artifacts/booking/src/pages/manage/PaymentSettings.tsx` — no changes; Stripe Connect OAuth reused
- `artifacts/booking/src/pages/POSSettings.tsx` — no changes; tax/tip settings reused

**Database changes:** None

**API changes:** All existing payment/POS APIs are sufficient.

**UI components needed:**
- Stripe Connect embed step (currently a standalone page; needs to be flow-embeddable)
- "Skip terminal for now" path for cash-only operators

**Potential risks:**
- Stripe Connect OAuth involves an external redirect; the flow must handle the return URL and resume at the correct step
- Terminal pairing requires physical hardware; must be skippable without marking flow incomplete

---

### Phase 7 — Marketing & AI Onboarding Flows

**Purpose:** Build Flow G (Marketing hub) and Flow H (AI Receptionist) as optional modular flows.

**Complexity:** Low–Medium (most UI already exists)  
**Estimated effort:** 3–4 days total

**Files affected:**
- New: `artifacts/booking/src/components/onboarding/flows/MarketingSetupFlow.tsx`
- New: `artifacts/booking/src/components/onboarding/flows/AIReceptionistSetupFlow.tsx`
- `artifacts/booking/src/pages/manage/AiReceptionistEnrollment.tsx` — refactor to be flow-embeddable
- Website Builder, GBP Setup components — no changes; flows deep-link into existing UIs

**Database changes:** None

**API changes:**
- `POST /api/onboarding/progress/marketing/steps/:step/complete`
- `POST /api/onboarding/progress/ai_receptionist/steps/:step/complete`

**UI components needed:**
- Marketing hub step: cards for Website Builder, GBP, Reminders, Reviews, Loyalty, Campaigns — each shows completion status and deep-links to its existing UI
- AI Receptionist flow: thin wrapper around `AiReceptionistEnrollment.tsx` with step tracking

**Potential risks:**
- AI Receptionist requires Twilio phone provisioning (manual today) — flow should clearly set expectation and provide a "contact support to activate" path until self-serve provisioning is built
- GBP OAuth involves an external redirect; same resume-after-redirect pattern as Stripe needed

---

## Summary: File Impact Matrix

| Phase | New Files | Modified Files | Migration |
|---|---|---|---|
| 1 — Framework | `routes/onboarding.ts`, `OnboardingHub.tsx`, `FlowWrapper.tsx`, `use-onboarding-progress.ts` | `App.tsx`, `Sidebar.tsx` | `0116_onboarding_framework.sql` |
| 2 — Business Setup | `flows/BusinessSetupFlow.tsx` | `Onboarding.tsx` | None (uses existing tables) |
| 3 — Team Members | `flows/TeamSetupFlow.tsx` | Minor refactor of `AddTeamMemberWizard.tsx` | None |
| 4 — Services | `flows/ServiceMenuFlow.tsx` | None | None (optional: service templates seed) |
| 5 — Commission | `flows/CommissionSetupFlow.tsx` | None | Optional: bulk commission endpoint |
| 6 — POS/Payments | `flows/POSSetupFlow.tsx` | `PaymentSettings.tsx` (embed mode) | None |
| 7 — Marketing/AI | `flows/MarketingSetupFlow.tsx`, `flows/AIReceptionistSetupFlow.tsx` | `AiReceptionistEnrollment.tsx` | None |

---

## Key Architectural Decisions

1. **Flow registration is data-driven, not code-driven.** The hub reads from `onboarding_flows` table. To add a new flow, insert a row and ship the flow component — zero hub code changes.

2. **Each flow is a React component with a standard interface:**
   ```tsx
   interface OnboardingFlowProps {
     onComplete: () => void;
     onSkip: () => void;
     initialStep?: string;
   }
   ```
   `FlowWrapper` handles progress bar, step tracking API calls, back/next navigation, and skip logic.

3. **Step completion is write-on-advance, not write-on-finish.** Each step POSTs to `/api/onboarding/progress/:flow/steps/:step/complete` before advancing. This means closing the browser mid-flow resumes at the exact right step.

4. **Existing settings pages are not replaced.** Onboarding flows are thin wrappers that reuse existing form components and API endpoints. The settings pages remain accessible after onboarding for ongoing management.

5. **The Onboarding Hub is always accessible**, not just during initial setup. Owners can revisit any flow from `/onboarding/hub` at any time. This doubles as a "settings tour" for experienced users exploring new features.

---

*Document version: 1.0 — July 19, 2026*  
*Ready for review. No code changes have been made.*
