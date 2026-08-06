# Certxa Owner — Android App

The Certxa Owner app is a native Android application for salon/service business owners. It wraps the existing Certxa web portal in a full-screen WebView so owners get the complete management interface (calendar, clients, staff, reports, settings, etc.) without rebuilding every screen natively. The **only** native exception is the POS checkout sheet, which runs fully native to support Bluetooth card readers (Stripe M2) and Tap to Pay (Android NFC).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Android App Shell                     │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Full-Screen WebView (always mounted)      │  │
│  │                                                   │  │
│  │   Loads: https://certxa.com                       │  │
│  │                                                   │  │
│  │   All standard portal screens:                    │  │
│  │   • Calendar / Appointments                       │  │
│  │   • Clients & Walk-ins                            │  │
│  │   • Staff Management                              │  │
│  │   • Reports & Analytics                           │  │
│  │   • Settings (all)                                │  │
│  │   • Marketing / SMS                               │  │
│  │   • Subscriptions / Billing                       │  │
│  │   • Every other owner page                        │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │      Native POS Modal (slides over WebView)       │  │
│  │                                                   │  │
│  │   Triggered when owner taps Checkout              │  │
│  │   • Cash (numpad, auto change calculation)        │  │
│  │   • Card (manual record)                          │  │
│  │   • M2 Bluetooth reader (Stripe Terminal)         │  │
│  │   • Tap to Pay / NFC (Stripe Terminal)            │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## How the WebView Bridge Works

The app injects a small JavaScript bridge into every page load. This bridge:

1. **Sets `window.CERTXA_NATIVE_APP = true`** — the web portal checks this flag in `handleCheckout()`. When true, it posts an `OPEN_POS` message instead of opening the React checkout sheet.

2. **Exposes `window.__certxaRPC(id, endpoint, method, body)`** — the native layer calls this to make authenticated API requests through the WebView's session cookie. This is how Stripe Terminal gets its connection token: the native SDK calls `tokenProvider`, which calls the API via the WebView's authenticated session. No duplicate login required.

3. **Exposes `window.__certxaFinalizeAppointment(id, method, amount)`** — called by the native layer after a successful payment. Patches the appointment to `completed` and dispatches a `certxa_native_payment_complete` DOM event. The Calendar page listens for this event and refreshes its data.

```
WebView (logged-in session)          Native POS Layer
         │                                  │
         │  user taps Checkout              │
         │─────────── OPEN_POS ────────────▶│  shows POSModal
         │                                  │
         │  user pays via M2/Tap            │
         │◀──── __certxaRPC(connectionToken)│  fetches token
         │◀──── __certxaRPC(createPI)       │  creates payment intent
         │◀──── __certxaRPC(capturePI)      │  captures after confirm
         │                                  │
         │◀─ __certxaFinalizeAppointment ───│  marks appt complete
         │  dispatches custom DOM event     │
         │  Calendar refreshes              │
```

---

## Tablet Support

On tablets (screen width ≥ 768px), the app injects a `width=1280` viewport meta tag. This forces the web portal to render at desktop width — identical to what an owner would see in a browser. On phones, the default responsive viewport is used.

---

## Stripe Terminal Integration

The app uses `@stripe/stripe-terminal-react-native` (v0.0.1-beta.31, the latest available).

### M2 Bluetooth Reader
1. `discoverReaders({ discoveryMethod: 'bluetoothScan' })` starts scanning
2. First discovered reader is captured via `onUpdateDiscoveredReaders` callback
3. `connectReader({ discoveryMethod: 'bluetoothScan', reader, locationId })` connects
4. Payment intent created on server → `collectPaymentMethod` (tap/swipe/insert) → `confirmPaymentIntent` → server-side capture

### Tap to Pay (Android NFC)
1. `easyConnect({ discoveryMethod: 'tapToPay', locationId })` — single call handles everything (discovery + connection)
2. Same payment flow: create PI → collect → confirm → capture

### Terminal Location
The server endpoint `GET /api/payments/terminal/location` creates or retrieves a Stripe Terminal location for the store's connected Stripe account. Locations are tagged with `metadata.certxa_store_id` so they're reused across app sessions.

### Requirements for Stripe Terminal
- The store must have a connected Stripe account (set up in Payment Settings)
- M2 reader requires: Android 8.0+, Bluetooth enabled, location permission granted
- Tap to Pay requires: Android 6.0+, NFC enabled, device NFC support
- Both require: a native EAS build (will not work in Expo Go)

---

## Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `EXPO_PUBLIC_PORTAL_URL` | `eas.json` → baked at build time | URL the WebView loads. Set to `https://certxa.com` for all production builds. |
| `OWNER_APP_PORTAL_URL` | Server `/etc/certxa.env` | Override for the startup script (development use). |
| `NGROK_AUTHTOKEN` | Server env | Optional. Enables ngrok tunnel for physical device testing against Replit dev server. |

The URL hierarchy in the startup script (`scripts/owner-app-start.sh`):
1. `OWNER_APP_PORTAL_URL` (explicit override)
2. `REPLIT_DEV_DOMAIN` (Replit dev environment)
3. `APP_URL`
4. Hardcoded fallback: `https://certxa.com`

For EAS builds, `EXPO_PUBLIC_PORTAL_URL` is baked into the JavaScript bundle at build time via `eas.json`, so the startup script is irrelevant for built APKs.

---

## Building & Testing

### Prerequisites

```bash
# Install EAS CLI globally on your development machine
npm install -g eas-cli

# Log in to your Expo account
eas login

# Link the project to your Expo account (first time only)
cd apps/certxa-owner
eas build:configure
```

### Step 1 — Preview APK (for sideload testing)

```bash
cd apps/certxa-owner
eas build --platform android --profile preview
```

- Builds in the cloud (no local Android SDK needed)
- Produces a signed `.apk` file
- EAS prints a **download link** when done (also available at expo.dev)
- Takes ~10–20 minutes for a first build; faster for subsequent builds due to caching

### Step 2 — Install on Android Device

1. Download the `.apk` from the EAS link (or scan the QR code in your Expo dashboard)
2. On your Android device: **Settings → Apps → Special App Access → Install Unknown Apps**
3. Allow your browser or Files app to install APKs
4. Open the downloaded `.apk` — tap Install
5. The app appears on your home screen as **Certxa**

### Step 3 — Test Checklist

- [ ] App opens and loads `https://certxa.com` in the WebView
- [ ] Login works and session persists across navigations
- [ ] All portal pages load correctly (Calendar, Clients, Staff, Reports, Settings)
- [ ] Tablet viewport: portal renders at desktop width on tablet
- [ ] Checkout → M2: Bluetooth scan finds reader, payment processes end-to-end
- [ ] Checkout → Tap to Pay: NFC payment processes end-to-end
- [ ] Checkout → Cash: numpad works, change calculated, appointment marked complete
- [ ] After payment: calendar refreshes, appointment shows as Completed
- [ ] Error handling: reader out of range shows clear error with Retry button
- [ ] Back gesture works within WebView (browser history navigation)

### Step 4 — Staging Build (optional)

If you have a staging server:
```bash
eas build --platform android --profile staging
```
Update `EXPO_PUBLIC_PORTAL_URL` in `eas.json` → `staging` → `env` to your staging URL first.

### Step 5 — Production Build (Play Store submission)

```bash
eas build --platform android --profile production
```

- Produces a signed `.aab` (Android App Bundle) — required by Google Play
- Download from the EAS dashboard
- Upload to [Google Play Console](https://play.google.com/console) → **Internal Testing** → Create new release → Upload the `.aab`
- Add testers via email, they install via the Play Store internal track
- Promote to Production when ready

---

## Play Store Submission Requirements

Before submitting, ensure:

1. **Permissions justified** — the app requests Bluetooth, NFC, and Location. Google will ask you to justify these in the Play Console declaration. Use:
   - *Bluetooth & Location*: "Required to discover and connect to the Stripe M2 card reader for in-person payments"
   - *NFC*: "Required for Tap to Pay on Android (Stripe Terminal)"

2. **Privacy Policy** — required for any app requesting location. Add your Certxa privacy policy URL to the Play Console store listing.

3. **Stripe Terminal ToS** — ensure your Stripe account has accepted the Terminal Terms of Service before the app goes live.

4. **`google-service-account.json`** — required for automated submission via `eas submit`. Generate this in Google Play Console → Setup → API Access → Create Service Account. Place the file at `apps/certxa-owner/google-service-account.json` (this file is in `.gitignore` — never commit it).

---

## Project Structure

```
apps/certxa-owner/
├── app.json                  Expo config (package name, permissions, icon, splash)
├── eas.json                  EAS build profiles (preview APK / production AAB)
├── package.json              Dependencies
├── babel.config.js           Babel config (expo preset)
├── metro.config.js           Metro config (Hermes/Tanstack fix: unstable_enablePackageExports=false)
├── tsconfig.json             TypeScript config
│
├── app/
│   ├── _layout.tsx           Root layout: SafeAreaProvider, QueryClient, StripeTerminalProvider
│   └── index.tsx             Main screen: full-screen WebView + bridge handler + POS modal
│
├── components/
│   ├── POSModal.tsx          Native POS checkout (Cash / Card / M2 / Tap to Pay)
│   └── ErrorBoundary.tsx     Top-level error boundary with restart
│
├── constants/
│   └── colors.ts             Dark theme palette (#050C18 background, #4F8EF7 primary)
│
├── hooks/
│   └── useColors.ts          Colors hook
│
├── lib/
│   └── terminalBridge.ts     Module-level singleton: connects StripeTerminalProvider ↔ WebView
│
└── assets/                   Icon, splash, adaptive-icon (copied from staff-mobile on first start)
```

---

## Key Files in the Main Codebase

These files were modified to support the native app:

| File | Change |
|---|---|
| `artifacts/booking/src/pages/Calendar.tsx` | `handleCheckout()` posts `OPEN_POS` to native when `window.CERTXA_NATIVE_APP` is true. A `useEffect` listens for `certxa_native_payment_complete` to refresh the calendar. |
| `artifacts/api-server/src/routes/stripeConnect.ts` | Added `GET /api/payments/terminal/location` — creates or retrieves a Stripe Terminal location for the store's connected account. Used by the native app before connecting a reader. |

---

## Startup Script (Development Only)

`scripts/owner-app-start.sh` is used when running via the Replit workflow. It:

1. Runs `pnpm install` if `node_modules` is missing
2. Copies assets from `apps/staff-mobile/assets/` if `apps/certxa-owner/assets/` is missing
3. Resolves `EXPO_PUBLIC_PORTAL_URL` from environment (see hierarchy above)
4. Configures ngrok auth if `NGROK_AUTHTOKEN` is set
5. Starts Expo on port 8084 with `--tunnel` for external device access

> **Note**: The Replit workflow (`Certxa Owner App (Expo)`) starts the Expo dev server. This is useful for testing via Expo Go on features that don't require native modules. For full Stripe Terminal / WebView testing, you must use an EAS-built APK installed on a real Android device.

---

## FAQ

**Q: Can I test this in Expo Go?**
No. `react-native-webview` and `@stripe/stripe-terminal-react-native` are native modules and require a native build. Use `eas build --profile preview` to get a testable APK.

**Q: Does the owner need to log in separately in the app?**
No. The WebView loads `https://certxa.com` and the owner logs in there normally. Their session cookie is shared across all WebView navigations. The native POS layer inherits the session automatically via the WebView bridge.

**Q: What happens if the owner's session expires mid-session?**
The WebView will show the Certxa login page (same as a browser). The owner logs in again, and the session is restored. The native POS layer will also work again immediately since it proxies through the WebView.

**Q: Can the same APK be used by multiple salon owners?**
Yes. Each owner logs into their own account through the WebView. The native POS layer uses their store's connected Stripe account for Terminal (resolved server-side via session).

**Q: The M2 reader isn't being discovered. What should I check?**
1. Ensure the M2 is powered on (green light)
2. Ensure Android Bluetooth is enabled
3. Ensure location permission is granted to the app (required for BLE scanning on Android)
4. Keep the M2 within ~1 metre during initial scan
5. If previously connected to another device, hold the M2 power button until it flashes to reset

**Q: Does Tap to Pay work on all Android devices?**
No. Requires NFC hardware + Android 6.0+. Most flagship phones from 2018+ support it. Budget devices may not have NFC.
