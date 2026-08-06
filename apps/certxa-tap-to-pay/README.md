# Certxa Tap to Pay — Android Wrapper

A native Android app (Expo custom dev client, **not Expo Go**) that:
- Shows `https://certxa.com/auth` in a WebView for ~99% of the UI.
- Bridges to Stripe Terminal's native SDK for Tap to Pay on Android and
  Bluetooth/USB card readers, for the payment step.

## Why not Expo Go
`@stripe/stripe-terminal-react-native` ships native Kotlin/Java modules.
Expo Go only bundles Expo's own SDK modules, so this **requires**:
- `expo-dev-client` (a custom build of your app that behaves like Expo Go
  but includes your native dependencies), and
- either `expo prebuild` + Android Studio/Gradle locally, or EAS Build in
  the cloud.

## One-time setup

1. **Install dependencies**
   ```bash
   npm install
   npx expo install expo-build-properties
   ```

2. **Stripe Dashboard**
   - Get approved for **Tap to Pay on Android** (Stripe requires an
     application/approval process — it's not enabled by default).
   - Create a **Location** in the Stripe Dashboard (or via API) — you'll
     need its ID in `src/useTapToPayBridge.ts` (`locationId`).

3. **Backend (included — see `backend/`)**
   - This repo includes a working Node/Express backend in `backend/`
     with the two required endpoints. See `backend/README.md` to set it
     up.
   - **Auth model:** the app authenticates to this backend using the
     same `certxa.sid` session cookie the user's WebView login already
     creates — no separate mobile login, no Bearer token. The backend
     resolves which Stripe connected account to charge from that
     session server-side; the app/website never supply an account ID.
   - One gap left on purpose: `resolveConnectedAccountIdForSession()` in
     `backend/src/middleware/auth.js` only handles owner/admin sessions
     (`req.session.userId`). Staff OTP logins (`req.session.staffId`)
     aren't resolved yet — see that file's TODO if staff need to take
     payments too.
   - Once it's deployed, update the endpoint URLs in
     `src/connectionToken.ts` and `src/useTapToPayBridge.ts` (mobile app)
     to point at it.

4. **Website changes**
   - See `WEBSITE_INTEGRATION.md` — certxa.com/auth needs a small snippet
     to call into the app and receive the result.

5. **Device requirements for Tap to Pay on Android**
   - Android 11 (API 30) or newer, NFC hardware, Google Play Services,
     and the device must pass Play Integrity checks. Older/rooted or
     custom-ROM devices won't qualify — that's a Stripe/Google
     restriction, not something this code controls.

6. **Stripe M2 reader**
   - No special Stripe approval needed (unlike Tap to Pay) — just order
     M2 units from the Stripe Dashboard and register them to the
     relevant connected account/location.
   - Connects over Bluetooth Low Energy; the permissions in `app.json`
     (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`)
     already cover what discovery needs on Android 12+ and older.
   - Pairing is a discover-then-pick flow, not automatic — see
     `WEBSITE_INTEGRATION.md` for the `startPairingM2()` /
     `connectToReader()` functions your page calls to show a reader
     picker and connect to the merchant's chosen unit.
   - Once connected, the app keeps using that reader for later charges
     without re-pairing, until the app restarts or the reader loses power.
   - Supports contactless (tap), chip insert, and magstripe swipe —
     useful as a fallback for customers/cards that don't work with Tap
     to Pay, or on devices that don't qualify for Tap to Pay at all.

## Build & run

```bash
# Generate native android/ project from the Expo config
npx expo prebuild --platform android

# Run on a plugged-in device or emulator with dev client
npx expo run:android
```

Or build with EAS (recommended for anything beyond local testing):
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile development
```
Install the resulting APK on your test device, then run `npx expo start --dev-client` to iterate on JS changes without rebuilding native code.

## Project structure

```
App.tsx                       — WebView + StripeTerminalProvider shell
src/useTapToPayBridge.ts      — translates WebView messages -> Terminal SDK calls
                                 (Tap to Pay auto-connect + M2 Bluetooth pairing)
src/connectionToken.ts        — fetches the Stripe connection token from your backend
src/currentLocation.ts        — tracks the active Stripe Terminal Location ID
src/sessionCookie.ts          — reads the certxa.sid cookie out of the WebView
app.json                      — Expo config, permissions, native plugins
WEBSITE_INTEGRATION.md        — reference docs for the postMessage protocol
web-integration/              — drop-in JS/CSS for certxa.com/auth (bridge + M2 reader picker UI)
backend/                      — Node/Express API: connection tokens + PaymentIntents
```

## Things you'll still need to decide/build
- Implement the staff-to-store lookup in
  `backend/src/middleware/auth.js` if staff logins need to take
  payments (currently only owner/admin sessions are resolved).
- Verify the address column names assumed in
  `backend/src/services/terminalLocation.js` match your actual
  `locations` table (see that file's comment).
- Run the migration in `backend/migrations/` against your database (or
  port it into your main app's own migration tooling).
- Deploy the backend on a domain the `certxa.sid` cookie actually
  covers (see `backend/README.md`'s note on cookie domain scoping), and
  update the endpoint URLs in the mobile app and in
  `web-integration/certxaTerminalBridge.js`.
- Error/UI states in the website for "connecting reader", "insert/tap
  card", declined, etc — the app only relays status strings, the UI for
  them lives on the web page.
- A reader picker UI on the web side for M2 pairing, and a form for
  one-time reader registration — both now built for you in
  `web-integration/` (see its README for a ready-to-use Replit AI
  prompt to wire them into certxa.com/auth).
- Whether/how to let the merchant switch between Tap to Pay and M2 in
  your UI (`SET_READER_TYPE` message), or whether one client only ever
  uses one or the other.
