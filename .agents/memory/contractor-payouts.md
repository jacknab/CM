---
name: Contractor Payouts System
description: Architecture and key decisions for the Contractor Payouts & Direct Deposit feature built into Certxa.
---

# Contractor Payouts System

## What was built
Full enterprise-grade contractor payout system at `/payouts/*`. Multi-store SaaS, scoped by `storeId` (locations.id).

## DB Tables (in shared/schema/payouts.ts, re-exported from shared/schema.ts)
- `contractors` — per-store contractor records, optional `staffId` link to existing staff
- `contractor_bank_accounts` — bank details per contractor
- `payout_deduction_rules` — store-level deduction configs (booth rent, fees, etc.)
- `payout_runs` — payout batch per period
- `payout_run_items` — per-contractor line item in a run
- `payout_checks` — check printing queue
- `payout_w9_records` — W9 tax records
- `payout_audit_logs` — full audit trail

**Why separate from payrollRuns:** payrollRuns already existed for the old staff commission system. Contractor payout tables are purposely separate to support different workflows (Stripe Connect, checks, deductions, W9s).

## CRITICAL: Schema must be registered in drizzle.config.ts
`lib/db/drizzle.config.ts` must list `payouts.ts` in the schema array — if omitted, none of the 9 payout tables exist in the DB. This caused "buttons doing nothing" (silent failures from missing tables). Always verify when adding new schema files.

## API Route
`artifacts/api-server/src/routes/contractorPayouts.ts` — mounted at `/api/contractor-payouts`.
Registered in `registerRoutes()` in `artifacts/api-server/src/routes.ts` via dynamic import before the website builder router.

## Commission Calculation
`POST /api/contractor-payouts/runs` calculates earnings by:
1. Joining `contractors` → `staff` via `staffId`
2. Querying `appointments` (status=completed, in period) for those staffIds
3. `serviceRevenue × (commissionRate/100) + productRevenue × (productCommissionRate/100) + tips`
4. Applying `payout_deduction_rules` (fixed or %)
5. Creating `payout_runs` + `payout_run_items` records

## Stripe Connect
- `POST /contractors/:id/onboarding-link` — creates Stripe Express account + onboarding link
- `POST /runs/:id/approve` — creates Stripe transfers for ACH/instant, creates check records for check method
- Gracefully handles missing `STRIPE_SECRET_KEY` (marks items paid manually)

## Frontend Pages (artifacts/booking/src/pages/payouts/)
- `PayoutsLayout.tsx` — shared layout with 8-tab sub-nav (uses react-router Outlet)
- `PayoutsOverview.tsx` — dashboard with stat cards, bar chart, recent runs, quick actions
- `PayoutsContractors.tsx` — contractor grid with onboarding status, commission rates, bank info
- `ContractorDetail.tsx` — contractor detail with tabs: Details, Bank Accounts, Payout History, Tax Records
- `PayoutsRun.tsx` — 3-step: list runs → create run (period + contractor selection) → review & approve
- `PayoutsDeductions.tsx` — manage recurring deduction rules (fixed $ or % of gross), enable/disable per rule
- `PayoutsChecks.tsx` — check register with print/void/clear actions
- `PayoutsTaxDocs.tsx` — W9 recording + 1099 prep eligibility list
- `PayoutsReports.tsx` — annual earnings by contractor, CSV export

## Router/App Wiring
- `App.tsx`: `<Route element={<PayoutsLayout />}>` wraps all `/payouts/*` sub-routes (~line 318)
- `Sidebar.tsx`: `/payouts` added to "Staff & Payroll" matches array
- DB tables pushed via `pnpm --filter @workspace/db run push`

## Key Pattern: DB push workaround
`pnpm --filter @workspace/db run push` requires interactive input when tables might be renames.
Use `executeSql()` via code_execution to push schema directly for new tables.
