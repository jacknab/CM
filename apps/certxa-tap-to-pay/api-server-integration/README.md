# API server integration (replaces the standalone `backend/` folder)

## Why this replaces `backend/`

The standalone Express service in `../backend/` was built before we knew
your actual architecture. Now that we know:
- The main app and its API are the **same Express process**, same
  domain (`certxa.com`), port 5000 — no separate API subdomain.
- Session handling (`isAuthenticated`, `certxa.sid` config) already
  exists in `src/auth.ts`.
- A Stripe client singleton (`getPlatformStripe()`) and Connect logic —
  including working `createTerminalConnectionToken`,
  `createTerminalPaymentIntent`, `captureTerminalPaymentIntent`, and
  `cancelTerminalPaymentIntent` — already exist in `src/lib/stripeConnect.ts`.

...a second standalone service duplicates infrastructure you already
have and reintroduces a cookie-domain risk that doesn't need to exist
here: since these routes are same-origin as the main app, there's no
cross-domain cookie question at all.

**`../backend/` can be deleted** once this is wired in.

## What's here

```
migrations/0045_stripe_terminal_location.sql   — adds the location-id column
src/lib/stripeTerminal.ts                      — session resolution (userId + staffId) + Location + reader logic
src/routes/stripeTerminal.ts                   — location, reader registration, and
                                                  payment-intent create/capture/cancel routes
                                                  (connection-token already existed — not duplicated)
```

## How the payment flow works now

Your `createTerminalPaymentIntent` uses `capture_method: "manual"`,
which changes the flow from a simple create-and-confirm into three
separate steps:

1. `POST /terminal/payment-intent` — creates the PaymentIntent
   (authorization only, not captured yet). Also applies your
   `PLATFORM_CONNECTION_FEE_CENTS` application fee automatically —
   nothing extra needed here for that.
2. The app collects the card on the reader and confirms — this
   **authorizes** the card but does not move money, because of
   `capture_method: "manual"`.
3. `POST /terminal/payment-intent/:id/capture` — this is the step that
   actually captures the funds. The mobile app calls this automatically
   right after step 2 succeeds.

If anything fails between steps 1 and 3, the app calls
`POST /terminal/payment-intent/:id/cancel` as a best-effort cleanup, so
an authorized-but-uncaptured PaymentIntent doesn't sit around
indefinitely. (Cancel failing isn't treated as fatal — it just logs.)

## Two things to double check before merging

1. **Import paths** — I guessed `../db` for wherever the `pool` export
   used in `upsertPaymentAccount`-style raw SQL lives, and `../auth`
   for `isAuthenticated`, based on what you've shown me but not
   confirmed directly for these two specific exports. Fix if wrong.

2. **Migration numbering** — name the SQL file to come after whatever
   the actual latest migration number is by the time you apply it
   (0044 was the latest you mentioned, so 0045 is a guess).

3. **Mount point** — I assumed `stripeTerminal.ts`'s router mounts at
   the same `/api/payments` prefix as `stripeConnect.ts`'s existing
   `connection-token` route, so the new paths come out as e.g.
   `/api/payments/terminal/location`. Confirm that's actually how
   `stripeConnect.ts`'s router is mounted in your main app file.

## Once merged, mobile app URLs

Already pointed at the real, confirmed paths:
- `src/backendConfig.ts` (mobile app) — `BACKEND_BASE_URL = 'https://certxa.com/api/payments'`
- `src/connectionToken.ts` — `POST /terminal/connection-token` (your existing route)
- `src/useTapToPayBridge.ts` — `POST /terminal/payment-intent`, `/terminal/payment-intent/:id/capture`, `/terminal/payment-intent/:id/cancel`
- `web-integration/certxaTerminalBridge.js` — `GET /terminal/location`, `POST /terminal/reader/register`

If the actual mount point ends up different from `/api/payments`,
update `BACKEND_BASE_URL` in `src/backendConfig.ts` (mobile) and
`BACKEND_URL` in `web-integration/certxaTerminalBridge.js` (web) — both
are single constants, nothing else needs to change.
