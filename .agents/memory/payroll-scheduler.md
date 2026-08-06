---
name: Payroll Scheduler
description: Auto pay period creation + auto-approve scheduler wired into the contractor payouts system.
---

# Payroll Scheduler

## Rule
The payroll scheduler (`artifacts/api-server/src/services/payroll-scheduler.ts`) runs hourly, creates draft `payout_runs` when a pay period closes, and auto-approves them after the owner-configured review window.

**Why:** Owners wanted hands-free payroll; the scheduler abstracts the recurring "create run / approve" workflow that was previously 100% manual.

## How to apply
- Scheduler registered in `artifacts/api-server/src/index.ts` via `startPayrollScheduler()`.
- Config stored in `store_settings.preferences.payrollSchedule` (JSON): `{ enabled, frequency, anchorDate, autoApproveDelayHours }`.
- Routes: `GET/PUT /api/contractor-payouts/payroll-schedule` in `contractorPayouts.ts`.
- The `createPayoutRunForPeriod()` and `approvePayoutRunById()` helpers are exported from `contractorPayouts.ts` — route handlers now call these thin wrappers.
- `getLastClosedPeriod()` is exported from the scheduler service; it's also mirrored client-side in `PayoutsSchedule.tsx` for the upcoming-periods preview.
- `payout_runs` has two new columns: `auto_generated BOOLEAN NOT NULL DEFAULT false` and `auto_approve_after TIMESTAMPTZ`. The scheduler's `applyMigrations()` function does idempotent `ALTER TABLE IF NOT EXISTS` on startup as a safety net.

## Payout tables: missing from fresh DB
All payout/contractor tables (`payout_runs`, `contractors`, `payout_run_items`, `payout_checks`, `payout_deduction_rules`, `contractor_bank_accounts`, `commission_structures`, `payout_w9_records`, `payout_audit_logs`, `payout_adjustments`) were NOT present in the Replit dev DB and had to be created via raw `psql`. `pnpm --filter @workspace/db run push` is interactive and cannot be used in automation — always apply missing payout tables manually via SQL.

## Period calculation frequencies
- `monthly` — 1st to last day of previous calendar month
- `semimonthly` — 1st–15th and 16th–EOM, using `today.getDate() >= 16` to determine which half just closed
- `weekly` / `biweekly` — requires `anchorDate`; period index computed as `floor(diffDays / periodLen)`
