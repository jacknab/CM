# Certxa apps: one app per business type

Started 2026-10-16. The goal: a separate Android app for each business type Certxa serves, starting with nail salons. Each app shows only what that kind of business needs, and is not "all of Certxa, opening on one screen". The audit behind this is in [nail-android-app.md](nail-android-app.md).

## The idea in one paragraph

Every app is the same Android shell (today's certxa-owner app) loading the same Certxa web app, but with a different **profile**. A profile is a short description of one business type's app: its name, icon, package ID, start screen, which screens it may open, which settings it shows, and its sign-up questions. Building the nail app means writing the nail profile and the pieces it needs. Building the barbershop app later mostly means writing the barbershop profile.

## The parts

### 1. App profiles (`shared/appProfiles.ts`)

One entry per app. For example:

```ts
nail: {
  name: "Certxa Nail",                // placeholder until the owner picks a name
  androidPackage: "com.certxa.nail",
  businessTypes: /nail/i,             // which salons this app is for
  home: "/nail",                      // where the app opens after sign-in
  screens: ["/nail", "/kiosk", "/frontdesk", "/app/settings", "/app/reports", "/app/messages"],
  settings: ["services", "staff", "turns", "pos", "hours", "kiosk", "drawers", "payments", "plan"],
  signup: "nail",
}
```

Both the web app and the Android build read this file, so the two can't disagree.

### 2. The Android shell builds one app per profile

- certxa-owner's fixed `app.json` becomes `app.config.js`, which picks the profile from `APP_PROFILE` at build time: name, icon, package ID, start page.
- Each app gets its own EAS build profiles (`nail-preview`, `nail-production`) and its own update channels, so an over-the-air update for one app never reaches another.
- Hardware support (card reader, printers, cash drawer), offline mode, the local hub and kiosk lock are shared by every app unchanged.
- The current certxa-owner app stays as it is: the all-of-Certxa app.

### 3. The web app knows which app it's running in

- The shell tells the page which profile it is: an `app=<id>` value on the first page load, kept on the device.
- **A screen guard:** a page outside the profile's `screens` list doesn't open. The app goes to the profile's home screen instead. No more landing in the full platform from a Settings button.
- Buttons that used to open full-platform pages (Settings, Reports, Messages, Retail Sale) open the app's own versions.
- Sign-in sends a salon of the wrong business type to a short "this app is for nail salons" message, with a link to the right app.

### 4. App-sized versions of Settings, Reports and Messages

These are built once and shown per profile, not rebuilt for every app:

- **App Settings (`/app/settings`):** a simple list that shows only the sections in the profile's `settings` list. Each section reuses the existing settings page for that topic; there's no second copy of any setting. It has no full-platform menu.
- **App Reports (`/app/reports`):** the day, technician, payouts and sales reports, without the platform menu.
- **App Messages (`/app/messages`):** the texting inbox without the platform menu.

### 5. Sign-up per business type

A short first-run flow for each app, driven by the profile's `signup` setting. For nail: salon name and address, technicians and Tech IDs, services and prices, and card reader setup. The business type is set by the app, never asked.

## Order of work

### Phase 1: make /nail lighter (no decisions needed)

- **Move the six shared pieces out of `pages/Calendar.tsx`:** client lookup, manager PIN, time clock, turn page, voucher redeem, choose client. They go into their own files, so /nail and /barber stop loading the whole calendar.
- **Stop shipping database-table code to the browser** (`vendor-drizzle`).
- **Prune the ~24,000 old script files** on the live server. The rule is files older than 14 days.

### Phase 2: the framework

- `shared/appProfiles.ts`, starting with the nail profile.
- The web side: profile detection, the screen guard, and app versions of the four buttons.
- The Android side: `app.config.js` with profiles, plus the EAS build profiles and update channels per app.

### Phase 3: nail app screens

- App Settings, App Reports and App Messages, showing the nail profile's sections.
- Retail Sale, depending on the owner's decision (see below).

### Phase 4: nail sign-up

### Phase 5: first nail app build

- A test build (APK) for a salon tablet.
- Then the owner decides between Play Store and direct download.

### Later apps

- **Barbershop:** /barber already exists, so it's a new profile plus its sign-up.
- **Hair salon, spa and the rest:** their home screen is the calendar, not a front-desk screen like /nail. Each needs a decision on its home screen before its profile is written.

## Decisions waiting on the owner

These are needed by Phases 3–5, not Phase 1.

1. **The nail app's name and icon.** "Certxa Nail" is a placeholder.
2. **Play Store or direct download.**
3. **Whether nail salons on the current app move to the nail app.**
4. **Retail Sale:** its own nail retail screen, or retail items inside /nail checkout.

## Progress

- 2026-10-16: plan written.
- 2026-10-16: Phase 1 done in code (commit `4809dc3d`), live after the next booking deploy:
  - The six staff-screen pieces moved to `components/staff-screen/`; `Calendar.tsx` went from 11,488 to 8,946 lines.
  - The browser uses `shared/apiPaths.ts`.
  - The core bundle is 2.08 MB → 1.63 MB, and /nail no longer loads the 242 KB calendar file. About 650 KB less to open /nail.
  - Old assets: none are older than 14 days. The 24,032 files (826 MB) come from deploy frequency (about 480 files per deploy). Suggestion for the owner: keep 3 days instead of 14.
