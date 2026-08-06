---
name: Email Preference Centre
description: Per-user opt-out preferences for non-critical Certxa system emails. DB table, API routes, and MailSettings.tsx UI section.
---

## What was built
- DB table: `user_email_preferences` (migrated as `0029_email_preferences.sql`)
- API: `GET/PATCH /api/settings/email-preferences` — route file at `artifacts/api-server/src/routes/emailPreferences.ts`, registered in routes.ts using `isAuthenticated` middleware
- Frontend: new card at the bottom of `artifacts/booking/src/pages/MailSettings.tsx`
- Backend guards: `systemEmails.ts` checks prefs before sending non-critical emails

## Opt-outable categories
| Key | Emails affected |
|---|---|
| `billingReceipts` | Subscription renewal success, credit top-up receipts |
| `lowBalanceAlerts` | Low platform/SMS credit balance warnings |
| `dataOperations` | Data transfer complete/rejected |
| `trialReminders` | Trial expiring/ended emails |

## Always-sent (no opt-out)
- Payment failed (`sendPaymentFailedEmail`)
- Account suspended (`sendAccountSuspendedEmail`)
- Account locked (`sendAccountLockedEmail`)
- Account restored (`sendAccountRestoredEmail`)
- Welcome email (`sendWelcomeEmail`)

## Critical gotcha
`users.id` is `character varying` (UUID), NOT integer. The FK and Drizzle schema column must use `text`, not `integer`. First migration attempt failed with FK constraint error because of this.

**Why:** The users table uses `gen_random_uuid()` default — UUIDs stored as varchar, not bigserial. Any table that FKs to users must use `VARCHAR REFERENCES users(id)` in SQL and `text("user_id")` in Drizzle schema.

**How to apply:** Any future table with a userId FK to users → use `text()` in Drizzle, `VARCHAR` in SQL migration.
