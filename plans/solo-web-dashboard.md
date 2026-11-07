# Solo website dashboard

## Status

- **Step 1 — Billing and the secure app link: LIVE (deployed 2026-11-06 ~18:30, API + website). Committed in 66612e30.**
  - Server:
    - `lib/appWebSession.ts` adds the billing-only sign-in: browser-session cookie, 30-minute idle limit, billing pages and data only, no new app links, no remembered device.
    - The `/billing/start`, `/pro-plus/start` and `/pro-credits/start` routes all use it.
    - `GET /api/solo/billing/history` is new.
    - `/api/auth/user` skips `rememberDevice` for these sign-ins.
    - The dashboard socket refuses them.
  - Website:
    - `pages/solo/SoloBilling.tsx` is the new Billing page at `/solo/billing`.
    - `lib/appWebSession.ts` ends the sign-in on page close and on "Back to Certxa Pro", but not mid-payment.
    - `/billing` sends Solo accounts to `/solo/billing`.
    - `/pro-plus` and `/pro-credits` get a "‹ Billing" link back.
  - Tests: 32 + 23 server checks and 19 browser checks passed; 717/717 API tests passed.
- **Step 2 — Solo removed from the website's plan choices: LIVE (deployed 2026-11-06 ~19:20, API + website). Committed in 66612e30.**
  - Server:
    - `lib/soloPlanRules.ts` `planChangeRefusal`: salon accounts can't move to Solo or Plus, and app accounts can't move to salon plans. It is applied in billing subscribe and change-plan, and in subscription subscribe and finalize-setup.
    - `/api/plans/public-plans` drops Solo.
    - `/api/billing/account-status` returns `previousPlan` for locked salons.
  - Website:
    - Solo is removed from `PLAN_BASE`, from the "Switch to Solo" cancel offers on both billing pages, and from the Trial Expired fallback.
    - Account Locked shows "Restart <previous plan> · $X/month". It used to restart on free Solo, which reopened the account without paying. With no previous paid plan it shows "Contact support".
    - `/manage/billing` also sends Solo accounts to `/solo/billing`.
  - Tests: 17 server and 15 browser checks passed; step 1 checks re-run; 717/717 API tests passed.
  - Left as is: the marketing `/pricing` page still shows Solo (it reads `/api/public/pricing-plans`). The Trial Expired fallback prices are out of date, but that page is never shown now, because an ended trial counts as "suspended".
- **Step 3 — Server allow-list for Solo accounts: LIVE in report mode (deployed 2026-11-06 19:36; migration 0321 applied). Not committed.**
  - `lib/soloApiAllowList.ts` holds `SOLO_API_ALLOW`, which is the Pro app's 47 API areas read from its source, plus sign-in, Solo billing and public pages.
  - `soloApiLock` runs right after the session middleware (auth.ts). It reads the account from the cookie or the app's token. A Solo account means `certxa_pro`, or a store on the solo/solo_plus plan.
  - The `SOLO_API_LOCK` mode (env) is "report" by default; "enforce" refuses with 403 NOT_ON_SOLO; "off" does nothing.
  - Report: misses are counted in `solo_api_report` (migration 0321: method, path shape, app/web, hits, stores, first/last seen) and saved every minute.
  - The app's billing-only sign-in is skipped here, because it has its own smaller list.
  - Tests: 24 report-mode, 25 enforce-mode and 32 billing-link checks passed; 721/721 API tests passed (4 new in `soloApiAllowList.test.ts`).
  - Rollout: deploy in report mode, read `solo_api_report` after a few days, add anything legitimate to the list, then set `SOLO_API_LOCK=enforce` (export it before `pm2 restart --update-env`).
  - Until step 4 is live, Solo website users still use the salon dashboard, so "web" rows are expected noise. Judge enforcement for the app by the "app" rows.
- **Step 4a — Solo dashboard layout + Home, and the Billing page redesign: LIVE since 2026-11-06 ~23:00 UTC, committed.**
  - `/solo` has its own layout (`pages/solo/SoloLayout.tsx`): a sidebar on computers and tabs on phones. Only Solo accounts get in; salon accounts go to their dashboard, and signed-out visitors go to sign-in.
  - Solo accounts are NOT yet sent to `/solo` when they sign in. That waits until Calendar, Clients and Catalog exist.
  - Home (`pages/solo/SoloHome.tsx`) is the app's Home on the web: greeting, Taken today, Needs your attention (requests and unread texts, answered in the app), Next up, and today's appointments.
  - The Solo dashboard uses the app's API: `lib/soloApi.ts` sends `X-Certxa-Solo: 1`, and `certxaPro.ts` `proClient()` accepts a Solo website sign-in that sends it. That gives the same data and rules: owner-only, and the paid lock (which now applies to Solo web too).
  - `certxaPro.ts` `appointmentSelect` now uses LEFT JOIN services, so POS quick sales (no service) appear in the list and count in "Taken today", in the app as well. The app's calendar filters them by `calendarHidden`.
  - Billing page order (owner): card on file (change / remove), then Plus, then Business Phone, then text credits, then payments.
  - `routes/soloCard.ts` provides GET/DELETE `/api/solo/billing/card`, plus setup-intent and save. One card serves Plus, Business Phone and credits.
  - Changing the card updates the Stripe default AND the Plus row (`savedCard` reads the row first), and the old card is detached.
  - Remove is refused while Plus or a Business Phone line exists, cancelled or not, until it ends. It then empties the card on the Plus row (the column is NOT NULL); `savedCard` skips an empty value.
  - Cancel is the existing period-end cancel for both Plus (`/api/solo/plus/cancel`) and Business Phone (`/api/pro/phone/cancel`).
  - The app's billing sign-in can now also reach `/api/solo/billing/card`, `GET /api/pro/phone` and `POST /api/pro/phone/cancel` (method + exact address).
  - Tests: 7 server and 11 browser checks for Home; 14 server and 21 browser checks for Billing; 721/721 API tests passed.
  - The change-card form itself (a real Stripe SetupIntent) was not tried: the test server has no Stripe test keys.
- **Step 4b-1 — Calendar (`/solo/calendar`): LIVE 2026-11-06, committed.**
  - `pages/solo/SoloCalendar.tsx` (Month / Week / Day; the day is a 24-hour timeline with blocked time, overlapping bookings side by side and a now line; drag to move with Notify client; paid bookings never move).
  - `SoloBookingPanel.tsx`: details; Mark as paid (cash, the visit's total, like the app; prepaid = Mark as done), Change time, No-show, Cancel with or without a text; Book again; Delete for no-shows and cancelled bookings.
  - `SoloNewBooking.tsx`: New booking (client or new client, one own service at the owner's place, open times from the public availability for the owner) and Block time.
  - Helpers: `soloTime.ts` (business-time days), `soloBookings.ts` (the app's booking mapping), `soloUi.tsx`.
  - App-only on purpose: card checkout, refunds, fees, payment links, packages, house calls, add-ons, extra services, repeat bookings, notes editing, answering booking requests.
  - No server changes: the compact API already answers these with `X-Certxa-Solo: 1`, and the allow-list covers every call.
  - Tests: 29 server checks (one wrong expectation: delete answers 204) and 39 browser checks passed.
- **Step 4b-2 — Clients (`/solo/clients`, `/solo/clients/:id`) and Catalog (`/solo/catalog/:section`): LIVE 2026-11-07, committed.** The app's Clients list + profile (visits open the booking panel, photos, notes, details, VIP, tags, text preferences, edit, delete) and all 7 Catalog sections. Server: the app's service list now includes allowQuantity (it was missing, so saving a service in the app turned "Clients choose how many" off). Tests: 41/45 server (4 wrong expectations) + 49 browser checks; Calendar 39 still pass; 721 API tests.
- Sending Solo accounts to `/solo` on sign-in: not started.

Owner decisions (2026-11-06):

- **Why this exists:** Solo pros sign up ONLY in the Certxa Pro app. The website is needed mainly because the billing page cannot be in the app; the dashboard pages are secondary.
- **Build order:** Billing + secure app link first (Phase 6 below), then the allow-list, then the dashboard pages.
- No Settings on the website — they stay in the app (Solo can't sign up on the web, so every Solo user has the app).
- Web calendar payment: "Mark as paid" only (the app's cash button); card payments stay in the app.
- Existing Solo-plan accounts move to the Solo dashboard (today: stores 41 and 43, both app accounts).

- Solo accounts get their **own website dashboard**, separate from the salon one. These are app accounts (`users.account_type = certxa_pro`) and every store on the `solo` or `solo_plus` plan.
- Signing in on certxa.com sends them there. The salon dashboard, its calendar and its pages stay untouched.
- **First version:** Home, Calendar, Clients and Catalog, plus a Solo Billing page.
- **Settings stay in the app.**
- The **server locks Solo accounts to an allow-list**: only the endpoints the Solo dashboard and the Certxa Pro app use. Everything else is refused, so salon features added later are closed to Solo automatically.
- **The app opens the Billing page through a secure link.**
  - The link is single-use and short-lived. It is never a permanent address.
  - The sign-in it creates ends when the page or browser is closed.

## Phase 1: who is Solo, and where they land

- **Server helper `isSoloAccount(user, storeId)`.** It is true when the user is `certxa_pro`, or when `resolveStorePlan` returns a Solo plan (`isSoloPlanCode`). The result is cached for a short time.
- **The website's own check** uses the same rule, from the auth user and the store's plan.
- **After sign-in, Solo goes to `/solo`.** Any salon-dashboard address sends them back to `/solo`.
- Salon accounts never see `/solo`.

## Phase 2: Solo layout and Home

- `/solo` has its own layout, designed for a computer screen, with a phone fallback.
- **Menu:** Home, Calendar, Clients, Catalog, Billing, Support, Sign out.
- **Home** matches the app's "Today at a glance", using the same data the app reads (`/api/appointments` for the day, `/api/sms-inbox/conversations`):
  - greeting;
  - money taken today, including quick sales, minus refunds;
  - next client;
  - today's appointments;
  - unread texts.

## Phase 3: Solo Calendar

- A new calendar built only for one person. The salon calendar is not changed.
- **Views:** day, week and month, in the business time zone.
- **Bookings:**
  - book, move and edit;
  - cancel;
  - the conflict check the app uses (`checkConflicts`).
- **Paid bookings are locked,** the same as in the app.
- **Blocked time** (`/api/time-blocks`).
- **No checkout in v1,** because Sales is not in this version. The open question below covers what a booking shows instead.

## Phase 4: Clients

The app's CRM screens, rebuilt for a wider screen:
- search;
- status filters;
- profile, including stats, visits, notes, tags and preferences;
- edit;
- book from the profile.

## Phase 5: Catalog

Categories, Services, Add-ons, Add-on Groups, Packages, Products and Deals, matching the app's Catalog.

## Phase 6: Solo Billing and the secure app link

- **Solo Billing page:**
  - plan (Solo / Plus);
  - card on file;
  - invoices;
  - text-credit balance and packs.
- **The existing link** (`POST /api/solo/billing/web-link` → `GET /billing/start`) is already single-use and expires 15 minutes after it is made. It changes as follows:
  - The sign-in it creates uses a **browser-session cookie** (no `maxAge`), so it ends when the browser or page session closes. Today every website session lasts 10 years and renews on every request.
  - The session is marked `scope = billing`. The server then allows only the billing endpoints, and refuses the rest of the dashboard and the app endpoints.
  - **Idle limit of 30 minutes,** checked on the server.
  - The device "stay signed in" cookie is never issued.
  - The link opens the Solo Billing page directly.
- The existing Plus link (`/pro-plus/start`) gets the same treatment.

## Phase 7: server allow-list

- **One middleware** runs after sign-in. For a Solo account, it refuses any `/api/...` request that is not on the allow-list, with `403 { code: "NOT_ON_SOLO" }`.
- **Public endpoints are not affected:** booking pages, sign-in, `/api/public/*`, webhooks.
- **The allow-list is built from:**
  - the Pro app's endpoint list (80 endpoints, read from the app source on 2026-11-06);
  - what the Solo dashboard calls;
  - billing, auth and session endpoints.
- **Rollout in two steps:**
  1. **Report-only:** a few days of logging which endpoints Solo accounts actually use, from the live app and the website.
  2. **Enforce:** switch to refusing what isn't on the list.

  This stops a missed endpoint from breaking the live app for real pros.

## Testing (isolated server, scratch DB)

- A Solo app account, a Solo website account and a salon account:
  - Solo is routed to `/solo`.
  - Salon accounts are unchanged.
  - Every Solo page works, with no refused calls.
- **Locked endpoints:** calling each one directly as Solo is refused.
- **Billing link:**
  - used once;
  - fails when expired;
  - its session dies with the browser session and after 30 minutes idle;
  - it can't open other pages.
- The full API test suite passes.

## Solo removed from website plan choices (decided 2026-11-06)

Solo is app-only. The website's plan choices for salon accounts lose Solo:
- the "switch to Solo" option in `DashboardBilling.tsx` and `manage/BillingPage.tsx`;
- the Solo plan offer on `AccountLocked.tsx` and `TrialExpired.tsx`.

The server also refuses a Solo plan change from a non-app account, so it can't be done by calling the endpoint directly.
