# Contractor Payouts & Check Printing
**Certxa / SalonOS — Developer & Operator Reference**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Stripe Connect Setup](#3-stripe-connect-setup)
4. [Contractor Management](#4-contractor-management)
5. [Deduction Rules](#5-deduction-rules)
6. [Running Payouts](#6-running-payouts)
7. [Payout Methods: ACH, Instant & Check](#7-payout-methods-ach-instant--check)
8. [Earnings Ledger](#8-earnings-ledger)
9. [Check Register](#9-check-register)
10. [Tax Documents (W9 & 1099)](#10-tax-documents-w9--1099)
11. [Reports](#11-reports)
12. [Print Checks](#12-print-checks)
13. [Audit Log](#13-audit-log)
14. [API Reference](#14-api-reference)
15. [Frontend Routes](#15-frontend-routes)
16. [Environment & Configuration](#16-environment--configuration)
17. [Security Notes](#17-security-notes)

---

## 1. System Overview

The Contractor Payouts module is a full-cycle independent contractor compensation system built into SalonOS. It handles the entire lifecycle from onboarding a booth-renter or 1099 contractor, calculating their earnings from the appointment system, applying deductions, disbursing funds via Stripe Connect (ACH or instant transfer) or paper check, and generating audit-ready tax documentation.

### Key concepts

| Concept | Description |
|---|---|
| **Contractor** | An independent stylist, esthetician, or technician renting space or working on commission. Separate from employee `staff` records. |
| **Payout Run** | A batch calculation covering a date range (e.g., May 1–15). Starts as `draft`, advances to `completed` on approval. |
| **Payout Run Item** | One row per contractor per run — stores their gross earnings, deductions, net amount, and chosen payout method. |
| **Deduction Rule** | A named flat-fee or percentage deduction applied automatically when a run is created (e.g., booth rent $125/period, processing fee 2.9%). |
| **Payout Check** | A physical check record created when a contractor's payout method is `check`. Tracks check number, print status, cleared status, and void. |
| **Ledger** | An append-only view built in real-time from payout run items — shows every earning, deduction, and disbursement with running balance per contractor. |
| **Stripe Connect** | Used for ACH and instant payouts. Each contractor has their own connected Express account. Funds transfer from the platform's Stripe account to the contractor's bank via `stripe.transfers.create`. |

### Navigation path

**Staff & Payroll → Contractor Payouts** (`/payouts`)

The section has seven tabs:

```
Overview → Contractors → Ledger → Run Payouts → Check Register → Tax Docs → Reports
```

---

## 2. Database Schema

All tables are PostgreSQL, managed by Drizzle ORM, and scoped to a `storeId` (location).

### `contractors`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `storeId` | integer | FK → `locations.id` |
| `staffId` | integer | Optional FK → `staff.id` (links to appointment/timeclock data) |
| `firstName`, `lastName` | text | Legal name for checks and W9 |
| `email`, `phone` | text | |
| `commissionRate` | numeric | Percentage of service revenue (e.g., `60` = 60%) |
| `productCommissionRate` | numeric | Percentage of add-on/product revenue |
| `payoutMethod` | text | `ach` \| `instant` \| `check` (default: `ach`) |
| `taxClassification` | text | `individual` \| `sole_prop` \| `llc` \| `corp` |
| `stripeAccountId` | text | Stripe Connect Express account ID (`acct_...`) |
| `onboardingStatus` | text | `not_started` \| `in_progress` \| `complete` |
| `bankVerified` | boolean | `payouts_enabled` from Stripe account sync |
| `isActive` | boolean | Soft-delete flag |
| `notes` | text | Internal notes |
| `createdAt`, `updatedAt` | timestamp | |

### `contractorBankAccounts`

Stores manual bank details for contractors using check payouts (not used for Stripe Connect).

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `contractorId` | integer | FK → `contractors.id` |
| `bankName`, `accountType` | text | |
| `routingNumber` | text | Stored as plaintext — encrypt in production |
| `accountNumberLast4` | text | Last 4 digits only |
| `isPrimary` | boolean | |

### `payoutDeductionRules`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `storeId` | integer | |
| `contractorId` | integer | `null` = applies to all contractors; set = specific contractor only |
| `name` | text | Display name (e.g., "Booth Rent", "Processing Fee") |
| `type` | text | `flat` \| `percentage` |
| `amount` | numeric | Dollar amount (flat) or percent (e.g., `2.9` for 2.9%) |
| `appliesTo` | text | `all` \| `specific` |
| `isActive` | boolean | |

### `payoutRuns`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `storeId` | integer | |
| `periodStart`, `periodEnd` | text | Date strings `YYYY-MM-DD` |
| `status` | text | `draft` → `completed` \| `cancelled` |
| `totalGross`, `totalDeductions`, `totalNet` | numeric | Totals across all items |
| `contractorCount` | integer | |
| `notes` | text | |
| `createdByUserId` | integer | |
| `completedAt` | timestamp | Set on approval |
| `createdAt`, `updatedAt` | timestamp | |

### `payoutRunItems`

One row per contractor per run.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `payoutRunId` | integer | FK → `payoutRuns.id` |
| `contractorId` | integer | |
| `contractorName` | text | Snapshot at run creation |
| `appointmentCount` | integer | Completed appointments in period |
| `serviceRevenue`, `productRevenue` | numeric | Revenue breakdown |
| `tips` | numeric | Tips collected in period |
| `grossAmount` | numeric | `serviceRevenue × commissionRate + productRevenue × productRate + tips` |
| `deductions` | jsonb | Array of `{ name, amount, type }` objects |
| `totalDeductions` | numeric | Sum of deductions |
| `netAmount` | numeric | `grossAmount − totalDeductions` (floored at 0) |
| `payoutMethod` | text | `ach` \| `instant` \| `check` (copied from contractor at run time) |
| `status` | text | `pending` → `paid` \| `failed` |
| `checkNumber` | integer | Populated for check payouts |
| `stripeTransferId` | text | Populated for ACH/instant payouts |
| `paidAt` | timestamp | |

### `payoutChecks`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `storeId` | integer | |
| `contractorId` | integer | |
| `checkNumber` | integer | Sequential, auto-incremented per store (starts at 1001) |
| `amount` | numeric | |
| `payeeName` | text | Legal name at time of issuance |
| `memo` | text | Auto-filled: pay period range |
| `periodStart`, `periodEnd` | text | |
| `printStatus` | text | `queued` → `printed` |
| `voidStatus` | text | `active` → `voided` |
| `clearedStatus` | text | `outstanding` → `cleared` |
| `issuedAt` | timestamp | |
| `printedAt`, `voidedAt`, `clearedAt` | timestamp | |

### `payoutW9Records`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `contractorId` | integer | |
| `legalName` | text | As on W9 |
| `businessName` | text | DBA / company name |
| `taxClassification` | text | |
| `taxIdLast4` | text | Last 4 of SSN or EIN |
| `address`, `city`, `state`, `zip` | text | |
| `year` | integer | Tax year |
| `certifiedAt` | timestamp | Date contractor certified |

### `payoutAuditLogs`

Immutable log of every significant action.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `storeId` | integer | |
| `action` | text | e.g., `payout_run_created`, `run_approved`, `check_voided`, `onboarding_link_created` |
| `entityType` | text | `contractor` \| `payout_run` \| `check` |
| `entityId` | integer | |
| `userId` | integer | The admin/owner who performed the action |
| `metadata` | jsonb | Action-specific details |
| `createdAt` | timestamp | |

---

## 3. Stripe Connect Setup

Contractor payouts via ACH and instant transfer use **Stripe Connect Express accounts**. Each contractor is a separate connected account on your Stripe platform.

### Prerequisites

1. Your Stripe account must be approved for Connect. Enable it at **dashboard.stripe.com → Connect → Overview**.
2. In the Replit environment, connect Stripe via **Integrations → Stripe**. The app reads credentials through `getUncachableStripeClient()` — no manual `STRIPE_SECRET_KEY` env var is needed.
3. In production, set your Connect platform's `application_fee_amount` or `transfer_data` as needed for your business model.

### Onboarding flow (step by step)

```
Salon owner clicks "Set Up Bank" on a contractor record
        ↓
POST /api/contractor-payouts/contractors/:id/onboarding-link
        ↓
If no stripeAccountId yet:
  stripe.accounts.create({
    type: "express",
    capabilities: { transfers: { requested: true } }
  })
  → saves acct_... to contractors.stripeAccountId
        ↓
stripe.accountLinks.create({
  account: acct_...,
  type: "account_onboarding",
  refresh_url: /payouts/contractors/:id?onboarding=refresh,
  return_url:  /payouts/contractors/:id?onboarding=complete
})
        ↓
Contractor is redirected to Stripe-hosted onboarding
(enter bank routing/account, accept terms, provide ID)
        ↓
Contractor lands back at return_url
        ↓
POST /api/contractor-payouts/contractors/:id/sync-stripe
  stripe.accounts.retrieve(acct_...)
  → updates onboardingStatus: "complete" / "in_progress"
  → updates bankVerified: account.payouts_enabled (true/false)
```

### Onboarding statuses

| Status | Meaning |
|---|---|
| `not_started` | Contractor added, "Set Up Bank" not yet clicked |
| `in_progress` | Stripe account created, onboarding form not fully completed |
| `complete` | Stripe has verified the contractor and payouts are enabled |

### `bankVerified` flag

`bankVerified = true` means `account.payouts_enabled === true` on the Stripe account — the contractor has provided valid bank details and can receive transfers. When `false`, ACH/instant payouts for that contractor will fail at approval time.

### Transfer execution (on run approval)

```
POST /api/contractor-payouts/runs/:id/approve
        ↓
For each item where payoutMethod = "ach" or "instant":
  stripe.transfers.create({
    amount: Math.round(item.netAmount * 100),   // cents
    currency: "usd",
    destination: contractor.stripeAccountId,    // acct_...
    transfer_group: `payout_run_${run.id}`,
    metadata: {
      runId, contractorId, period, contractorName
    }
  })
  → saves transfer.id to payoutRunItems.stripeTransferId
  → marks item status = "paid"
        ↓
Run status → "completed"
```

> **Instant vs ACH**: Both use `stripe.transfers.create` to the same connected account. The difference in settlement speed (ACH = 1–2 business days, Instant = minutes) is determined by the contractor's Stripe account payout schedule settings, not by the API call itself. You can override this per payout via `destination_payment_method_data` on the Transfer if needed.

### Refresh URL behavior

If the contractor exits Stripe onboarding early, Stripe redirects to `refresh_url`. The frontend detects `?onboarding=refresh` in the URL and calls `sync-stripe` to update status, then prompts the contractor to restart onboarding by generating a new link.

---

## 4. Contractor Management

**Path:** `/payouts/contractors`

### Creating a contractor

A contractor record is independent of `staff` records, but can be linked via `staffId`. This link is what connects the appointment system's completed bookings to the contractor's earnings calculation.

Required fields: `firstName`, `lastName`, `commissionRate`

Optional but recommended: `staffId`, `email`, `payoutMethod`, `taxClassification`

**API:** `POST /api/contractor-payouts/contractors`

```json
{
  "storeId": 1,
  "firstName": "Jordan",
  "lastName": "Rivera",
  "email": "jordan@example.com",
  "commissionRate": 60,
  "productCommissionRate": 15,
  "payoutMethod": "ach",
  "taxClassification": "individual",
  "staffId": 12
}
```

### Commission rate calculation

At run creation, earnings per contractor are computed as:

```
serviceRevenue  = sum of (appointment.totalPaid − tip) for completed appts in period
productRevenue  = sum of add-on prices for those appointments
tips            = sum of appointment.tipAmount for those appointments

grossAmount = (serviceRevenue × commissionRate / 100)
            + (productRevenue × productCommissionRate / 100)
            + tips
```

If `appointment.totalPaid` is not set, the service's catalog price is used as a fallback.

### Contractor Detail page

`/payouts/contractors/:id` shows:
- Stripe Connect onboarding status and bank verified badge
- Recent payout history
- W9 records on file
- Edit form for rates, payout method, tax classification

---

## 5. Deduction Rules

**Path:** `/payouts/run` (configured before running) or via API

Deduction rules are applied automatically every time a new payout run is created.

### Rule types

| Type | Behavior |
|---|---|
| `flat` | Fixed dollar amount deducted per contractor per run |
| `percentage` | Percentage of the contractor's gross amount |

### Scope

| `appliesTo` | `contractorId` | Effect |
|---|---|---|
| `all` | `null` | Applied to every active contractor in the run |
| `specific` | set | Applied only to that contractor |

### Examples

| Name | Type | Amount | Applies To |
|---|---|---|---|
| Booth Rent | flat | 125.00 | all |
| Processing Fee | percentage | 2.9 | all |
| Assistant Fee | flat | 50.00 | specific contractor |

**API:** `POST /api/contractor-payouts/deduction-rules`

```json
{
  "storeId": 1,
  "name": "Booth Rent",
  "type": "flat",
  "amount": 125,
  "appliesTo": "all"
}
```

---

## 6. Running Payouts

**Path:** `/payouts/run`

### Step 1 — Create a draft run

Select a period (start and end date) and optionally limit to specific contractors. The server queries all completed appointments for linked staff members, calculates earnings, applies deduction rules, and saves everything as a `draft` payout run.

```
POST /api/contractor-payouts/runs
{
  "storeId": 1,
  "periodStart": "2026-05-01",
  "periodEnd":   "2026-05-15",
  "notes":       "Bi-weekly May 1–15"
}
```

The response includes the run object and all calculated items. No money moves yet.

### Step 2 — Review

The draft run shows each contractor's:
- Appointment count and service/product revenue
- Gross amount
- Each deduction itemized
- Net amount (what they'll be paid)
- Their payout method (ACH / Instant / Check)

Individual items can be overridden before approval: `PUT /api/contractor-payouts/runs/:id/items/:itemId`

### Step 3 — Approve

```
POST /api/contractor-payouts/runs/:id/approve
```

This is the point of no return — it triggers all disbursements:

- **ACH/Instant contractors**: A Stripe transfer is created to each contractor's connected account.
- **Check contractors**: A `payoutChecks` record is created with auto-incremented check number. The check is in `queued` print status.
- All items are marked `paid` with a `paidAt` timestamp.
- Run status changes to `completed`.
- An audit log entry is written.

### Cancelling a draft

```
POST /api/contractor-payouts/runs/:id/cancel
```

Only `draft` or `pending` runs can be cancelled. Completed runs cannot be reversed through the app (reversals require Stripe dashboard action for ACH/instant items, or check voiding for paper checks).

---

## 7. Payout Methods: ACH, Instant & Check

Set per contractor on their profile. Can be overridden per item before approving a run.

### ACH (`ach`)

- Requires Stripe Connect with `bankVerified = true`
- Settlement: 1–2 business days
- Stripe fee: standard transfer fee (varies by account)
- `stripeTransferId` saved to the run item

### Instant (`instant`)

- Requires Stripe Connect with instant payouts enabled on the contractor's connected account (depends on their debit card or bank eligibility)
- Settlement: within minutes
- Additional Stripe fee applies
- Same API call as ACH — settlement speed is determined by contractor's Stripe payout schedule

### Check (`check`)

- No Stripe required
- A `payoutChecks` row is created in `queued` status
- Check number is auto-assigned sequentially (starts at 1001 per store)
- The physical check must be printed via the **Print Checks** page
- Lifecycle: `queued` → `printed` → `outstanding` → `cleared` (or `voided`)

---

## 8. Earnings Ledger

**Path:** `/payouts/ledger`

The ledger is a read-only, append-only view that reconstructs every financial event from `payoutRunItems`. It is not a separate stored table — it is built on-the-fly from payout run data.

### Entry types

| Type | Source | Sign |
|---|---|---|
| `earning` | `payoutRunItems.grossAmount` | Positive |
| `deduction` | Each entry in `payoutRunItems.deductions` JSON array | Negative |
| `payout` | Items with `status = "paid"` and `paidAt` set | Negative |
| `adjustment` | Future: manual correction entries | Positive or negative |

### Running balance

Computed per contractor, oldest-to-newest. Each entry's running balance reflects that contractor's cumulative position up to that point.

### Filters

- **Type filter**: All Types / Earnings / Deductions / Adjustments / Payouts
- **Contractor dropdown**: shows only active contractors for the store
- **Search**: matches contractor name, description, category, or entry ID

### API

```
GET /api/contractor-payouts/ledger?storeId=X&contractorId=Y&type=earning&limit=200&offset=0
```

Response:
```json
{
  "entries": [
    {
      "id": "E-42",
      "date": "2026-05-15",
      "type": "earning",
      "category": "Commission Earnings",
      "contractorId": 3,
      "contractorName": "Jordan Rivera",
      "description": "Period 2026-05-01 – 2026-05-15 · 14 appts",
      "amount": 840.00,
      "runningBalance": 840.00
    }
  ],
  "total": 47,
  "summary": {
    "totalEarnings": 14890.00,
    "totalDeductions": 1996.00,
    "totalPayouts": 12000.00,
    "netBalance": 894.00
  },
  "contractors": [
    { "id": 3, "name": "Jordan Rivera" }
  ]
}
```

**Entry ID prefixes:** `E-{itemId}` (earning), `D-{itemId}-{DeductionName}` (deduction), `P-{itemId}` (payout)

---

## 9. Check Register

**Path:** `/payouts/checks`

Lists all contractor payout checks for the store with full status tracking.

### Check lifecycle

```
[Payout run approved]
       ↓
   printStatus: "queued"
  voidStatus:   "active"
  clearedStatus: "outstanding"
       ↓
  [Printed]
  printStatus: "printed"
  printedAt: timestamp
       ↓
  [Bank clears the check]
  clearedStatus: "cleared"
  clearedAt: timestamp

  [At any point while active]
       ↓
  voidStatus: "voided"
  voidedAt: timestamp
```

### API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/contractor-payouts/checks?storeId=X` | List all checks |
| `POST` | `/api/contractor-payouts/checks/:id/mark-printed` | Set `printStatus = "printed"` |
| `POST` | `/api/contractor-payouts/checks/:id/mark-cleared` | Set `clearedStatus = "cleared"` |
| `POST` | `/api/contractor-payouts/checks/:id/void` | Set `voidStatus = "voided"` (irreversible, only if not already voided) |

### Check numbering

Check numbers auto-increment per store starting at **1001**. The system reads the current highest check number from `payoutChecks` and adds 1. This ensures no two checks for the same store share a number.

When printing physical checks, the **starting check number** in Print Settings lets you align the software's sequence with your physical check stock.

---

## 10. Tax Documents (W9 & 1099)

**Path:** `/payouts/tax-docs`

### W9 records

W9 information is collected and stored per contractor per tax year. Required fields: `legalName`, `taxClassification`, `year`.

A contractor may have multiple W9 records across years. The most recent for a given year is considered current.

```
POST /api/contractor-payouts/w9
{
  "contractorId": 3,
  "legalName": "Jordan A. Rivera",
  "taxClassification": "individual",
  "taxIdLast4": "1234",
  "address": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zip": "78701",
  "year": 2026
}
```

### 1099-NEC threshold

Any contractor paid $600 or more in a calendar year requires a 1099-NEC filing. The Reports page provides a YTD breakdown per contractor to support this.

> Note: Actual 1099 generation and e-filing is not yet automated. The data is available in the Reports endpoint to support manual or third-party filing.

---

## 11. Reports

**Path:** `/payouts/reports`

Aggregated financial summary for a calendar year.

```
GET /api/contractor-payouts/reports?storeId=X&year=2026
```

Response:
```json
{
  "year": 2026,
  "totals": {
    "totalGross": "48200.00",
    "totalDeductions": "6340.00",
    "totalNet": "41860.00",
    "runCount": 24
  },
  "byContractor": [
    {
      "contractorId": 3,
      "contractorName": "Jordan Rivera",
      "totalNet": "12480.00",
      "totalGross": "14820.00",
      "totalDeductions": "2340.00",
      "totalTips": "1640.00",
      "runCount": 24
    }
  ],
  "runs": [
    {
      "id": 18,
      "periodStart": "2026-05-01",
      "periodEnd": "2026-05-15",
      "totalNet": "4180.00",
      "totalGross": "4820.00",
      "contractorCount": 5,
      "completedAt": "2026-05-16T14:22:00Z"
    }
  ]
}
```

The `byContractor` array can be used directly to determine 1099-NEC filing requirements (contractors with `totalNet ≥ $600`).

---

## 12. Print Checks

**Path:** `/print-checks` (Staff & Payroll section)

A dedicated print center for both payroll (commission) and contractor payout checks. Produces professional business checks on standard 8.5" × 11" paper stock.

### Check anatomy

Each printed page consists of:

```
┌─────────────────────────────────────────┐
│   BUSINESS NAME              Check #    │
│   Address                    Date       │
│                                         │
│   Pay To The Order Of:                  │
│   ══════════════════════════  $X,XXX.XX │
│                                         │
│   One Thousand Two Hundred… DOLLARS     │
│   ─────────────────────────────────     │
│   Memo: Pay period May 1–15             │ VOID AFTER 90 DAYS
│                                         │
│   Authorized Signature  Employee Sig    │
│                                         │
│   ⑆000000000⑆ 0000000000⑆⑇ 001234     │ ← MICR line
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← Detach
│   EMPLOYEE COPY — Earnings Statement    │
│   Payee • Period • Business Name        │
│   [earnings breakdown] │ [summary]      │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← Detach (2-stub mode)
│   EMPLOYER COPY — Earnings Statement    │
│   (identical to employee copy)          │
└─────────────────────────────────────────┘
```

### Check face features

| Feature | Detail |
|---|---|
| **Business letterhead** | Store name, address, phone pulled from store profile |
| **Sequential check number** | Configurable starting number aligned to physical check stock |
| **Amount box** | Dollar amount in bordered box (e.g., `$1,234.56`) |
| **Amount in words** | Full written-out English (`One Thousand Two Hundred Thirty-four and 56/100 DOLLARS`) |
| **MICR line** | Routing ⑆ Account ⑆⑇ Check# in Courier monospace — matches E-13B MICR format |
| **Signature lines** | Authorized Signature + Employee/Contractor Signature |
| **Memo line** | Auto-populated with pay period; editable for contractor checks |
| **Security features** | Micro-text border ("AUTHORIZED DOCUMENT • VOID IF REPRODUCED"), "Void after 90 days" |

### Print Settings

Settings are saved to `localStorage` and persist across sessions. Accessible via the **Print Settings** button.

| Setting | Description |
|---|---|
| **Starting Check #** | First check number for the current print batch. Increment between batches to match your physical stock. |
| **Routing Number** | Your business checking account routing number (9 digits). Appears in the MICR line. |
| **Account Number** | Your business checking account number. Masked in the UI; toggle to reveal. Appears in the MICR line. |
| **Stubs per Check** | `1` = employee copy only. `2` = employee + employer copies (recommended for records). |

> The routing and account numbers in the MICR line are for display on preprinted check stock that already has your account encoded magnetically. If using blank check paper, ensure your MICR printer software encodes these values in actual MICR ink.

### Payroll Checks tab

Prints commission-based payroll checks from finalized payroll runs.

1. Select a finalized payroll run from the left panel
2. Filter to a specific staff member or print all
3. Preview the check face with full earnings breakdown in the stub
4. Click **Print** — browser print dialog opens, everything outside the check area is hidden
5. Earnings stub shows: commission rate × revenue, add-ons, tips, hours worked, and NET PAY

### Contractor Checks tab

Prints contractor payout checks created by the payout system.

1. The table shows all checks with their status (Queued / Printed / Outstanding / Cleared / Voided)
2. Click **Print Now** on any queued check to open the full print preview modal
3. Preview shows check face + stub
4. Click **Print Check** — browser print dialog opens
5. Click **Mark as Printed** to update the check's status in the database
6. From the action menu (⋯): Mark as Printed, Mark Cleared, Void Check

### Print CSS

The page injects `@media print` rules that:
- Hide everything except `#check-print-area`
- Set `@page { size: 8.5in 11in; margin: 0.25in 0.5in; }`
- Apply `page-break-after: always` between check sheets when printing multiple

---

## 13. Audit Log

Every significant action writes an immutable row to `payoutAuditLogs`. This log cannot be modified through the app.

### Logged actions

| Action | Trigger |
|---|---|
| `payout_run_created` | New draft run created |
| `run_approved` | Run moved to completed, transfers initiated |
| `run_cancelled` | Draft run cancelled |
| `onboarding_link_created` | Stripe onboarding link generated for a contractor |
| `check_voided` | Check marked as voided |
| `contractor_created` | New contractor added |

### API

```
GET /api/contractor-payouts/audit-logs?storeId=X&limit=50
```

Returns up to 200 entries, ordered newest first.

---

## 14. API Reference

All endpoints require an authenticated session (`isAuthenticated` middleware). All list endpoints require `?storeId=X` as a query parameter.

Base path: `/api/contractor-payouts`

### Contractors

| Method | Path | Description |
|---|---|---|
| `GET` | `/contractors?storeId=X` | List all contractors for store |
| `GET` | `/contractors/:id` | Single contractor with bank accounts, W9s, recent payouts |
| `POST` | `/contractors` | Create contractor |
| `PUT` | `/contractors/:id` | Update contractor |
| `DELETE` | `/contractors/:id` | Soft-delete (sets `isActive = false`) |
| `POST` | `/contractors/:id/onboarding-link` | Generate Stripe Connect onboarding URL |
| `POST` | `/contractors/:id/sync-stripe` | Refresh Stripe account status |
| `GET` | `/contractors/:id/bank-accounts` | List manual bank accounts |
| `POST` | `/contractors/:id/bank-accounts` | Add bank account |

### Deduction Rules

| Method | Path | Description |
|---|---|---|
| `GET` | `/deduction-rules?storeId=X` | List rules |
| `POST` | `/deduction-rules` | Create rule |
| `PUT` | `/deduction-rules/:id` | Update rule |
| `DELETE` | `/deduction-rules/:id` | Delete rule |

### Payout Runs

| Method | Path | Description |
|---|---|---|
| `GET` | `/runs?storeId=X` | List runs (with items) |
| `GET` | `/runs/:id` | Single run with items and contractor payout methods |
| `POST` | `/runs` | Create draft run (calculates earnings) |
| `POST` | `/runs/:id/approve` | Approve run, trigger Stripe transfers or create checks |
| `POST` | `/runs/:id/cancel` | Cancel draft/pending run |
| `PUT` | `/runs/:id/items/:itemId` | Override a single item before approval |

### Checks

| Method | Path | Description |
|---|---|---|
| `GET` | `/checks?storeId=X` | List all checks |
| `POST` | `/checks/:id/mark-printed` | Mark printed |
| `POST` | `/checks/:id/mark-cleared` | Mark cleared |
| `POST` | `/checks/:id/void` | Void check |

### W9 / Tax

| Method | Path | Description |
|---|---|---|
| `GET` | `/w9?storeId=X` | List W9 records |
| `POST` | `/w9` | Save W9 record |

### Overview, Ledger, Reports, Audit

| Method | Path | Description |
|---|---|---|
| `GET` | `/overview?storeId=X` | Dashboard KPIs + 6-month trend |
| `GET` | `/ledger?storeId=X&contractorId=Y&type=Z&limit=200&offset=0` | Append-only ledger |
| `GET` | `/reports?storeId=X&year=2026` | Annual report by contractor |
| `GET` | `/audit-logs?storeId=X&limit=50` | Audit trail |

---

## 15. Frontend Routes

All payout routes are nested inside `<PayoutsLayout>` which renders the shared seven-tab navigation.

| Path | Component | Description |
|---|---|---|
| `/payouts` | `PayoutsOverview` | Dashboard: KPI cards, trend chart, recent runs, quick actions |
| `/payouts/contractors` | `PayoutsContractors` | Contractor roster with Stripe Connect status |
| `/payouts/contractors/:id` | `ContractorDetail` | Individual contractor detail with onboarding, W9, payout history |
| `/payouts/ledger` | `PayoutsLedger` | Append-only earnings ledger |
| `/payouts/run` | `PayoutsRun` | Create, review, and approve payout runs |
| `/payouts/checks` | `PayoutsChecks` | Check register (list, mark-printed, void, clear) |
| `/payouts/tax-docs` | `PayoutsTaxDocs` | W9 records by contractor and year |
| `/payouts/reports` | `PayoutsReports` | Annual summary + contractor breakdown |
| `/print-checks` | `PrintChecks` | Full check printing center (payroll + contractor) |
| `/staff` | `StaffPayrollLanding` | Entry point — includes "Contractor Payouts" module card |

---

## 16. Environment & Configuration

### Stripe (via Replit Integrations)

The app uses `getUncachableStripeClient()` from `artifacts/api-server/src/lib/stripeClient.ts` — this reads the Stripe secret key from the Replit-managed connector rather than a raw environment variable.

To configure:
1. Open **Integrations** in the Replit sidebar
2. Find **Stripe** and connect your account
3. The connector injects the key securely at runtime

In development, if Stripe is not connected, `getStripe()` in `contractorPayouts.ts` catches the error and returns `null`. Any endpoint requiring Stripe will respond with `503 Stripe not configured`.

### Database

PostgreSQL via the `DATABASE_URL` environment variable. Managed by Drizzle ORM with automatic migrations.

### Session

`SESSION_SECRET` environment variable required for express-session. Set via Replit Secrets.

### Print Settings

Stored in the user's browser `localStorage` under the key `certxa-print-check-settings`. No server-side persistence — each browser/device maintains its own print configuration.

---

## 17. Security Notes

### Authentication
All API endpoints are protected by `isAuthenticated` middleware (session-based). Unauthenticated requests receive `401`.

### Store scoping
Every query is scoped to a `storeId`. The store ownership is verified by confirming `locations.userId === session.userId`. A user cannot read or write data for a store they do not own.

### Stripe account isolation
Each contractor's Stripe account (`acct_...`) belongs only to that contractor. Transfers go directly from the platform to the contractor's bank account — the platform never holds contractor funds beyond the Stripe transfer lifecycle.

### Check security
Paper check fraud prevention is the operator's responsibility. The MICR line in the app's check face is for display/reference. When using blank check stock:
- Use MICR-compatible printer ink/toner
- Store blank check stock in a locked location
- Void and shred misprinted checks
- Reconcile the check register against your bank statement regularly

### Sensitive data
- Contractor SSN/EIN: only the last 4 digits are stored in `payoutW9Records.taxIdLast4`. Full tax IDs are never stored.
- Bank routing/account numbers in `contractorBankAccounts` are stored as plaintext. For production, encrypt these columns at rest using a KMS-backed field encryption library.
- The Print Settings routing/account numbers live in `localStorage` only — never sent to the server.

### Audit trail
The `payoutAuditLogs` table is append-only by convention (the app never issues `UPDATE` or `DELETE` on it). For compliance-critical deployments, enforce this at the database level with a row-level security policy or a dedicated append-only role.
