# Solo plan work: where to resume

Written 2026-10-16. The design and full history are in `plans/solo-work-places-and-approval.md`; this file is the to-do list for picking the work up again.

**Status:** steps 1–4 (data, settings, address privacy, house-call booking) are built and committed. Nothing from today is live yet (see "Deploy and device steps" at the end), and none of it has been tried on a phone or in a browser.

**Commits:**
- **Main repo** (pushed): `82eb3ee9`, `9cc9bfc9`, `1cefd920`, `e53ac356`, `6b46d0ea`, `4b41494e`
- **Certxa Pro app repo** (`certxa-pro-replit/staff-app-latest`): `8ea8fd7`, `3a4edce`, `fbbca55`. These are **not pushed**; the server has no credentials for `jacknab/staff-app`.

---

## Step 5: booking approval: BUILT 2026-10-23

Done: main `0d00f589`, `dcfac2ca`; Pro `94c64a1`. Owner added: offer links stay open N days (`locations.booking_offer_valid_days`, migration 0256, default 3, 2-7 in the app). The client's link is `<slug>.certxa.com/?offer=<token>`. My calls (not yet confirmed by the owner): requests take no deposit/card, Autumn phone bookings book directly, requests list is app-only, no requests shown on the calendar itself (a banner instead). Tested end to end on store 41 with a 555 number; texts not delivered because Twilio is down (pre-errors.md).

### Original plan

**What the owner asked for:** a setting with two choices, auto-approve or manual approval.

With manual approval, a new online booking is a request:
1. The professional gets a push notification and reviews the request.
2. They approve it, or offer other times through a link to a page showing only those times, or decline it.

**Already in place:**
- **Database:** `locations.booking_approval` (`'auto'` / `'manual'`, default auto) and `locations.booking_request_expiry_hours` (default 48), from migration 0246.
- **Settings endpoint:** `PUT /api/work-places` already saves both values, Solo plan only.
- **`booking_requests` table** (migration 0246): client info, `service_ids`, `details` (everything else the booking would be made with), `starts_at`, `duration`, `visit_at`, `client_address`, `travel_fee`, `status`, `offer_token`, `offered_times`, `appointment_id`, `expires_at`, `decided_at`.
  - Statuses: `requested`, then `approved`, `offered`, `declined` or `expired`. An `offered` request then becomes `booked` or `expired`.
  - The table is migration-only and listed in the drizzle `tablesFilter`.
- **Push notifications:** `lib/ownerPush.ts` (`pushBookingEvent`, Expo push service) sends to the tokens the app registers through `POST /api/solo/push-token`. The app side is `lib/push.ts`.

**Rule:** a request is never an appointment. Many queries (reminders, reports, availability, the /nail board) treat every non-cancelled appointment as a real booking. Approving a request creates the appointment through the normal booking path (`atomicCreateBooking` in `bookingEngine.ts`). A request doesn't hold its time.

### Build list, in order

1. **The setting on screen** (missing in both places):
   - **Certxa Pro app:** Settings, "Where you see clients" screen (`app/settings.tsx`, screen `'places'`).
   - **Website:** `pages/settings/WorkPlacesSettings.tsx`.
   - Both get the choice "Accept bookings automatically" or "Review each booking first", plus how long a request waits before it expires.
2. **Online booking creates a request** in `POST /api/public/store/:slug/book` (`routes.ts`). When the business is on manual approval:
   - Run the same checks as today: slot validation, house-call check, booking controls.
   - Insert into `booking_requests` instead of calling `atomicCreateBooking`, with `expires_at` set to now plus the expiry hours.
   - Return `{ requested: true }`.
3. **Booking themes:** when the response says `requested`, show "Request sent. You'll hear back soon." in place of the booked screen. This applies to Bloom, Classic, Mobile and Simple.
4. **Push notification:**
   - Add a kind (for example `requested_online`) to `OwnerPushKind` in `lib/ownerPush.ts` and send it when a request is created.
   - Tapping it in the app should open the request.
5. **Professional's endpoints** (Certxa Pro routes, `routes/certxaPro.ts`):
   - **List requests:** open requests, newest first.
   - **Approve:** create the appointment through the booking engine and send the usual confirmation. If the time was taken meanwhile, return a conflict so the app offers other times instead.
   - **Offer times:** take one or more times, save `offered_times`, create `offer_token`, and text/email the client the link.
   - **Decline:** tell the client it couldn't be booked.
6. **Client's offered-times page** at `/book/<slug>/offer/<token>`, in the booking app, not indexed by search engines:
   - **Public endpoints:** read a request by its token, and pick a time.
   - Shows only the offered times that are still free.
   - Picking a time books it straight away (the professional offered it). The status becomes `booked` and the other times are released.
7. **Expiry sweeper:** a job like the no-show sweeper (`setNoShowSweeper` in sync-jobs). `requested` / `offered` requests past `expires_at` become `expired`, and the client is told.
8. **Messages to the client:** approved (the normal confirmation), times offered (with the link), declined, expired.
   - These texts are platform-funded, not charged to the business's SMS allowance (only campaign SMS is charged).
9. **Certxa Pro app screens:**
   - A Requests list.
   - A request screen with Approve / Offer other times / Decline. Offer other times uses a time picker that reads the same open times as booking.
   - The plan also says requests show on the calendar as requests.

### Questions to settle with the owner before building

- **Deposits and card on file:** with manual approval, is the deposit taken (or the card saved) when the client asks, or only after approval? If it's taken when they ask, a decline or expiry needs a refund.
- **Autumn (AI receptionist):** do phone bookings follow the manual-approval setting, or always book straight away?
- **Website requests list:** do Solo professionals who use the website need one, or is the app enough?

---

## Left over from step 4 (house calls)

- **Website checkout (POS)** doesn't add the travel fee yet. The app's checkout does: it charges the calendar total, which includes the fee.
- **The booking widget** (`pages/public-booking/BookingWidget.tsx`, shows times only) doesn't ask where the visit is, so its times don't allow for travel.
- **Not used anywhere:** `ClassicTheme1.tsx` and `MobileTheme1.tsx` (no house-call support added).
- **Not tested end to end:** the US Census geocoder against real addresses, the radius check, and the travel-time gaps on a real calendar.

---

## Deploy and device steps (for the owner to run)

The permission rules here block me from running these.

1. **Server:** `pm2 reload certxa-api` (after `node ./build.mjs` in `artifacts/api-server`).
2. **Website:** build `artifacts/booking` and deploy it the usual way: rsync into `api-server/dist/public` **without** `--delete`, excluding `mp-assets`.
3. **Certxa Pro app:** push the Pro repo from a machine with access to `jacknab/staff-app`, then make a new iOS build from a real terminal.
4. **Earlier today's items still waiting:**
   - the marketing and marketplace builds
   - the `llms-full` regeneration
   - the duplicate nginx headers
   - the nail Android EAS build
   - removing `apps/certxa-solo`
   - the license-import schedule for the directory

   Details are in `plans/salon-directory.md`, `plans/certxa-apps.md` and `plans/nail-android-app.md`.

## How to pick up again

Say "resume Solo step 5". Start by settling the three questions above, then work down the build list.
