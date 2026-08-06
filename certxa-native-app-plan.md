# Certxa Native App Plan

## ✅ Phase 1 — Foundation (Complete)

### What was delivered
- **Expo Router v6 navigation** with tab layout for Owner (tablet + phone) and Solo modes
- **Auth flow** — login screen, JWT session via `expo-secure-store`, AuthContext
- **POS screen** — service/client picker, cart, tip selection, subtotal
- **Checkout screen** — 4 payment methods: Tap to Pay, M2 Card Reader, Manual Card Entry, Cash
- **Receipt screen** — success state with change calculation for cash
- **Clients screen** — client list with search
- **Reports screen** — earnings dashboard
- **Settings** — Stripe Connect, M2 Reader pairing, Tap to Pay setup, Sign Out
- **Stripe Connect screen** — OAuth link flow via WebBrowser
- **M2 Card Reader screen** — Bluetooth scan/pair simulation (EAS build needed for live SDK)
- **Tap to Pay screen** — location permission gate → enable flow → address management (see Phase 2)

### Android Version Verification Note
> Tap to Pay on Android requires NFC hardware and **Android 6.0+ (API level 23)**. The Stripe Terminal SDK additionally requires **Android 5.0+ (API level 21)** at minimum, but NFC Tap to Pay (`localMobile` discovery) is only available on 6.0+. Verify the `minSdkVersion` in `android/build.gradle` when generating an EAS build — it must be **≥ 23** for Tap to Pay support. iOS requires **iOS 16.0+** and **iPhone XS or later**.

---

## ✅ Phase 2 — Stripe Tap to Pay (Complete)

### What was added in this phase

#### New screens
- `app/(owner)/settings/tap-to-pay.tsx` — full Tap to Pay setup screen
  - Connection Status badge (Disabled / Enabled)
  - Location permission gate: shows warning + "Allow Location to Continue" button if location not granted
  - "Enable Tap to Pay" button that simulates the Stripe Terminal `localMobile` discovery flow
  - Address section with location list + "Create location" button
  - "How It Works" info cards
  - Platform-aware copy (iPhone vs Android)

- `app/(owner)/settings/tap-to-pay-location.tsx` — create/save a business address for Tap to Pay
  - Form: Display Name, Street, City, State, Zip
  - Saves to Stripe Terminal location registry (simulated; uses `StripeTerminal.createLocation()` in EAS)

#### Updated screens
- `app/(owner)/pos/payment.tsx` — Tap to Pay added as the first (recommended) payment method
- `app/(owner)/settings/index.tsx` — "Tap to Pay" row added under Payments section

### EAS Build Integration Checklist (for production)
When generating an EAS Dev Client build, complete the following:

1. **Install packages natively:**
   ```bash
   pnpm --filter @workspace/certxa-pos add expo-location
   ```
   `@stripe/stripe-terminal-react-native` is already in package.json.

2. **Add to `app.json` permissions:**
   ```json
   {
     "expo": {
       "plugins": [
         ["expo-location", { "locationWhenInUsePermission": "Location is required to use Tap to Pay." }],
         "@stripe/stripe-terminal-react-native"
       ],
       "ios": { "infoPlist": { "NSLocationWhenInUseUsageDescription": "Location is required to use Tap to Pay." } },
       "android": { "permissions": ["ACCESS_FINE_LOCATION"] }
     }
   }
   ```

3. **Replace simulation stubs** in `tap-to-pay.tsx` with real SDK calls:
   ```ts
   import * as Location from 'expo-location';
   import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';

   const { initialize, discoverReaders, connectLocalMobileReader } = useStripeTerminal();

   // On enable:
   await initialize({ fetchConnectionToken: () => fetchConnectionToken(storeId) });
   await discoverReaders({ discoveryMethod: 'localMobile', simulated: false });
   // connectLocalMobileReader when reader found (the phone itself)
   ```

4. **Android `minSdkVersion`:** Set to **23** in `android/build.gradle`.

5. **Stripe Dashboard:** Enable "Tap to Pay on Android" or "Tap to Pay on iPhone" in your Stripe Terminal settings for the connected account.

---

## ✅ Phase 3 — Complete

### ✅ 3.1 Real Payment Processing
- `payment.tsx` wired to real API: `createPaymentIntent` + `capturePaymentIntent` called before navigating to receipt
- Tap to Pay / Terminal: full "Hold Near Card" overlay modal during collection; `collectPaymentMethod` stub (needs EAS build for live SDK)
- Cash: skip intent creation, instant local processing
- Manual: creates payment intent, simulates card capture (CardField in next EAS phase)
- `receipt.tsx`: receives `subtotal`, `paymentIntentId`, and `tap_to_pay` method label fixed

### ✅ 3.2 Appointments Integration
- Calendar on Owner home tab — full timeline view ✅ (Phase 1)
- Check-in from appointment modal ✅
- **Quick-charge from appointment detail** — "Charge $X" button pre-fills `payment.tsx` with `subtotal`, `clientId`, `clientName`, `appointmentId`, `cartJson`

### ✅ 3.3 Staff Mobile App
- Staff schedule view with date navigation ✅ (Phase 1)
- Clock in / clock out from Dashboard ✅ (Phase 1)
- **Tappable appointment cards** — tap any card to open bottom sheet with full details (time, service, price, phone, notes)
- **Check-in action** from appointment detail sheet (confirmed/pending → checked_in)
- **Mark complete** from sheet (in_progress/checked_in → completed)
- Price and notes shown inline on card and in detail sheet

### ✅ 3.4 Push Notifications
- `lib/notifications.ts` created in certxa-pos with full API:
  - `registerForPushNotifications()` — requests Expo push token
  - `scheduleAppointmentReminder()` — schedules local notification 30 min before
  - `cancelAppointmentReminder()` — removes a scheduled reminder
  - `sendLocalNotification()` — fire-and-forget local push
  - `sendPaymentConfirmationNotification()` — post-payment receipt push
- Dynamic import of expo-notifications with graceful no-op fallback (Expo Go compatible)

### ✅ 3.5 Offline Mode
- `lib/offlineQueue.ts` created in certxa-pos using AsyncStorage:
  - `enqueuePayment()` — stores payment locally when offline
  - `getQueue()` — retrieves all pending payments
  - `syncQueue()` — retries all queued payments with per-item success/error callbacks
  - `removeFromQueue()` / `incrementRetries()` — queue item lifecycle
  - Max 5 retries per payment before skipping; clears on success

---

---

## ✅ Phase 4 — POS Polish & Infrastructure (Complete)

### ✅ 4.1 Screen Keep-Awake
- `expo-keep-awake` added to certxa-pos package.json
- `activateKeepAwakeAsync('pos-ticket')` called on mount in **Ticket Builder** screen — screen never locks mid-sale
- `activateKeepAwakeAsync('pos-payment')` called on mount in **Payment** screen — critical for Tap to Pay, which fails if the display locks during NFC collection
- Both activate/deactivate correctly on unmount (no battery drain on other screens)

### ✅ 4.2 Clipboard Copy on Receipts
- `expo-clipboard` added to certxa-pos package.json
- **Owner receipt** (`pos/receipt.tsx`): "Copy" button added alongside Email/SMS in the Send Receipt row; copies a formatted multi-line receipt summary to the system clipboard; icon and label toggle to ✓ Copied for 2 seconds
- **Solo receipt** (`solo/receipt.tsx`): same Copy button wired to `handleCopyReceipt()` with the same 2-second feedback

### ✅ 4.3 Background Offline Queue Sync
- `expo-task-manager` + `expo-background-fetch` added to certxa-pos package.json
- `lib/backgroundSync.ts` created with three exports:
  - `defineBackgroundSyncTask()` — registers the background task definition at module scope (required before TaskManager can schedule it)
  - `registerBackgroundSync()` — schedules the task to run every 15 minutes; `startOnBoot: true`, `stopOnTerminate: false`
  - `unregisterBackgroundSync()` — cancels the task (e.g. on sign-out)
- Task body calls `syncQueue()` from `lib/offlineQueue.ts` and returns correct `BackgroundFetchResult` codes
- `_layout.tsx` calls `defineBackgroundSyncTask()` at module scope and `registerBackgroundSync()` in a root `useEffect`
- Graceful no-op in Expo Go (both modules wrapped in `try/require` with silent catch)

### ✅ 4.4 Sentry Error Tracking
- `@sentry/react-native ~6.5.0` added to certxa-pos package.json
- Wired into `_layout.tsx` via dynamic `require` with try/catch — app never crashes if Sentry isn't installed or in Expo Go
- Reads DSN from `EXPO_PUBLIC_SENTRY_DSN` env var; if unset, Sentry stays silent (no data sent)
- `tracesSampleRate: 0.2` (20% performance tracing to avoid quota burn)
- Environment set to `'development'` or `'production'` based on `__DEV__` flag

---

## ✅ Phase 5 — Client Profiles & Creation (Complete)

### ✅ 5.1 Tappable Client Cards
- Every client card in the Clients tab is now a `<Pressable>` — tapping navigates to `/(owner)/client/[id]`
- "New" button in the header navigates to `/(owner)/client/new`
- New screens registered as hidden tabs (`href: null`) in `(owner)/_layout.tsx`

### ✅ 5.2 Client Detail Screen (`client/[id].tsx`)
- Profile card: avatar initials, full name, email, phone
- 3-stat row: **Loyalty Points**, **Visits** (completed appts), **Total Spent**
- Notes card (shown when notes exist)
- **"New Ticket for [Name]"** primary action button navigating to POS
- Full appointment history list with service name, date, time, provider, price, and status dot color
- Data from two parallel queries: `fetchClient()` + `fetchClientAppointments()`

### ✅ 5.3 New Client Form (`client/new.tsx`)
- Live avatar preview updates as the user types first/last name initials
- Fields: First Name (required), Last Name, Email, Phone, Notes (multiline)
- On success: invalidates client list cache, navigates to the new client's detail screen
- Reusable as edit form (passes `editId` param)

### ✅ 5.4 API additions (`lib/api.ts`)
- `fetchClient(storeId, clientId)` — GET `/api/clients/:id`
- `createClient(data)` — POST `/api/clients`
- `updateClient(clientId, storeId, data)` — PATCH `/api/clients/:id`
- `fetchClientAppointments(storeId, clientId)` — GET `/api/appointments?clientId=`
- `fetchAppointmentsByRange(storeId, startDate, endDate)` — GET `/api/appointments?startDate=&endDate=`

---

## ✅ Phase 6 — Reports Enhancement (Complete)

### ✅ 6.1 Period Selector
- Today / Week / Month toggle bar below the header
- **Today**: single-day fetch via `fetchAppointments`
- **Week**: fetches from start of current week to today via `fetchAppointmentsByRange`
- **Month**: fetches from 1st of current month to today
- Date range label updates to reflect the selected period

### ✅ 6.2 Top Services Section
- New "Top Services" section between KPI cards and Staff Earnings
- Shows top 5 services by revenue for the selected period
- Rank badge (#1–#5), service name, booking count, revenue
- Computed client-side from completed appointments

### ✅ 6.3 Improved Reports Screen
- `useMemo` on all derived values (completed, revenue, topServices, byStaff) to avoid re-computation on re-renders
- Staff Earnings section now filters to only staff with at least 1 completed service
- Empty state shows period-aware message

---

## 📦 Key Packages Reference

Identified from competitor app open-source library screen:

| Package | Purpose | Status |
|---|---|---|
| `@stripe/stripe-react-native` | Stripe SDK for React Native | ✅ installed |
| `@stripe/stripe-terminal-react-native` | Stripe Terminal (Tap to Pay, M2) | ✅ installed |
| `expo-location` | Location permissions for Tap to Pay | ⚠️ needs native build |
| `expo-notifications` | Push notifications | ✅ installed |
| `expo-background-fetch` | Background sync (paired with expo-task-manager) | ✅ installed |
| `expo-task-manager` | Background task registry | ✅ installed |
| `expo-local-authentication` | Face ID / Fingerprint unlock | ✅ installed |
| `expo-secure-store` | Encrypted token storage | ✅ installed |
| `expo-router` | File-based navigation | ✅ installed |
| `@react-native-async-storage/async-storage` | Offline queue | ✅ installed |
| `@sentry/react-native` | Error tracking | ✅ installed |
| `expo-keep-awake` | Prevent screen sleep on POS | ✅ installed |
| `expo-clipboard` | Copy receipt/invoice | ✅ installed |
