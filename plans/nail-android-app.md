# A nail-salon-only Android app

Audit of /nail, 2026-10-16. The question: what would it take to ship /nail as its own Android app, a version of Certxa made only for nail salons?

## The short answer

Most of it already exists. The current Android app, **certxa-owner**, already runs /nail for nail salons, and it already has the hardware a salon needs: card reader, receipt printer, cash drawer and offline mode.

What's missing is the "only for nail salons" part. Today, four buttons on /nail open the full Certxa website inside the app, with every feature in its menu, and sign-in and sign-up are the general Certxa ones. A nail app needs those parts to stay inside a nail-salon experience.

My recommendation is a second version of the existing app with its own name and icon. It would be locked to the nail screens and come with nail-only settings, so there's no new app built from scratch.

## What /nail does today

/nail is the whole front desk of a nail salon on one tablet:

- **Queue:** waiting clients, clients in service, appointments, walk-ins, no-shows and completed visits, plus the day's numbers across the top.
- **Technicians:** who's clocked in, the turn line, who's next, and setting staff available or on break.
- **Tickets:** create, assign by turn, start, add services, and check out with cash, card (M2 reader), gift card, loyalty or voucher.
- **Check-in:** a client lookup on the POS, plus a self check-in kiosk and a customer-facing screen on other tablets.
- **Booking:** book an appointment from the front desk.
- **Staff tools:** Tech ID sign-in and lock screen, My Slip (a technician's earnings), and the time clock.
- **Manager tools, behind a PIN:** key grid, cash drawer, Day Close, lock screen, printer, manager PIN, Settings, Messages and Reports.
- **Offline:** keeps working with no internet, and several POS tablets share one turn line over the salon's own Wi-Fi.
- **Languages:** English, Vietnamese and more, chosen per tablet.

It's about 6,500 lines of code in `artifacts/booking/src/pages/nail`.

## What the current Android app already provides

The certxa-owner app (`apps/certxa-owner`, package `com.certxa.owner`, version 1.0.3):

- **Wraps the website in a WebView:** it loads Certxa's sign-in page, which sends nail salons straight to /nail.
- **Three setups chosen at first launch:** POS, customer-facing screen (/frontdesk), or self check-in kiosk.
- **Card payments:** Stripe M2 reader and Tap to Pay.
- **Printing and cash drawer:** receipts, check-in tickets, tech slips and Z reports on Bluetooth or USB printers, plus the cash drawer kick.
- **Offline:** an encrypted database on the tablet, and the local hub that links the salon's tablets over Wi-Fi.
- **Kiosk lock:** the tablet stays in the app, restarts at 3 AM, and relaunches after a crash.
- **Updates:** JavaScript fixes go out over the air; native changes need a new build.
- **Distribution:** salons download the APK directly. A Play Store build profile exists but isn't in use.

All of this is what a nail app needs. None of it has to be rebuilt.

## Where /nail leaves the nail-salon world

These are the gaps between "Certxa in an app" and a nail salon product.

### 1. Four buttons open the full Certxa website

| Button on /nail | Opens | What the salon sees |
|---|---|---|
| More → Retail Sale | `/pos` | The general POS screen |
| Manager → Settings | `/settings` | Every Certxa setting, and the main menu with every Certxa feature |
| Manager → Messages | `/sms-inbox` | The general texting inbox |
| Manager → Reports | `/reports` | The general reports |

Once a salon taps one of these, they're in the full platform (calendar, marketing, website builder and so on) with no clear way back to /nail except the back button.

### 2. Sign-in and sign-up are general Certxa

- The app opens Certxa's general sign-in page.
- A new salon signs up through the general onboarding chat, which asks for a business type among other things.
- There's no "Certxa for nail salons" first-run experience.

### 3. The settings a nail salon owner needs are spread across the platform

| Setting | Where it lives today |
|---|---|
| Services, prices, add-ons | Full platform (Services) |
| Staff, roles, Takes turns, Tech IDs | Settings → Staff & Roles |
| Turn rules (dollar-based / counted) | The Turn page reached from /nail, plus settings |
| Tax, tips, cash discount, receipt | POS settings |
| Business hours, address, logo | Settings → Business |
| Check-in kiosk and customer screen | Settings → Check-in & Kiosk, POS Stations |
| Cash drawers | Settings → Cash Drawers |
| Card reader, payouts | Payments pages |
| Gift cards, loyalty | Their own pages in the full platform |
| Plan & billing | Settings → Subscription |

## Technical findings

These matter for any app version, and they're also worth fixing for /nail on its own.

1. **Opening /nail downloads the whole Certxa app first.** That's about 2.1 MB of script before the 146 KB /nail screen. It includes code for database tables (`vendor-drizzle`) that the browser never uses.
2. **/nail loads the calendar's code.** Six pieces of /nail (client lookup, manager PIN, time clock, turn page, voucher redeem, choose client) live inside `pages/Calendar.tsx`, an 11,488-line file. Moving them into `pages/nail` would make /nail lighter and safer to change.
3. **The live server holds 23,982 old script files** in `artifacts/api-server/dist/public/assets`. The rule is to delete files older than 14 days; that isn't happening, or not enough.
4. **Offline start works** through the service worker, which keeps a copy of the app for /nail, /kiosk and /frontdesk. But the app always fetches the page from the server first, so a slow connection means a slow start.
5. **Two screens share one engine.** /barber is a copy of /nail for barbershops, so whatever we build here could also produce a barbershop app.

## Options

### A. A nail version of the existing app (recommended)

Same code as certxa-owner, built a second way: its own name ("Certxa Nail" or similar), icon, package ID and start page. It runs only the nail screens: /nail, the kiosk and the customer screen.

- **Inside the app**, the Settings, Messages, Reports and Retail Sale buttons open nail-only versions, without the full Certxa menu.
- **Sign-up** asks only what a nail salon needs: salon name, address, technicians, services, Tech IDs.
- **Hardware, offline and kiosk mode** come along unchanged.

Effort: about 2–4 weeks. Most of it is the nail-only Settings, Reports and Messages screens and the nail sign-up. The app itself is mostly configuration.

### B. The nail screens built into the app

The same as A, except the /nail screens ship inside the app rather than loading from the website. It starts instantly and fully offline, and it doesn't depend on the server at all to open.

The cost: every /nail change then needs an over-the-air app update, not a website deploy. It's worth doing later if offline start becomes a problem; option A doesn't rule it out.

### C. Rewrite /nail as a fully native Android app

Not recommended. It means rewriting 6,500 lines and the offline engine, and keeping two versions of everything.

## Suggested order of work

1. **Clean up /nail:** move the six shared pieces out of `Calendar.tsx`, stop loading the code /nail doesn't use, and prune the old asset files. Every salon gets a faster /nail on day one.
2. **Nail-only manager screens:** Settings (services, staff, turn rules, tax and tips, hours, kiosk, drawers, card reader), Reports (day, technician, payouts) and Messages, all opening inside /nail without the full Certxa menu.
3. **Nail sign-up:** a short first-run flow for new nail salons.
4. **The app:** a second build of certxa-owner with its own name, icon, package ID and start page, locked to the nail screens. Then decide whether it goes on the Play Store or stays a direct download.

## Decisions needed from you

1. **The app's name** ("Certxa Nail", "Certxa for Nail Salons", something else) and whether it needs its own icon.
2. **Play Store or direct download.** The Play Store needs a store listing, screenshots and a privacy policy.
3. **Should existing nail salons on certxa-owner move to the new app,** or keep the one they have?
4. **What happens to "Retail Sale" (/pos):** a nail-only retail screen, or a retail mode inside /nail's checkout?
