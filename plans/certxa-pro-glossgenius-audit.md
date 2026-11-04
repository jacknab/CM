# Certxa Pro vs GlossGenius: audit and gap list

Written 2026-10-22. The app source is `certxa-pro-replit/staff-app-latest/artifacts/certxa-pro` (about 6,000 lines, 15 screens). Its server side is `artifacts/api-server/src/routes/certxaPro.ts` plus the normal Certxa web API.

GlossGenius reference: their features page (glossgenius.com/features, read 2026-10-22). Plans: Standard $24, Gold $48, Platinum $148 a month. Certxa Pro is free and earns from card payments.

---

## 1. What the app has today

| Area | What works |
|---|---|
| Account | Sign up, which creates a free Solo account with starter services. Sign in. Delete account. |
| Get paid | Stripe Connect onboarding inside the app. The business address is asked for first. A setup banner shows until card payments are ready. |
| Calendar | Day view with drag-to-move: snaps to 5 min, checks for clashes, overlapping bookings side by side. Week and Month views. Shows only the owner's own calendar. |
| New booking | 4 steps: client (phone keypad or name/e-mail search, or add a new client), several services, add-ons, then real open times from the server. House calls with the client's address and travel fee. |
| Appointment | Details screen. Edit date, service and status. Mark as paid. Delete. Open the client's address in Maps. |
| Checkout | Tip screen (none / 15 / 20 / 25 % / custom), discount (preset % or $ off), Tap to Pay or Stripe M2, one-time M2 registration. Checks that the appointment isn't already paid. Recovers a card that was charged but not finalized. |
| Clients | List, search by name, add with name and phone. Detail screen with a Book button. |
| Services | Add, edit and delete services (Settings → Services). |
| Reviews | List reviews and reply to them. |
| Settings | Business details, location, where you see clients (salon, home studio, house calls, address privacy), hours, booking rules (who can book, notice, how far ahead, start times, gaps, online cancelling), cancellation policy text, blocked numbers, website link and share, text/e-mail reminders and review requests, Stripe status, card readers, sales tax, account. |
| Push | Notifications when a client books, cancels or moves a booking. Tapping one opens the calendar. |

## 2. Fixed today (2026-10-22)

1. **Card payments left out add-ons and extra services.** The server's appointment list sent only the main service and the travel fee. The app charges what the calendar shows, so a client with $30 of add-ons was charged $30 less. Example: appointment #93 on store 2. Fixed in `certxaPro.ts`; live now.
2. **Services were missing "offered at".** A service done only at the client's home didn't force a house call when booked in the app. Fixed on the server; live now.
3. **The calendar showed made-up clients.** On an empty day, or when the server couldn't be reached, the Day view filled in four sample appointments ("Maya Thompson", "Jordan Lee"…) that looked real. Removed: an empty day now says the schedule is open.
4. **Week view said "Open schedule" on booked days.** Month dots appeared on every day whether or not anything was booked. The app now loads the whole month, so both views show real bookings.
5. **Text / Call / Email on an appointment never worked.** The client's phone and e-mail weren't passed to the screen, so every tap said "Contact details unavailable".
6. **More showed version 1.0.5.** It now reads the real version (1.0.6).

Fixes 3–6 are in the app (Pro repo commit `b855cee`, build label "Oct 22 · A"). They need a new iOS build from your terminal, and the Pro repo still needs pushing.

## 3. Broken or unfinished in the app (not fixed: each needs a decision)

| # | Problem | Where |
|---|---|---|
| B1 | **Sales tax isn't charged.** Settings → Sales tax says "Tax added at checkout", but checkout never adds it. | `checkout.native.tsx` |
| B2 | **No cash or other payment at checkout.** Checkout only offers card. "Mark as paid" sets the status but records no amount or method, so cash income never reaches reports. A "gift card / record manually" screen exists in the code but can't be reached, and it saves nothing to the server. | `checkout.native.tsx`, `appointment/[id].tsx` |
| B3 | **No receipt.** Nothing is texted or e-mailed after payment, though the server has `/api/pos/sms-receipt` and `/api/pos/email-receipt`. | checkout |
| B4 | **The Notes row opens the edit screen, which has no notes field.** Notes can't be added or changed in the app. | `appointment/[id].tsx` |
| B5 | **Moving a booking from the edit screen offers six fixed times** (9:00, 10:30, 12:00, 2:00, 3:30, 5:00), not real open times. Already in `pre-errors.md`. | `appointment/[id].tsx:11` |
| B6 | **"Notify client" after a drag does nothing.** Already in `pre-errors.md`. | `(tabs)/index.tsx` |
| B7 | **FIXED 2026-10-22 (Pro `Calendar: fixed header…`):** the calendar page now has a fixed header, only the timeline scrolls, and dragging starts after a press-and-hold. Before: **touching a booking in the Day view started a drag at once.** Scrolling the day with a finger on a booking moves it, though the hint says "Press and hold". | `DraggableAppointment` |
| B8 | **Client profiles are empty.** Every client shows "0 visits · — lifetime spend · Certxa client". There's no visit history, upcoming bookings, editing, e-mail or notes editing. Duplicate names break the list (it uses the name as the key). | `(tabs)/clients.tsx`, `BookingContext.tsx` |
| B9 | **No cancel or no-show.** Only Delete, which removes the booking for good. The server has `POST /api/appointments/:id/cancel` with a notify-client option. | `appointment/[id].tsx` |
| B10 | **Dead or misleading screens.** More → Availability is locked with "Manage in Certxa web settings", though Settings → Business hours works in the app. A preview-only availability screen is still in `more.tsx`. More → Business AI is locked. `app/ai.tsx` is unused and full of made-up numbers ("Hi Tom… revenue is up 18%"). More → Payments says "Stripe M2 ready" before any reader is set up. | `more.tsx`, `ai.tsx` |
| B11 | **The website can't be edited** (name, cover photo, look). The app only shares the link. | Settings → Website |

## 4. Gaps vs GlossGenius

"Server" says whether Certxa's server already has it, so only the app screens are needed.

### Booking and calendar
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| Deposits at booking | Missing in app | **Yes** (`bookingPayments.ts`) |
| Card on file, cancellation and no-show fees | Missing (no fee charging anywhere) | Card on file yes; fee charging no |
| Booking approval (request to book) | Missing (Solo step 5, planned) | Data only (`booking_requests`) |
| Waitlist | Missing | **Yes** (`/api/waitlist`) |
| Block personal time / time off | Missing | No (no time-off table found) |
| Recurring appointments | Missing | No |
| Processing time and gap time per service | Missing (one global gap) | Partial |
| Rebooking reminders | Missing | Partial (lapsed-client scheduler) |
| Reserve with Google | Missing | No |
| Book from Instagram / social | Link sharing only | Booking site exists |

### Payments, POS and payouts
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| Tap to Pay and card reader | **Have** (Tap to Pay, M2) | Yes |
| Any payment type, split payments | Card only (B2) | Web POS has it |
| Automatic sales tax | Missing (B1) | Yes (`pos-settings`) |
| Customizable tip presets | Fixed 15/20/25 % | **Yes** (`/api/tip-presets`) |
| Text / e-mail receipts | Missing (B3) | **Yes** |
| Refunds | Missing | Yes (Stripe) |
| Payment links / text to pay, invoices | Missing | Partial (`bookingPaymentLinks.ts`) |
| Retail products and inventory, barcode scan | Missing | Products table exists |
| Next-day and instant payouts, balance view | Missing (no payouts screen) | Instant payout in `stripeConnect.ts` |
| Transactions list | Missing (the "recent payments" list is only in memory and can't be reached) | Yes |

### Clients and forms
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| Client profile: history, spend, upcoming | Missing (B8) | Yes (web client pages) |
| Notes, before-and-after photos | Missing | Notes yes; photos partial (`staffWorkPhotos`, `galleryPhotos`) |
| Smart forms and waivers | Missing | **Yes** (`/api/intake-forms`) |
| Import phone contacts | Missing | Server import exists (`dataTransfer.ts`) |
| Two-way texting with clients | Missing | **Yes** (`/api/sms-inbox`) |
| Blocked clients | **Have** | Yes |

### Marketing and growth
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| E-mail and SMS campaigns (AI-written) | Missing | Yes (`/api/campaigns`; campaign SMS is charged to the allowance) |
| Automated birthday and win-back messages | Missing | **Yes** (birthday and lapsed-client schedulers) |
| Review requests and replies | **Have** | Yes |
| Social media templates, photo reminders | Missing | No |
| Gift cards | Missing | **Yes** (`/api/gift-cards`) |
| Memberships and packages | Missing | Packages yes (web catalog); memberships no |
| Loyalty | Not in GlossGenius | **Yes**: a Certxa advantage if added to the app |

### Reports
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| Weekly report ("GrowthGenius"), goals | Missing | Partial (`dashboard.ts`, `intelligence.ts`) |
| Sales, tips, tax, transactions reports | Missing (the app has no reports at all) | Yes (web) |
| Retention, most valuable clients | Missing | Partial (`/api/clients/at-risk`) |
| Expenses | Missing | No |

### Website and AI
| GlossGenius | Certxa Pro | Server |
|---|---|---|
| Customizable site, cover photo, colors, portfolio, reviews | Share link only (B11) | Yes (booking themes, `websites.ts`, gallery) |
| AI receptionist | Missing in app | **Yes**: Autumn (paid plans) |
| AI growth/marketing agent | Locked placeholder | Partial (`intelligence.ts`) |

### Things Certxa Pro does that GlossGenius's page doesn't list
- Free app (GlossGenius starts at $24 a month).
- House calls with a service radius, travel fee and travel time blocked out.
- A private home-studio address.
- Autumn, the AI phone receptionist, already built server-side.
- Loyalty points.

## 5. Suggested build order

Ordered by what makes money for Certxa (card volume), then what a solo pro notices daily.

1. **Finish checkout:** sales tax (B1), receipts (B3), adjustable tip presets, cash or other payments that the server records (B2), and refunds. This is the revenue path.
2. **Appointment basics:** cancel and no-show instead of delete (B9), notes (B4), real open times when moving (B5), notify client (B6), and press-and-hold to drag (B7).
3. **Client profiles:** history, spend, upcoming, edit, notes (B8).
4. **Deposits, card on file and no-show fees** in online booking. This keeps pros' income safe and pushes more card volume.
5. **Booking approval** (Solo step 5, already planned in `plans/solo-resume.md`).
6. **Block time / time off, and recurring appointments.**
7. **Money screen:** payouts, balance, instant payout, transactions list, and a simple sales report.
8. **Gift cards, intake forms and texting inbox.** The server has all three, so these are app screens only.
9. **Marketing:** automated birthday and win-back messages, then campaigns.
10. **Website editing** in the app, then Reserve with Google.

## 6. Decisions (owner, 2026-10-22)

1. **Sales tax:** off by default. It's already off for new accounts (rate 0, tax on services off). Checkout adds tax only when the pro turns on tax on services in Settings → Sales tax.
2. **Cash:** not recorded. The cash goes straight to the pro, so "Mark as paid" is the cash button. B2 is closed as intended; the unreachable manual-payment screen stays unused.
3. **No-show and late-cancel fees:** charged only when the pro taps a button, never automatically.
4. **Autumn:** a paid add-on in the app.
5. **Placeholder screens (B10):** kept. Business AI, Availability and `ai.tsx` will be made real soon.

## 7. Progress

- **2026-10-22, step 1 (checkout):**
  - Done: the sales tax line (only when turned on), the pro's own tip presets (Certxa default 15/18/20/25) and text or e-mail receipts after a card payment (Pro repo).
  - The e-mail receipt endpoint now uses the signed-in store and its real name, and escapes everything it puts into the e-mail. Before this, any signed-in account could send a receipt e-mail under another business's name with its own HTML.
  - Still to do in step 1: refunds. There's no Terminal refund endpoint yet.

---

## 8. Pre-build audit, 2026-11-03

### How it was tested
- Typecheck of the app and the API: clean. `expo-doctor`: 20/21 → **21/21** after updating 7 Expo packages to the
  SDK 57 patch versions (`npx expo install --fix`; e.g. expo 57.0.25 → 57.0.31, expo-router 57.0.23 → 57.0.29).
- Every screen (26 routes + all 14 Settings sections) opened in a browser build signed in as store 41, watching for
  script errors and failed API calls: **0 errors, 0 failed calls** after the fixes below.
- Every GET the app makes (38 endpoints) called with the app's token: all 2xx, all under 0.5 s.
- Another business's client, notes, appointment and visit history with this account's token: refused (404/403);
  writes to them refused.
- Paid-booking lock: move, cancel, delete, add-ons on a paid booking all refused (409), booking unchanged.
- Business AI: six live questions (earnings, clients not back, text draft, change proposed + cancelled, booking move
  refused, how-to); answers matched the data; fact checks stored.

### Found and fixed in this audit
1. **Browser version had no icons and no Inter font** (pro.certxa.com): the server's static handler ignores folders
   starting with a dot, and Expo puts fonts under `.pnpm/`; it served the page instead. `dotfiles: "allow"` for that
   build folder only.
2. **The automatic client summary invented no-shows and used an old name** ("Me has no-showed a few times before" for
   Linda Parker, who has none and was renamed). It now gets the real no-show count, may not mention no-shows when
   there are none, uses the business's real type (not always "nail salon"), and is rewritten after a rename.
3. **Credit package prices** were on a leftover teal label → theme violet.
4. **Calendar** day strip and Week view now start with today (owner request).
5. Expo patch versions (above).
6. **Moving a booking with "Notify client" on (the default) always failed** with "Invalid input": the app's move route
   (certxaPro.ts) didn't accept `notifyClient` and never sent the text. Now accepted; a real move is logged as
   "rescheduled" and the client gets the reschedule text, like the website's route. Tested with a throwaway booking.

### Status of the October list (section 3)
| # | Then | Now |
|---|---|---|
| B1 Sales tax | missing | Done 10-22 |
| B2 Cash | — | Closed by decision ("Mark as paid") |
| B3 Receipts | missing | Done 10-22 (text/e-mail) |
| B4 Notes | couldn't add | Done (notes screen, pins) |
| B5 Move times | fixed list | 15-minute list 6 AM–10 PM, server refuses clashes — acceptable |
| B6 Notify after drag | did nothing | Fixed 11-03 (the move itself was failing; now moves and texts) |
| B7 Drag | started at once | Done (press and hold) |
| B8 Client profiles | empty | Done 11-03 (full CRM) |
| B9 Cancel / no-show | Delete only | **Still missing** — see below |
| B10 Placeholders | locked | Business AI real; Availability and Payments rows removed from More |
| B11 Website editing | link only | Done 10-23 (link, design, look) |

### Certxa Pro vs GlossGenius now
GlossGenius: Standard about $24–28, Gold $48–56, Platinum $148–168 a month (2026 sources disagree; prices rose in
April 2026), no free plan. Certxa Pro: free, earns on card payments; Plus $3/month for free notification texts.

**Certxa Pro has (parity or better):** Tap to Pay on iPhone + Stripe M2, tips, tax, text/e-mail receipts, refunds,
deposits (asked after approval when approval is on), booking approval with offered times, online booking site with
designs and own link, client CRM (status, tags, notes, allergies, VIP, visit rhythm, marketing consent), reviews and
replies, push notifications, business AI with real numbers and confirm-to-change, house calls with radius/fee/travel
time, private home-studio address, loyalty points, Autumn AI receptionist (server), paid bookings locked.

**Still missing vs GlossGenius (by value to a solo pro):**
1. **Cancel and no-show** instead of Delete, with the no-show/late-cancel fee button (decided 10-22: fee only when
   the pro taps). Server has `/api/appointments/:id/cancel`. Without it, no-show counts in the CRM stay at 0.
2. **Money screen:** payouts, balance, instant payout, transactions list, simple sales report (Home shows today only;
   Business AI can answer, but there's no screen).
3. **Block personal time / days off** (the old preview-only screen saved nothing).
4. **Card on file** at booking (server partly has it).
5. **Two-way texting inbox** (server `/api/sms-inbox`), **intake forms** (server `/api/intake-forms`), **gift cards**
   (server `/api/gift-cards`) — app screens only.
6. Recurring appointments, waitlist, before/after photos, import phone contacts, payment links, memberships,
   marketing campaigns and automated birthday/win-back texts in the app.

### Before the iOS build
- Build label is "Build Nov 3 · I"; version in app.json unchanged (bump if App Store needs a new version).
- Untested on a real device today: Tap to Pay, M2, push, Messages/phone/e-mail links from the client profile and
  Business AI drafts, the time-wheel sheet, dropdown sheets with the iOS keyboard.

## 9. Build, 2026-11-03 (after the pre-build audit; app build label "Build Nov 3 · J")
1. **Cancel and no-show** (B9): Cancel (with or without a text to the client, the text is now really sent) and No-show
   replace Delete on an open booking; a cancelled/no-show booking offers Rebook, the fee button, and Delete. Fee
   (decision 10-22: only on tap): the shop's % (Settings › Cancellation policy, new field) of the booking, charged
   to the client's saved card, once (migration 0294 fee_* columns; POST /api/appointments/:id/no-show, /fee).
   Cancelled bookings leave the calendar; no-shows stay, labelled.
2. **Money screen** (More › Money): sales today/week/month, on its way to the bank + next payout, recent payouts,
   this month's payments — all existing endpoints.
3. **Block time / days off** (calendar +): time_blocks (migration 0295), grey blocks on the day view (tap to
   remove), online booking offers no time inside a block (verified: 9 open times → 0 → 9).
4. **Card on file**: "Save their card (no charge)" is now a normal choice in Settings › Deposits.
5. **Messages** (two-way texting) and **Gift cards** (sell, use, balances) screens. Gift card POST now validates
   the amount (a missing one was a 500).
   **Intake forms: not built** — nothing in Certxa shows a form to a client (no public form page, no booking step
   submits answers, 0 responses ever stored). Needs the client side first.

## 10. Build, 2026-11-03 later (app build label "Build Nov 3 · K")
- **Win-back texts** (owner: yes; birthday texts: not wanted): lib/winBack.ts replaces lapsed-client-scheduler.ts (it
  never sent anything — stale visit columns — and would have re-texted daily). Settings › Client notifications switch +
  "after N days"; one text per absence, marketing opt-in only, 10 AM shop time, advisory lock.
- **Payment links**: "Text a payment link" on an open booking → certxa.com/pay/<token> (routes/payLinks.ts, migration
  0296) — card on the business's own Stripe account, $0.60 fee; booking then marked paid (review text follows).
- **Recurring bookings**: booking flow "Repeat" (every 1–4 weeks, 2–12 times); POST /api/appointments/:id/repeat skips
  clashes and blocked time and lists them.
- **Before/after photos**: client profile Photos (client_photos, migration 0297; private). Owner 11-03: photos go to the
  pro's own Certxa website, never assume Google → "Show on website" puts one in the website gallery; **Portfolio**
  screen (More) adds work photos to it. The public gallery endpoint Bloom asks for (/api/public/store/:slug/gallery)
  never existed — added. Later: auto-post to Facebook Page / Instagram (see below).
- **Waitlist** screen (More): add, book now, text, remove; push to the owner when a client cancels online on a day
  someone is waiting for.
- **Import phone contacts** (Clients › + › Import): expo-contacts added (native → needs the build).
- **Campaigns** (More): text to all / lapsed 60 / lapsed 90. Server fixes: campaign texts went to clients who had
  opted out of marketing texts; {{bookingLink}} used a Replit dev domain; Solo accounts were always refused (no wallet)
  — now they use their text credits.
- **Not built yet:** memberships (needs decisions: perks, billing), intake forms (no client side exists).

**Facebook / Instagram auto-post (later):** Facebook only lets apps post to a business *Page* (not a personal
profile), with the pages_manage_posts permission after Meta App Review. Instagram's Content Publishing API posts photos
to Business/Creator accounts (Instagram login, instagram_business_content_publish, App Review). Both: the pro connects
their account once in the app, then a photo marked "Show on website" can also go to their Page/Instagram.
