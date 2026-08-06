---
name: Data retention policy
description: Legal/tax rule — account data cannot be deleted until Feb 1 of the following calendar year, even for canceled accounts.
---

## Rule

All account data — appointments, payroll records, staff earnings, invoices, payments, and any other financial records — must be retained until **February 1st of the following calendar year**, regardless of account status (Suspended, Canceled, Locked, or Inactive).

**Why:** The platform stores payroll and earnings data used for tax filings. Premature deletion would violate tax record-keeping requirements.

## How to apply

- Suspension and cancellation flows must only flip `locations.account_status` — they must never `DELETE` rows from any financial table.
- Any future data cleanup / purge job must gate deletion with: `WHERE canceled_at < '{{feb_1_of_following_year}}'` (or equivalent logic).
- The `AccountStatusGate` (frontend) and any API suspension middleware only gate *access* — they must never cascade deletes.
- Before writing any DELETE query that touches appointments, payroll, staff_earnings, invoices, payments, or related tables, always check this rule first.
