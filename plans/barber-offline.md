# /barber offline mode — plan (2026-11-02)

Goal: a barbershop keeps working with no internet exactly as a nail salon does on /nail: check in, take a
client, ring up, take cash (and card through the M2's offline mode), print; everything is sent when the
internet is back, and the shop's tablets share one queue over the local hub.

## What already works on /barber
- Salon copy on the tablet (`startSalonMirror`), local hub (host election, Network/Hub IP), device health +
  self-healing fixes, offline manager PIN and manager badges, and the offline limit lock (`OfflineLimitLock`).
- The Certxa app's offline M2 card (`useTerminalPayment` runOffline) is native: it works for any page that asks.

## What is missing
/barber talks to the server directly (`barberApi.call` = plain fetch). Nothing is saved on the tablet, so with
no internet every check-in, assign, ticket and checkout fails. Nail does all of this through
`lib/nail-offline` (engine + sync) and `nailApi.call` (answers reads from the device when offline).

## Why it is not a copy-paste
The barber flow is different (memory: barber-screen):
1. A waiting client is a **marker** (a check-in, no ticket). The barber who signs in **takes** the marker
   (`POST /markers/:id/assign`); there is no TURN hand-out.
2. The ticket is made only when the barber rings them up (`POST /tickets` with `checkinId` + `staffId`),
   usually straight into PAY NOW.
3. The screen re-locks after each action.

The nail engine already has the closest thing: a **walk-in record** (`walkin.create`) is a marker.
What it lacks is "a barber took this walk-in" and a ticket made *from* a walk-in by a named barber.

## Plan — 5 steps, each shippable on its own

### Step 1 — Reads from the tablet (board, sign-in, catalogue)  ✅ LIVE 2026-11-02
- `barberApi.call` gets the same shape as `nailApi.call`: remember good answers, answer from the device
  (`nailOffline.recall`, then `answerFromMirror`) when the server can't be reached; `syncEngine.noteContact /
  noteUnreachable`; `networkMode: "always"` on the board query.
- `fetchBoard` offline = the last board + this tablet's own records (`offlineBoard.ts`, already shared).
- `identifyBarber` offline = the staff list on the tablet (as `identifyTech`), clock-in queued.
- Footer status becomes nail's (Offline / Sending / Needs attention / Storage problem) from
  `nailOffline.counts` — the panel is already wired.
- Result: with no internet the screen opens, shows the queue, and barbers can sign in. Nothing can change yet.
- Done: barberApi.call/fetchBoard/identifyBarber (tests: barberApiOffline.test.ts), BarberHome request deadline +
  setNailOfflineStore + footer status, top offline banner hidden on /barber. Catalogue was already offline (snapshot).
  Offline sign-in does NOT clock the barber in yet (step 2 queues it).

### Step 2 — Check-in and taking a client offline
- Engine: new op `walkin.assign` (record: walk-in + `staff`) → sync sends `POST /markers/:id/assign`
  after the walk-in itself has synced (uses its `realId`). A server answer "already with someone else" goes
  to "needs attention", like nail's conflicts.
- Check-In (`CheckInLookup`) offline: `nailOffline.checkIn` / `createClient` / name-only walk-in (client 0),
  the same calls /nail's check-in makes; ticket number from `issueTicketNumber` (hub host numbers).
- `takeMarker` and Cancel (remove marker) offline: local record + queued op.
- Sync paths: the sync transport sends `/api/nail/...`; for a barbershop store it must send `/api/barber/...`
  (rewrite in `browserTransport` by the store's category, not by the page — sync also runs from other pages).
- ✅ LIVE 2026-11-02. Done as: engine `TakeRecord` (kind "take") + op `walkin.assign` (`takeWalkin`; cancel and
  discard of a walk-in take its take too; prune keeps a walk-in a pending take needs); `setStaffDoor`/`doorUrl` in
  lib/nail-offline (per-store localStorage flag, set by /barber; also used for queued turn adjusts);
  barber/offlineBoard.ts overlays takes on markers; barberApi assignMarker/removeMarker/fetchClient/clock in-out
  offline (clock = /nail's punch queue); CheckInLookup + clientLookup + createClient = /nail's offline versions;
  TN: slips + ticket # lookup from the board offline; badge/KP scans ignored by the ticket scanner. Server: marker
  assign idempotent + same-barber resend = OK. Tests: take.test.ts, barber/offlineBoard.test.ts, barberApiOffline.
- Not done: removing a client the SERVER already had while offline (says it needs the connection).

### Step 3 — Ringing up and cash checkout offline
- `createTicket` offline: `nailOffline.createTicket` with `walkinId` (the marker), `staff` = signed-in barber,
  priced from the tablet's catalogue (barber has no nail options, so simpler than nail).
- Barber `CheckoutMode`: port nail's offline checkout paths — CASH via `nailOffline.recordCash` (drawer shift by
  `collectedAt`), the $300 / $1,500 offline card limits, CARD through the M2 offline mode (offline_ref), and
  own-provider CARD allowed offline. Gift cards / loyalty stay online-only, as on /nail.
- Receipt prints from the tablet (salon clock, print settings) — same code nail uses.

### Step 4 — Several tablets: one queue over the local hub
- Wire `serveEngineOverHub` / `forwardEngineOverHub` (`remoteEngine.ts`) on /barber, as NailHome does, so a
  station's check-ins, takes and sales go to the hub tablet and every tablet shows the same queue.
- Add the new `walkin.assign` op to the remote engine's forwarded calls; two barbers taking the same client on
  two tablets → the hub answers the second one "already taken".
- Shared ticket numbers from the hub (`setTicketNumberSource`).

### Step 5 — Tests and a real offline run
- Engine tests for `walkin.assign` (order, conflict, retry) next to `engine.test.ts`; offlineBoard tests for a
  taken walk-in; sync path rewrite test.
- Run the offline acceptance harness (memory: offline-acceptance-harness) against a barbershop store.
- Device test: pull the router's WAN cable with 2 tablets + kiosk; check in, take, ring up, cash, M2 card,
  reconnect, confirm everything lands once (no double sales, ticket numbers kept).

## Server changes
- Small: barber door already reaches every nail endpoint via `/api/barber` → `/api/nail`. Needed:
  `POST /markers/:id/assign` must accept an idempotency key and a `ticketNumber`-carrying check-in, as
  `/checkin` and `/tickets` already do, so a resend after a lost answer doesn't fail.
- Nothing new in the database.

## Size and order
Step 1 ≈ 1 session, steps 2–3 ≈ 2 sessions, step 4 ≈ 1 session, step 5 alongside. Each step is deployed
when done; /barber keeps working online throughout.

## 2026-11-02 — superseded
The barber screen is now a full copy of /nail's code (pages/barber), so it has /nail's whole offline mode (check-in, ringing up, cash and offline card checkout, the hub). Steps 3–5 below are covered by that copy; only the barber "take a client" action (walkin.assign) is barber-specific.
