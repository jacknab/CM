# Reports rebuild (owner, 2026-10-29)

Goal: each report its own page (`/reports/<slug>`), worked out on the server from what was actually charged, with a
shared toolbar: date presets + custom range, compare to the previous period, CSV export, print. The Reports home groups
cards under Money · Team · Clients · Operations · Marketing; a report appears there once it is built (no "Coming soon").

## Audit of the old system (2026-10-29)
- One page `/reports/dashboard?tab=…` with tabs (Revenue, Appointments, Staff, Services, Clients, Tax).
- Every number computed in the browser from the appointment list.
- Sales tax recomputed from today's tax settings — the tax charged was never saved (fixed: appointments.tax_amount, 0269).
- Payment methods counted from raw payment_method strings, so split tenders were miscounted (server has allocateTenders).
- Five "Coming soon" cards (Retail, Packages, Inventory, Transaction detail, Most valuable clients).

## Stages — all built 2026-10-29
Every report: GET /api/reports/:group/:report?from&to&compare=1 (permission reports.view), server lib/reports/<group>.ts,
page pages/reports/<Group>Reports.tsx in the shared ReportFrame. Checked against store 2's real October data.

1. **Money** (`money.ts`): Sales `/reports/sales` · Payments `/reports/payments` · Sales tax `/reports/tax` ·
   Tips `/reports/tips` · Gift cards `/reports/gift-cards`. Tax is saved on each sale (0269) by the /nail checkout and the
   calendar checkout (appointment PATCH).
2. **Team** (`team.ts`): Staff performance `/reports/staff` (net sales, tickets, avg ticket, tips, add-on %, came back
   within 60 days %, avg service minutes, sales per clocked hour) · Hours & chair use `/reports/hours` · Turns `/reports/turns`
   (turn_events; turns = turn_units ÷ TURN_UNIT).
3. **Clients** (`clients.ts`): Retention `/reports/retention` (new vs returning, came back so far / within 30-60-90 days,
   days between visits) · Lapsed clients `/reports/lapsed-clients` (2+ visits, not back for N days, win-back list) ·
   Most valuable `/reports/top-clients` · No-shows & cancellations `/reports/no-shows` · Loyalty `/reports/loyalty`.
4. **Operations** (`operations.ts`): Appointments & walk-ins `/reports/appointments` · Wait times `/reports/wait-times`
   (check-in → start: avg, median, 90th percentile, within 15 min, by hour/day) · Service times `/reports/service-times`
   (actual_minutes vs booked) · Busiest times `/reports/busy-times` · Services & add-ons `/reports/services`.
5. **Marketing** (`marketing.ts`): Review requests `/reports/reviews` · Texts sent `/reports/texts` · Autumn calls `/reports/autumn-calls`.

Existing pages kept and linked from the home: Commission earnings, Salon earnings, Day Close, Register reports.
The old `/reports/dashboard?tab=…` page is gone; old links open the matching new report.

## Ideas for later
- Per-report drill-down (click a technician / service / day to see its tickets).
- Scheduled email of a weekly summary to the owner.
- Product (retail) inventory report once products track stock.
