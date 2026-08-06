---
name: clients is the single source of truth — customers retired
description: All FK constraints now point to clients(id); customers table exists but is never queried in active paths. Phone/email/opt-in live in separate tables.
---

## Rule
`clients` is the single source of truth for client records. The `customers` table still exists in the DB and Drizzle schema (so the `Customer` type still compiles) but must never be queried in new code.

## FK tables pointing to clients(id)
appointments, sms_log, loyalty_transactions, waitlist, gift_cards (×2), google_reviews, intake_form_responses, intelligence_interventions, client_intelligence, reviews — all 11 tables re-pointed.

## Column mapping (customers → clients)
- `customers.name` → `clients.fullName`
- `customers.phone` → subquery: `(SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`
- `customers.email` → subquery: `(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`
- `customers.marketingOptIn` → subquery: `(SELECT sms_opt_in FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`
- `customers.loyaltyPoints` → `clients.loyaltyPoints` (column added to clients table)
- `customers.notes` → `clients.notes` (column added)

## Storage layer
`storage.ts` customer methods (getCustomers, searchCustomerByPhone, createCustomer, updateCustomer, deleteCustomer) all query `clients` + `client_phones` + `client_emails` and return legacy `Customer`-shaped objects. Callers are unaware of the table change.

## clientId bridge (removed)
The old multi-step bridge that looked up or created a `customers` row from a `clientId` was removed. Booking now sets `input.customerId = clientId` directly (clients.id = appointments.customer_id FK).

**Why:** DB is empty (no data migration needed); customers table was duplicate overhead; clients table has richer contact model (multi-phone, multi-email, marketing prefs).

**How to apply:** Any new route that needs a client's phone must use a SQL subquery on `client_phones`. Never add `customers.*` queries.
