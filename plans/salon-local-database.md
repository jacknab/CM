# The salon's account on the tablet: a full local copy, kept in sync

Started 2026-10-17. Owner's goal: the /nail app keeps working through an internet outage without the salon noticing.
For that, the tablet must hold its own copy of the salon's account (every table and row the salon uses) and keep it
in sync with the server whenever it is online. Today it holds hand-picked pieces (the offline snapshot, the ticket
archive, offline work waiting to be sent), and each offline feature needed its own piece.

## What exists

- **On the tablet:** one encrypted SQLite file (SQLCipher, key in the Android Keystore) owned by the app
  (`apps/certxa-owner/lib/localDb.ts`, app 1.0.2+). It stores rows of (store, key, value) only, reached from the
  web screens through the `LOCAL_DB` bridge (`booking/src/lib/nail-offline/nativeKV.ts`).
- **On the server:** 156 tables carry `store_id`; only 62 of them have `updated_at`, and deletes leave no trace. So
  "what changed since the tablet last looked" can't come from the tables themselves.

## Design

1. **A change log on the server.** Each table that belongs to a salon gets a trigger that, on every insert,
   update and delete, appends `(seq, store_id, table, row id, op)` to a `store_changes` table. `seq` is one
   number that only goes up, so a tablet only has to remember the last one it applied.
2. **Two sync endpoints.**
   - **First copy:** every included table for the salon, a page at a time, ending with the `seq` it is current to.
   - **Changes:** everything after the tablet's `seq`, as the current row (or "deleted"), a page at a time.
3. **On the tablet:** a real copy of each table inside the same encrypted file (`rows(table, id, data JSON)` with
   indexes on the columns the screens search by: client phone, appointment date and client, ticket number).
   It syncs on open, every minute while online, and the moment the connection comes back.
4. **Reads move over one by one.** Offline, each /nail screen reads from the local copy instead of saved
   answers: the client lookup, the board, the catalogue, staff and turns, bookings, receipts. Writes keep going
   through the existing queue of offline work, which is sent and then confirmed by the change feed.
5. **Delivered as an app update, no new build.** `expo-sqlite` is already in the app (1.0.2+), so the new tables
   and queries are JavaScript.

## Decisions for the owner

- **Which tables.** Proposed: every table a salon uses for its daily business (clients, bookings, tickets,
  catalogue, staff, turns, payments, gift cards, loyalty, cash drawer, payroll records). **Not copied:**
  passwords, sign-in tokens and keys, connected-account secrets, and large logs that offline work never needs
  (SMS and call logs, AI call recordings, analytics events).
- **Size.** A busy salon's full history can be large. Proposed: everything current (clients, catalogue, staff,
  settings, open tickets) in full, plus the last 12 months of visits and sales; older history stays online-only.

## Phases

1. Change log + triggers (migration), first-copy and changes endpoints, tests.
2. Local tables and sync on the tablet; a status line in the manager menu (rows copied, last sync).
3. Move offline reads, screen by screen, starting with the client lookup and the board.
4. Retire the old hand-picked pieces (snapshot, client phone cache, ticket archive) once nothing reads them.

## Progress

- 2026-10-17: plan written. Owner said yes to both proposals (no secrets or big logs; 12 months of history).
- 2026-10-17: **Phase 1 done** (`cfc2356a`): `lib/storeMirror.ts` (68 tables, stripped columns), migration 0249
  applied (store_changes + 68 triggers, dry-run in a rolled-back transaction first), `/api/offline/mirror`
  (tables/rows/changes), 30-day log trim. Store 2 = 2,762 rows, ~900 KB.
- 2026-10-17: **Phase 2 done**, phase 3 started:
  - App (`apps/certxa-owner/lib/localDb.ts`): `mirror` + `mirror_state` tables, indexes on customer_id /
    client_id / appointment_id / staff_id / service_id, `mirrorApply|Get|Find|All|Count|State`; bridge flag
    `CERTXA_NATIVE_LOCAL_DB = 2`; manager menu shows records held and last sync. Needs an app update (OTA).
  - Web (`booking/src/lib/salon-mirror.ts`): first copy (resumable), changes, resync, deleted parents take their
    children; runs on /nail and /barber every minute and on reconnect. Tests: `salon-mirror.test.ts`.
  - Phase 3: the Clients sheet reads the copy offline (profile, email, points, allergies, visits).
- 2026-10-17: **Phase 3.** Finding: every /nail read already keeps the server's last answer on the tablet, and
  the board, catalogue and turn line are re-kept on every refresh, so offline they are as fresh as the copy —
  moving them gains nothing. The gaps were reads never made while online. `pages/nail/mirrorAnswers.ts` builds
  those from the copy, in the server's shape, when there is no kept answer: a client (with points), a
  service's nail options, the upcoming list; phone lookups use the copy first (synced every minute, not 30).
  Tests: `mirrorAnswers.test.ts`.
- **Phase 4 waits** until every tablet has the app update with the copy: the old pieces (snapshot, phone
  cache, ticket archive) are what tablets without it use.
