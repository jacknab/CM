# Certxa Terminal Backend

> **⚠️ Superseded.** This standalone service was built before we knew
> your real architecture (single Express process, same domain as the
> main app, existing session/Stripe infra already in place). See
> `../api-server-integration/README.md` — the real version of this
> logic belongs there, as new routes in your existing `api-server`, not
> as a second service. This folder is kept for reference only; don't
> deploy it alongside the integrated version.

Minimal Express API the mobile app calls for the two things that must
never happen on-device: minting Terminal connection tokens and creating
PaymentIntents, both scoped to the right Stripe Connect connected
account.

## Auth model

This backend authenticates the SAME way the main certxa.com app does:
a `certxa.sid` session cookie, signed with `SESSION_SECRET`, backed by
an `express-session` + `connect-pg-simple` store in your Postgres
`sessions` table.

There's no separate mobile login and no Bearer token. The mobile app
reads the `certxa.sid` cookie out of its WebView (where the user is
already logged into certxa.com/auth) and forwards it as a normal
`Cookie` header on requests to this API. Because this backend points at
the *same* sessions table and secret as your main app, that cookie is
valid here too — no extra credential issuance needed.

The connected account is resolved server-side from `req.session.userId`
(owner/admin) via `locations` -> `store_payment_accounts`. The client
never supplies an account ID.

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env:
#   STRIPE_SECRET_KEY  — your platform's secret key
#   SESSION_SECRET     — must match the main certxa.com app EXACTLY
#   DATABASE_URL       — same Postgres database the main app uses

# Run this once against that database (or port it into your main app's
# own migration system if it uses one, e.g. Drizzle):
psql "$DATABASE_URL" -f migrations/001_add_terminal_location_id.sql

npm run dev
```

## Before this is production-ready

1. **Staff logins aren't resolved yet.** `resolveAccountAndStoreForSession()`
   in `src/middleware/auth.js` only handles `req.session.userId`
   (owner/admin). For `req.session.staffId` it currently returns `null`
   (i.e. staff get a 403). If staff need to take payments too, add the
   real staffId → storeId lookup — I didn't have that table/relationship
   and didn't want to guess at your schema.

2. **Verify the address column names in `src/services/terminalLocation.js`.**
   Creating a Stripe Terminal Location needs a street address, and I
   assumed your `locations` table has `address`, `city`, `state`,
   `postal_code`, `country` columns based on the schema you already
   showed me for `store_payment_accounts` — but I don't have the actual
   `locations` table definition. If the names differ, Stripe will
   return a clear validation error naming the missing field (not fail
   silently), but worth fixing before merchants hit it.

3. **Deploy this where it can reach the same Postgres database** as your
   main app (same `DATABASE_URL`), with the same `SESSION_SECRET`. If
   either differs, cookie verification will fail for every request.

4. **Cookie domain scoping matters.** For the mobile app to read
   `certxa.sid` out of the WebView and have it apply to requests to this
   backend, this API needs to be reachable under a URL the cookie's
   `Domain` attribute covers — e.g. if the cookie is scoped to
   `certxa.com`, put this API on `certxa.com` or a subdomain like
   `api.certxa.com` (with the cookie's `Domain` set to `.certxa.com`).
   A completely separate domain won't receive the cookie.

5. **Deploy it somewhere reachable from the app** (Render, Fly.io,
   Railway, your own infra, etc) and update the URLs in the mobile app's
   `src/connectionToken.ts` and `src/useTapToPayBridge.ts` to point at it.

6. **Set `ALLOWED_ORIGINS`** in `.env` if certxa.com ever calls this API
   directly from the browser too (not required for the native app
   itself).

## Endpoints

- `POST /stripe/connection_token` — cookie auth only, no body → `{ secret }`
- `POST /stripe/payment_intent` — cookie auth, body `{ amount, currency }` → `{ client_secret, id }`
- `GET /stripe/terminal_location` — cookie auth, no body → `{ locationId }` (creates one on Stripe the first time it's called for that store)
- `POST /stripe/reader/register` — cookie auth, body `{ registrationCode, label? }` → `{ readerId, label, serialNumber }` (one-time, links a physical M2 to the store's Location)
- `GET /stripe/reader/list` — cookie auth, no body → `{ readers: [...] }` (readers already registered to the store's Location)
- `GET /health` — plain liveness check
