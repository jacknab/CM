# /nail POS — one POS, server-first

Started 2026-10-28. Owner wants the /nail POS grid to work like a normal register, and every POS station in a salon
to see the same ticket live. Offline, the hub must do the same job.

## Why there are two POS screens today

- **Ticket builder** (NailHome.tsx + CatalogPanel.tsx `Keypad`): a draft kept only on that tablet until SAVE.
- **Checkout** (CheckoutMode.tsx): works only on a ticket the server already has (card charges and the
  "don't charge twice" key need a ticket id).
- They were made to look alike on 2026-10-07, but each has its own tap logic, and the two disagree (audit, 2026-10-27):
  same service twice ignored on the builder / added at checkout; add-on keys are real add-ons on the builder / a
  "+ name" price line at checkout; the automatic grid has no add-ons at all; packages fail at checkout ("Invalid
  service"); the keypads differ (builder ⌫ ↶ X/QTY, whole dollars; checkout ⌫ CLEAR ERC, cents).

## Owner decisions (2026-10-28)

1. **Everything is managed on the server**, so every station sees a change at once. Offline, the hub (main POS
   tablet) has to work the same way.
2. **A service the ticket's technician doesn't do** still becomes its own ticket for the next technician in turn,
   but that ticket's number is **temporary**: the client pays once, when every service is done. Opening checkout on
   ANY ticket of the visit combines all of the visit's tickets into one checkout.
3. **Keypad**: the builder's keypad (with QTY) everywhere. Amounts rung up are **whole dollars** (salon prices);
   the amount tendered at payment (cash) is entered in **cents**.
4. **No client**: allowed for **retail-only** sales. A no-phone Walk-In flow for services comes later (owner will
   revisit).

## Phases

1. **Same keypad + same grid on both screens** (client). Checkout uses the builder keypad (QTY); whole dollars
   for lines, cents when tendering. Every tap adds a line (the same service twice = two lines); QTY works with grid
   keys; the automatic grid gets an Add-ons key; add-on keys are real add-ons on both screens; packages work at
   checkout.
2. **Visit checkout**: opening checkout on any ticket of a visit (`ticket_group_id`) pulls in all its tickets;
   tickets split off for another technician share the visit's number (shown as #12-2).
3. **Server-first building**: the first tap creates the ticket on the server ("being rung up", not yet given to
   TURN); each change is a line operation (add / remove one line, by id), never a whole-ticket overwrite; SAVE
   hands it to TURN. Every station sees it live.
4. **Retail-only sale with no client.**
5. **Hub offline parity**: other stations send the same line operations over the hub to the main POS tablet, which
   applies them to its device copy and sends the board back to every station.

## Progress

- **Phase 1 built 2026-10-28 (not deployed, not clicked through on a tablet):** checkout keypad = builder layout
  (⌫ ↶ X/QTY); whole dollars while ringing up, cents once PAY is pressed (a typed "20" carries over as $20.00).
  Builder: every service tap adds a line (`ExtraService.lineId`), QTY works on grid keys (`gridQty`/`qtyReset`),
  add-on keys add (no toggle), a saved ticket's first service can be removed when it has another. Editing a saved
  ticket: service/package taps go straight to the server (`addTicketService`/`addTicketPackage`) and the edit
  reloads (asks for UPDATE first if there are unsaved changes). Grid gets an **Add-ons** category (`posGroups`, key
  `addons`, `CatalogGroup.addons`) on both screens; checkout now also gets Packages. New routes:
  `POST /api/nail/tickets/:id/addons`, `…/addons/remove`, `…/packages` (nailTickets `addAddonToTicket`,
  `removeAddonFromTicket`, `addPackageToTicket`); checkout add-on lines have a remove ×.
- **Phase 2 built 2026-10-28 (same):** a visit's further tickets reuse its number (`visitTicketNumber` on
  CreateTicketInput; group create, split, checkout add-service); board returns `visitPart` → shown as #12-2
  (`ticketNo()` in nailApi.ts). Lookup by number opens the visit's first ticket. Opening checkout on any ticket of a
  visit with tickets not started yet asks first ("Take payment for the visit now?"); checkout already links the
  visit's tickets (CheckoutMode `groupSeeded`); one with no technician can't be paid and stays open.
- **Owner follow-up 2026-10-28:** no "12-2" anywhere — every ticket of a visit shows the visit's number; typing it
  at lookup opens the visit (the ticket popup lists every service of the visit; TICKET opens the editable visit).
  A service is given to the visit's first technician when they can do it; only otherwise its own ticket. **DONE
  lock**: once DONE, a ticket's services/add-ons/package/nail options can't change without the manager PIN
  (server 423 `DONE_LOCKED`, header `X-Manager-Pin`, `doneLockRefusal` in routes.ts; client `useManagerOverride`).
  Retail / custom-amount lines stay allowed. Key Grid editor: **Add-ons key Show/Hide** (`PosGridConfig.hideAddonsKey`).
- **Phase 3 built 2026-10-28 (not deployed; server routes verified on the scratch test server, 24 checks; the
  screens themselves not clicked through):** migration 0263 `appointments.ringing_up_since` (applied automatically
  by the server at start). Online, the client's first service tap creates the ticket on the server "being rung up"
  (`ringingUp` on POST /api/nail/tickets; unassigned; the waiting-ticket matcher skips it; a check-in's handed-to
  technician is kept on the marker). Every later tap is a server change (services, add-ons, keypad lines, packages,
  removals, ↶ = remove last line) and the screen mirrors the board (another station's change shows at once).
  SAVE = `POST …/save` (`saveRingingUpTicket`: named/held tech, else TURN preferring one who does every service,
  then services they can't do split off — same number). CLEAR = `POST …/discard` (cancelled, check-in waiting
  again). Queue card says RINGING UP and opens in the POS. Assigning one from another station counts as saving it.
  Offline or a booking: the old on-tablet draft, unchanged.
- **Phase 4 built 2026-10-28:** retail-only sale with no client. Keypad is unlocked with no client, but only
  Retail items ring up; PAY → `POST /api/nail/retail-sale {staffId, lines}` (`createRetailSale`: no client, no
  service, retail lines, staff = the Tech ID signed in, service_price 0 + their rate so product commission accrues;
  marked ringing up so an unpaid one is discarded when its checkout closes). Paid through the normal
  /api/nail/checkout; turn bookkeeping skipped when a ticket has no service (the seller may be mid-service). Board
  names it "Retail sale"; checkout hides the empty service line. Needs a Tech ID sign-in (a salon with the lock
  screen off can't sell retail-only yet). Verified on the scratch server (paid, $1.20 commission at 10%, turn line
  untouched, discard works).
- **Deployed 2026-10-28 ~01:45 and ~02:05 UTC** (Phases 1–4) from a clean copy of HEAD 65e49bfb + only the /nail
  changes — other uncommitted work in the tree (contractor payouts, payroll runs, Stripe webhook, marketing, QR-code
  routes, lock-screen keypad setting, text-ready opt-out removal) was NOT deployed. Exact deployed diff:
  session scratchpad `deployed-2026-10-28b.patch`. API backups: dist/index.mjs.bak-1793151812 (before Phase 1–3),
  .bak-1793152587 (before Phase 4). NOT committed (owner hasn't said how).
- **Phase 5 built + deployed 2026-10-28 (~02:30 UTC, web only), owner chose "main POS stands in for the
  server":** `lib/nail-offline/remoteEngine.ts`. The main POS (`hubRole` "pos") runs `serveEngineOverHub` — it does
  stations' offline engine calls (`hub_engine_call` → `hub_engine_result`) and says `hub_engine_changed` whenever its
  engine changes. A station runs `forwardEngineOverHub` while offline AND linked (`localHub.getStatus() ===
  "connected"`): createClient / checkIn / createTicket / assign / start / cancel / editLocal / changeServerTicket /
  recordCash go to the main POS; `records` / `findClients` = the main POS's plus anything the station holds itself.
  A record the station holds itself is changed on the station; main POS unreachable (6 s, or send fails) → the
  station works alone as before. Only the main POS has the work, so only it syncs it. Turn events use
  `engine.localRecords` (never forwarded) so a station doesn't repeat the main POS's events. 6 unit tests
  (remoteEngine.test.ts, fake in-memory hub). NOT tested on two real tablets with the internet off.
  Deployed diff: scratchpad `deployed-2026-10-28c.patch`.
