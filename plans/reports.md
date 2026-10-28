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

## Stages
1. **Money** (building now): Sales summary · Payments by method · Sales tax · Tips · Gift cards.
2. Team: Staff performance (revenue, services, avg ticket, tips, add-on rate, rebook rate, retention), Hours & chair use, Turns.
3. Clients: Retention (new vs returning, back within 30/60/90 days), Lapsed clients, Most valuable clients, No-show risk, Loyalty.
4. Operations: Appointments & walk-ins, Wait times, Service times (real vs booked), Busiest hours, Service & add-on performance.
5. Marketing: Review requests, Texts sent, Autumn calls.
Existing pages kept and linked from the home: Commission earnings, Salon earnings, Day Close, Register reports.
The old `/reports/dashboard` tabs stay until their stage replaces them.
