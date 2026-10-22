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
| B7 | **Touching a booking in the Day view starts a drag at once.** Scrolling the day with a finger on a booking moves it, though the hint says "Press and hold". | `DraggableAppointment` |
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

## 6. Questions for you

1. **Sales tax:** add tax at checkout on services? Many states don't tax services, so it could be off by default.
2. **Cash:** should the app record cash payments? It's free money for the pro but earns Certxa nothing.
3. **No-show and late-cancel fees:** charge the card on file automatically, or only when the pro taps "Charge fee"?
4. **Autumn in the app:** offer it as a paid add-on to free Solo users?
5. **Dead screens (B10):** remove Business AI, the old Availability entry and `ai.tsx`, or keep them as placeholders?
