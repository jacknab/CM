# Online Check-In Line for barbershops and haircut studios

Status: BUILT AND LIVE 2026-11-03 (all 4 phases; not yet tried with real clients). Approved 2026-11-03: build all 4 phases. Barber choice: the shop decides (default Any barber). Late rule default: hold 10 min, move back once, then remove.

## What the market does (research, 2026-11-03)

Great Clips' Online Check-In is the reference walk-in chains are judged against:

- **Waitlist, not an appointment.** The client puts their name on the salon's waitlist from anywhere and sees an estimated wait. The estimate changes as clients check in, are served, and as stylists start and end shifts.
- **"Leave now" text.** The client can opt in to a text when the estimated wait is 15 minutes or less (app users can get a push instead).
- **Next available stylist only.** The client can't reserve a specific stylist, and estimates assume the next available one.
- **Late clients.** A client who arrives after their estimated time may be removed from the list.
- **Hours.** Online check-in closes about 15 minutes before closing.
- **Weak spot.** Estimates are often wrong, especially at small salons: one reviewer saw "no wait" with six people inside.

Sources: greatclips.com/customer-service, greatclips.com/app, the Great Clips newsroom (2022 waitlist feature), and App Store reviews.

## What Certxa has today

`/q/:slug` (pages/queue/PublicCheckIn.tsx), its waiting-room screen `/q/:slug/display`, an owner dashboard `/dashboard/queue` and settings `/dashboard/queue/settings`. The server routes are in routes.ts (`/api/public/queue/*`).

Gaps:
1. **It is a separate line.** It writes to the `waitlist` table. The /barber Queue, the kiosk and /frontdesk all use `kiosk_checkins`, so an online check-in never reaches the barbers' screen. The table has 0 rows; it was never used.
2. **The wait is a guess.** It is the place in line × a fixed 20 minutes. It ignores how many barbers are working, how long the people in the chairs have been there, and real cut times.
3. **Anyone can cancel anyone.** `PUT /api/public/queue/cancel/:id` takes a counting number with no secret, so any number cancels someone's place.
4. **Wrong "today".** "Today" is worked out in the server's time zone, not the salon's.
5. **The client is never told anything.** There are no texts when it's time to leave, when they're up, or when they've been removed.

## The upgrade

### 1. One line
An online check-in becomes a check-in in `kiosk_checkins` (source `online`), with a secret token. It appears on the /barber Queue, the kiosk, /frontdesk and the lobby screen in the same order as everyone else. The old `waitlist` code paths for /q are retired.

### 2. A real wait estimate (one server function)
Every screen uses the same estimate. It is built from:
- the barbers clocked in and not on break;
- for each barber in a chair, the time already in the chair (assigned_at, 2026-11-03);
- the shop's real cut length: the median `actual_minutes` over the last 30 days (now take → checkout), falling back to the owner's setting;
- the people ahead in line.

Shown as a range ("15–20 min"), never "0" while people are waiting.

### 3. The client's page (phone)
- **Shop page:** the shop's own page (`<slug>.certxa.com/checkin`, plus `/q/:slug`) shows the live wait, the number of people ahead, and how many barbers are working.
- **Joining:** "Join the line" asks for first name and mobile number. A party (2–4 people) gets one spot per person, each with its own name.
- **Barber choice:** "Any barber" (fastest) by default. A shop that allows it can let the client choose a barber, who then shows their own wait.
- **Your place:** a live page with their spot, their wait, "I'm here", and "Leave the line". The link and its secret token come by text, and the page updates live.

### 4. Texts (system texts, free to the shop)
- **Confirmation:** sent on joining, with the live link.
- **"Head over now":** sent when the estimate reaches the shop's lead time (default 15 min).
- **"You're up":** sent when a barber takes them.
- **"We kept your spot / You've been moved back":** under the late rule (below).

The client can reply STOP as usual.

### 5. Arrival and late clients
- **On the Queue:** /barber's cards show **ON THE WAY** or **HERE**. A client who signs in at the kiosk or taps "I'm here" becomes HERE.
- **Late rule (owner setting):** a client not here by their turn is skipped and held for N minutes (default 10), then moved back once, then removed. Each step texts them.
- **Barbers:** they are never handed a client who isn't HERE when someone who is HERE is waiting.

### 6. Controls for the shop
- **Settings › Online Check-In:** on/off, closes N minutes before closing, maximum line length, lead time, late rule, barber choice on or off.
- **/barber Manager:** "Pause online check-in" with a reason ("Back at 2 PM"), shown on the client page.

### 7. Lobby screen
`/q/:slug/display` shows the same line: first name and last initial, HERE / ON THE WAY, the next three, the wait. No phone numbers.

### 8. Reach
- **Booking page and salon page:** a "Check in online" button with the live wait, in the salon page's JSON-LD as well.
- **AI assistants (MCP):** a `join_line` tool next to booking.

### 9. Reports
- **Estimate accuracy:** promised wait vs actual, per day.
- **Line results:** walk-outs, people removed for being late, and online vs in-store check-ins.

## Phases
1. **One line and a real estimate** (1, 2), plus the security fix. The /barber Queue shows online clients.
2. **Client page and texts** (3, 4).
3. **Arrival and late rule** (5), with the shop controls (6).
4. **Lobby screen, reach and reports** (7, 8, 9).

**/nail is untouched.** It is offered to barbershops and haircut studios (category barber/hair). Nail salons keep their current kiosk flow.
