# Staff · Commissions · Paychecks — unified rebuild

**Goal:** replace three uncoordinated subsystems (staff → commission → payroll, built separately)
with one clean data spine, modelled on GlossGenius, with **printed paychecks** as the payout
mechanism — not payroll-as-a-service (no tax filing, no direct deposit, no bank onboarding).

Status: **design — no code yet.** Decisions in §6 must be settled first.

---

## 1. The one data spine

```
staff  ──►  compensation (service %, product %)
              │
              ▼
   earnings, per completed appointment / product sale  (snapshotted for reproducibility)
              │
              ▼
   payroll run  ──  AUTO-OPENED when a period closes (schedule = frequency + first pay date +
              │      period-end offset). Owner never "creates" one — they review & approve it.
              ▼
   paycheck PDF  ──  one file, checks + vouchers, via the existing check-printing feature.
                     Staff with $0 net owed are EXCLUDED — no $0 check printed.
```

Everything reads from this spine. No parallel commission logic, no separate payouts subsystem.

---

## 2. Current state (the junk pile being replaced)

**Live DB audit (2026-09-10, store 2):**
- The **real** payment system is `payout_*` — `payout_runs` (15 weekly runs through Sep 2026),
  `payout_run_items` (43), `payout_checks` (16), `payout_audit_logs` (46), `payout_deduction_rules`
  (2), `payout_w9_records` (2). Plus `contractors` (5), `contractor_commissions` (5),
  `contractor_onboarding_tokens` (3), `contractor_bank_accounts` (0), `contractor_instant_transfers`
  (0), `payroll_print_batches` (2). Backed by `lib/stripeContractorAccounts.ts`,
  `routes/{contractorPayouts,stripeConnectWebhook}.ts`, `pages/payouts/*`.
- `payroll_runs` / `payroll_run_items` (Drizzle `schema.ts` + `shared/models/payroll.ts`) are
  **EMPTY** — the "PayrollHome" consolidation never shipped. → reshape these for the new Payroll.
- `commission_structures` (2 flat rows, barely used), `staff_commission_accruals` (0) → retire.
- `staff.commission_rate` is already the effective source of truth (60% for the 3 stylists,
  `product_commission_rate` 0). `staff.commission_structure_id` NULL for all.
- `appointments.tip_amount` — per-appointment, populated.
- Other staff tables: `staff_services`, `staff_availability`, `staff_settings`, `staff_pins`,
  `staff_work_photos`, `timeclock`.

**Booking-app pages** — overlapping implementations:
- Staff: `Staff*.tsx` (~15), `team/TeamMembers.tsx`, `team/TeamMemberDetail.tsx`,
  `TeamPermissions.tsx`, `payouts/AddTeamMemberWizard.tsx`
- Commissions: `CommissionsPage.tsx`, `CommissionsSetupWizard.tsx`, `CommissionReport.tsx`,
  `payouts/PayoutsCommissions.tsx`, `payouts/commissionComponents.tsx`
- Payroll: `Payroll.tsx`, `PayrollHome.tsx`, `PayrollSettings.tsx`, `StaffPayrollLanding.tsx`
- Stripe-Connect payouts: entire `pages/payouts/` (~16 files — `PayoutsLayout/Run/Checks/Contractors/
  Deductions/Ledger/Schedule/TaxDocs`, `BalanceDashboard`, `ContractorDetail`, …)
- Checks: `PrintChecks.tsx`, `PrintChecksCalibration.tsx`, `CheckLayoutEditor.tsx`,
  `lib/checkLayout.ts`, `lib/micrFont.ts`  ← **KEEP — this is the output engine**
- Time: `Timeclock.tsx`

`payroll_run_items` today is commission-only:
`{ payrollRunId, staffId, commissionRate, appointmentCount, serviceRevenue, addonRevenue,
totalRevenue, commissionAmount, status }` — no tips, no product, no hourly, no deductions.

---

## 3. Target data model

**Keep as-is:** `staff`, `staff_services`, `staff_availability`, `timeclock`, the check-printing stack.

**Commission = two fields already on `staff`:** `commissionRate` (service %) and
`productCommissionRate` (product %). Drop `commissionStructureId` and the "structures" concept
entirely. No hourly wage field — compensation is commission-only.

**New / reworked:**

| table | shape |
|---|---|
| `pay_schedules` *(new)* | `storeId` (unique), `frequency` (`weekly`\|`biweekly`\|`semimonthly`\|`monthly`), `firstPayDate`, `periodEndOffsetDays` (default 0 = period ends on payday; 7 = "week before"), `createdAt`. One per store. Periods auto-roll from here. |
| `payroll_runs` *(reshape the empty table)* | add `pay_date`, `pdf_url`, `pdf_generated_at`, `tips_total`, `deductions_total`, `net_total`, `approved_at`, `approved_by`, `checks_printed_count`; `status` = `draft`\|`approved`\|`void`. Keep `store_id, period_start, period_end, notes, created_by`. Auto-created (one per elapsed period per store); unique on `(store_id, period_start)`. |
| `payroll_run_items` *(reshape the empty table)* | add per staff per run: `service_commission`, `product_commission`, `tips`, `other_earnings`, `booth_rent`, `other_deductions`, `net_pay`, `check_number`. Keep `payroll_run_id, staff_id, staff_name, commission_rate, appointment_count, service_revenue, addon_revenue, total_revenue, commission_amount, status, notes`. |

**Earnings computation** (at run time, over the period's completed appointments + product sales):
- service commission = Σ(appointment `servicePrice` snapshot × staff service rate)
- product commission = Σ(product sale line total × staff product rate)
- tips = Σ(`appointments.tipAmount` on that staff's completed appointments in the period)
- The `appointments` table already snapshots `servicePrice` + `commissionRate` at first completion,
  so finalized runs stay reproducible.

---

## 4. Pages — "Team" nav group: **Staff · Commissions · Paychecks** (· Time tracking?)

### Staff
- **List:** Name · Email · Phone · Services (inline "Assign service"). Search. "Add Staff" button.
  "N Members" count.
- **Add Staff — 3-step wizard** (no Role & Permissions):
  1. **Details** — First/Last name, Email, Phone → creates the `staff` row. Primary button "Add Staff".
  2. **Services** — every catalog **category** with a checkbox, **all checked by default**;
     unchecking drops that category's services from `staff_services`.
  3. **Schedule** — recurring weekly availability, styled like the new Business Hours page
     (7 day rows, on/off + start–end), constrained to store business hours. Writes `staff_availability`
     via the existing `POST` set-all endpoint. (`StaffWorkingHours.tsx` logic is sound — reuse, restyle.)
- **Staff detail:** profile (name/photo/contact), compensation (service %, product %, [hourly]),
  services (category checkboxes), schedule. One page, sections — not a wizard.

### Commissions
- Two tabs: **Services** · **Products**.
- Each tab = one flat, inline-editable table: **Name · Rate %**. (Services tab writes
  `staff.commissionRate`; Products tab writes `staff.productCommissionRate`.)
- No type wizard, no per-member "Customize", no per-service or tiered rates.

### Payroll  *(QuickBooks-style, auto-driven — no manual "create pay period")*
- **Schedule card:** frequency + first pay date + "period ends N days before payday". Saved to
  `pay_schedules`. Set once.
- **Auto-open:** when a period's end date passes, the system creates a `draft` run for it
  (lazy-create when the Payroll page loads + a nightly safety job). The owner just sees
  *"Pay period Aug 28 – Sep 3 is ready to review."*
- **Review & approve:** a dense QuickBooks-style table — one row per staff: service comm, product
  comm, tips, +additions / −deductions, **net** — running grand total. Owner edits any add/deduct,
  then **Approve pay period**.
- **On approval:** the run locks (`status = approved`), check numbers are assigned, and **one PDF**
  of paychecks + vouchers is generated via the check-printing engine — **only for staff with net
  owed > $0** (zero-owed staff are shown in the review table but get no check). → summary screen
  with **Print checks** / re-print.
- **Runs list:** period · pay date · status · net total · [PDF], most recent first. Void a run to
  reopen it.

### Time tracking
`Timeclock.tsx` stays as an independent clock-in feature. It does **not** feed payroll
(commission-only comp).

---

## 5. Removed vs. frozen

**Deleted (code):** `CommissionsPage`, `CommissionsSetupWizard`, `CommissionReport`, `Payroll`,
`PayrollHome`, `PayrollSettings`, `StaffPayrollLanding`, `TeamPermissions`, `team/TeamMembers`,
`team/TeamMemberDetail`, `payouts/AddTeamMemberWizard`, `payouts/commissionComponents`, the
**entire `pages/payouts/` directory** + its routes, and `lib/stripeContractorAccounts.ts` +
`routes/{contractorPayouts,stripeConnectWebhook}.ts`.
`Staff1099`, `StaffFinancialHub`, `StaffIncome`, `StaffPaySummary`, `StaffPayoutsSetup` — fold
useful bits into the new Staff detail + a staff-app "My pay" view; delete the rest.

**Frozen, NOT deleted (data):** `payout_runs` (15), `payout_run_items`, `payout_checks` (16),
`payout_audit_logs`, `payout_deduction_rules`, `payout_w9_records`, `contractors`,
`contractor_commissions`, `contractor_*`, `payroll_print_batches`, `commission_structures` — real
history, kept read-only in the DB. No destructive migration. A later cleanup can archive/drop once
confirmed unreferenced.

**Kept untouched:** the staff-facing app (`StaffDashboard`, `StaffCalendar`, `StaffPOS`,
`StaffAuth`, `StaffMenu`, `StaffLanguage`, `Timeclock`), and the check-printing stack
(`PrintChecks`, `PrintChecksCalibration`, `CheckLayoutEditor`, `lib/checkLayout.ts`,
`lib/micrFont.ts`).

---

## 6. Decisions — RESOLVED 2026-09-10

1. **Paycheck line items:** service commission + product commission + **tips** − booth rent −
   manual deductions. **Commission-only — no hourly wages.** Tips = Σ `appointments.tipAmount` for
   that staff's completed appointments in the period (the per-appointment tip field already exists);
   editable per line in the run review.
2. **Stripe Connect contractor payouts: REMOVED.** Printed paychecks are the only payout path. The
   `pages/payouts/` subsystem + `lib/stripeContractorAccounts.ts` + routes are deleted. Phase 1
   audits the exact Stripe-Connect table names and verifies no production store is mid-onboarding
   before any table is dropped (data retained until then).
3. **Hourly / Time tracking: OUT.** No `staff.hourlyWage`, no timeclock read in a payroll run.
   Compensation is commission-only. `Timeclock.tsx` stays as an unrelated clock-in feature but does
   not feed payroll. This is not a full payroll service.
4. **Name: "Payroll"** (QuickBooks-familiar). Scope = pay-runs + printable paychecks only — no tax
   filing, no direct deposit, no hourly.

**Style reference:** the run experience follows **QuickBooks Payroll's "Run payroll"** —
employee rows (pay type · hours · amount) → running total → **Preview** → **Submit** → summary →
**print checks**. Simple, dense, familiar; not GlossGenius's marketing-heavy onboarding.

---

## 7. Build phases (each is a commit + deploy checkpoint)

1. **Schema + migration** — `pay_schedules`, rework `pay_runs`/`pay_run_lines`. Old tables kept,
   not yet dropped. Audit + name the Stripe-Connect tables; verify no prod store mid-onboarding.
2. **Staff area** — list, 3-step wizard, detail page. Nav wiring.
3. **Commissions** — 2-tab inline table.
4. **Paychecks** — schedule config → period roll → run review → finalize → PDF.
5. **Cleanup** — delete dead pages/routes, migrate any real data out of old `payroll_runs`,
   drop `pages/payouts/` and (later) the unused tables.
