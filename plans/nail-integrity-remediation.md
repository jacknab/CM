# Nail desk integrity remediation

Scope: `/nail` UI, ticket creation and editing, gift-card redemption, group checkout and terminal-payment verification. This plan is implemented in stages because captured external card payments cannot be rolled back with PostgreSQL.

## Order of work

1. Require a Stripe PaymentIntent ID for every remote card success, verify ticket, store, amount and captured state with the existing verifier, and reject duplicates/cancelled responses. Never allow a locally captured card tender to be deleted as if it had not been charged. Recover captured payments after navigation or reload.
2. Move marker validation/claim and ticket creation into a common transaction: require same store/client, waiting status and no existing appointment; claim exactly once. Add concurrency tests.
3. Make ticket edits atomic: lock open appointment, validate availability under lock, modify service/add-ons/nail/custom lines using a single transaction, detect stale revisions, and broadcast only after commit. Avoid mixing transactional and non-transactional storage helpers.
4. Build a server-owned nail checkout operation. Lock all appointment rows in sorted ID order; recompute authoritative item totals, validate tender amounts and captured card intents, lock gift-card and loyalty rows, write ledgers and all group shares, then commit together. Key all retries by a durable idempotency key and payload hash; reject changed retries.
5. Restrict nail gift-card debit to this operation, validate ticket status and unpaid amount, and enforce unique redemption per card and appointment at the database level. Keep manual gift-card management separate.
6. Preserve payment intent IDs outside transient checkout UI. Reconcile captured-but-unfinalized charges on retry; require an explicit verified refund workflow rather than silently erasing settled value. Keep existing award/turn/commission side effects idempotent after the transaction.

## Validation gates

- Unit tests: duplicate/cross-store/missing-intent card results, removal of charged tenders, stale marker, concurrent marker creation, partial ticket edit rollback, mismatched gift redemption retries, replayed checkout keys and partial group failures.
- Integration tests with disposable PostgreSQL and Stripe test mode: failed capture/retry; captured-but-unfinalized charge; two concurrent registers; group checkout with second-row failure; accurate ledger, commissions, loyalty and TURN accounting.
- Run booking and API typechecks and nail-related test suites. Do not deploy a client using the old client-driven completion flow once the new endpoint is enabled.

## Constraints and operational risk

Existing payment capture can complete an appointment before the `/nail` screen finalizes it. The new operation must reconcile that state rather than charging again or rejecting an already-captured ticket outright. Changes in shared appointment PATCH, TURN and loyalty helpers also affect calendar and front-desk consumers. Existing uncommitted workspace changes must be preserved.

## Implementation notes and deployment gate

- Implemented server-side settlement with durable idempotency, group-row locks, card-intent verification, gift/loyalty debits and gift-card ledger uniqueness in `migrations/0212_nail_checkout_integrity.sql` and `artifacts/api-server/src/lib/nailCheckoutSettlement.ts`. Direct nail gift redemption is disabled. Manual gift redemption requires `giftCards.manage`.
- The owner Android bridge forwards `nailCheckout` so a captured card remains a pending tender until the Nail POS settles the complete sale. Existing installed owner-app binaries will not forward that flag; the checkout operation supports the legacy pre-completed primary ticket, but group commission/loyalty can already have been calculated before its shares are finalized. Rebuild and distribute the native app together with the server/browser deployment.
- Card captures are persisted as `pending` in the database at capture/webhook time and exposed only for a same-store ticket; the browser verifies Stripe before recovering a tender. Captured tenders cannot be removed in the POS. The browser also preserves the exact checkout request for safe retry after a lost response.
- **Do not treat a successful typecheck as payment integration certification.** The environment did not contain a disposable PostgreSQL database or Stripe test account; `/etc/certxa.env` points at an existing database and was used for read-only schema/duplicate/`EXPLAIN` checks only. `0212` has **not** been applied by this work. Before enabling payments, run the migration on staging, exercise capture and webhook recovery on web/native, cash/gift/loyalty and group checkout with failures injected before and after commit, then deploy the new server before the browser/native app.
- Remaining operational work: external card refunds/voids require a verified Stripe refund workflow (the UI deliberately disallows simply removing a charge); post-commit TURN/commission/loyalty notifications are best-effort existing helpers and need a durable side-effect outbox for crash-perfect replay. A legacy native app can still pre-complete a ticket before grouped shares have been persisted. These paths must be acceptance-tested before production checkout is considered fully hardened.
