# Certxa Native App — Product & Build Plan

**Version:** 1.0  
**Date:** July 1, 2026  
**Status:** Planning

---

## 1. Context & Product Philosophy

Certxa is a **desktop and large Android screen-first SaaS**. The existing web application (`artifacts/booking/`) is the primary product and covers the full feature set: calendar, POS, bookings, payroll, reports, loyalty, waitlist, and website builder.

The native mobile app is **not** a replacement for the web app. It fills three specific gaps the browser cannot:

| Gap | Why the browser can't fill it |
|---|---|
| Stripe Terminal (M2 Bluetooth + Tap to Pay) | `@stripe/stripe-react-native` is native-only; the Stripe Terminal JS SDK does not support mobile browsers for hardware readers or NFC |
| Persistent tablet front-desk device | A native app can be always-on, kiosk-mode locked, Bluetooth-paired, and free of browser chrome |
| Solo professional all-in-one phone tool | A booth renter or self-employed stylist needs offline-capable, phone-native UX — not a responsive web page |

### What this app is NOT

- Not a replacement for the web app
- Not a general-purpose staff portal (that is `apps/staff-mobile` — a separate Expo app for employees to see their own schedule)
- Not a mobile-first redesign of the full platform

---

## 2. App Identity

| Property | Value |
|---|---|
| **App name** | Certxa |
| **Location** | New workspace package: `apps/certxa-pos/` |
| **Framework** | Expo SDK 54 + Expo Router (file-based navigation) |
| **Language** | TypeScript |
| **API** | Same `artifacts/api-server` on port 9200 — no backend rewrite |
| **State management** | TanStack Query (already in monorepo) |
| **Auth** | OTP SMS + biometric (Face ID / Fingerprint) — same as staff-mobile |
| **Build** | EAS Build (required — Stripe Terminal SDK uses native modules, incompatible with Expo Go) |
| **Platforms** | iOS 16+ · Android 10+ |

> **Decision note:** This is created as a **separate app** (`apps/certxa-pos`) rather than extending `apps/staff-mobile` to keep branding, App Store listings, and user personas cleanly separated. The staff portal (staff-mobile) is for employees; this app is for owners and solo professionals.

---

## 3. Two Personas, Two Modes

At login, the app detects the user's account type and routes them to the correct mode. Users can also switch modes from Settings if their account supports both (e.g. a solo pro who later adds staff becomes an owner).

---

### Mode A — Business / Salon Owner

The owner uses the app in two physical contexts:

#### A1 — Tablet (Front Desk)

A permanently mounted iPad or large Android tablet at the front desk. This replaces the browser tab. It is always-on, brightness-locked, and Bluetooth-paired to the M2 reader.

**Screens:**

| Screen | Description |
|---|---|
| **Calendar** | Multi-column staff grid — one column per staff member, same data as the web `Calendar.tsx`. Shows the full day with appointment blocks, colour-coded by staff. Supports 2–7 columns depending on tablet width. Swipe left/right to move between days. Tap appointment → detail modal (check-in, no-show, move, cancel). Real-time sync via WebSocket. |
| **New Appointment** | Quick-create modal: pick service, staff, date/time, client (search or walk-in). Pre-fills from calendar tap. |
| **Client Check-In** | QR code scanner (camera) to mark a walk-in from the kiosk as arrived. Manual search fallback. |
| **POS / Ticket Builder** | Split-panel landscape layout. Left: service and product catalogue (scrollable grid). Right: current ticket (cart). Add services, assign staff per item, apply discount or promo code, redeem loyalty points. Proceeds to Tip Screen → Payment. |
| **Tip Screen** | Preset buttons: 10%, 15%, 18%, 20%, No Tip. Custom amount with toggle between % and $. |
| **Payment Screen** | Method selector → M2 Bluetooth reader (primary), Manual card entry (backup), Cash. |
| **Receipt Screen** | Email receipt, SMS receipt, Print (Bluetooth thermal printer), or Skip. |
| **Cash Drawer** | Open / close command. Tracks float. |
| **Day Close** | End-of-day summary: total revenue, ticket count, payment type breakdown, per-staff earnings. Export / email report. |

#### A2 — Phone (Owner On The Go)

The owner's phone is not meant for running the calendar (the web app is better for that). The phone mode is for **managing the business** when away from the desk.

**Screens:**

| Screen | Description |
|---|---|
| **Dashboard** | Today's revenue, appointment count, top earner. Open tickets alert. Quick actions: Refund, Mark No-Show, Message Client, View Payroll. |
| **Staff** | Staff list (active/inactive). Tap → profile. Edit working hours, pay rate, permissions. Send OTP invite to new staff member. View this week's clocked hours. |
| **Payroll** | Current period earnings per staff member. Approve a payout run. Payout history. Link to tax documents (1099 view). |
| **Notifications** | New booking alerts, payment failures, review requests, low loyalty balance warnings. |
| **Settings** | Account details, Stripe Connect status, M2 reader management (pair/unpair/test), receipt preferences, notification preferences, switch to tablet mode. |

---

### Mode B — Solo Professional (Booth Renter / Self-Employed)

A booth renter, independent stylist, nail technician, barber, or any single-person service business. They have no staff to manage. Their phone **is** their POS terminal — Tap to Pay means they never need external hardware.

**Design principle:** Three taps to collect payment. Simple, fast, clean.

**Screens:**

| Screen | Description |
|---|---|
| **My Day** | Their appointments only, listed by time. Status chips (confirmed, checked-in, completed). Earnings banner at top showing today's total. Large **+ Walk-In / Quick Charge** button always visible. |
| **Ticket Builder** | Their service catalogue (pre-configured). Add services to ticket. Custom amount option for one-off charges. Discount toggle. Loyalty redeem. → Proceeds to Tip → Payment. |
| **Tip Screen** | Same as owner mode. |
| **Payment Screen** | **Tap to Pay (NFC) is the primary CTA** — large button. Below it: Manual Card Entry, Cash. Success state shows amount and client name. |
| **Receipt Screen** | Email, SMS, or Skip. |
| **My Clients** | Their clients only (filtered by staffId). Search, add new client, view visit history, loyalty points, notes. Quick contact: call or SMS. |
| **My Earnings** | Revenue graph: Today / Week / Month. Payment type breakdown. Average ticket value. Stripe payout status. Link to Stripe dashboard for bank account management. |
| **Settings** | My services and prices (CRUD). Stripe Connect onboarding / status. Tap to Pay activation. Receipt template (business name, logo). Booking link to share with clients. Switch to Owner Mode if account supports it. |

---

## 4. Payment Architecture

All card payments route through **Stripe Connect**. Each salon or solo professional connects their own Stripe account in Settings. Payments go directly to their account; Certxa deducts a platform fee (`application_fee_amount`) configured per subscription plan in the database.

### 4.1 Payment Method Matrix

| Method | Owner Tablet | Owner Phone | Solo Pro |
|---|---|---|---|
| M2 Bluetooth Reader | ✅ Primary | — | Optional upgrade |
| Tap to Pay (NFC) | Optional upgrade | — | ✅ Primary |
| Manual Card Entry | ✅ Backup | — | ✅ Backup |
| Cash | ✅ Yes | — | ✅ Yes |

### 4.2 M2 Bluetooth Reader (Stripe Terminal)

**Use case:** Owner tablet, front desk, stationary setup.

**Flow:**
1. App calls `GET /api/payments/connection-token` (auth-gated, already built)
2. `StripeTerminalProvider` initialises with the token
3. `discoverReaders({ discoveryMethod: 'bluetoothScan' })` — scans for nearby M2
4. Reader shown in a modal list → `connectBluetoothReader(reader)`
5. Reader status indicator in the tab bar header (Connected / Disconnected / Connecting)
6. On checkout: `createPaymentIntent` server-side → `collectPaymentMethod()` → `processPayment()` → `capturePaymentIntent`
7. Connection persists across app sessions; auto-reconnects on open

**API endpoints used (all already built):**
- `POST /api/payments/connection-token`
- `POST /api/payments/create-payment-intent`
- `POST /api/payments/capture-payment-intent`

### 4.3 Tap to Pay — iOS (Stripe Terminal localMobile)

**Use case:** Solo professional's phone, no extra hardware.

**Requirements:**
- iPhone XS or later (NFC chip)
- iOS 16+
- Stripe Terminal entitlement from Apple (requires application to Apple — Stripe manages this process for Terminal partners)
- `discoveryMethod: 'localMobile'`

**Flow:** Same as M2 after discovery — `collectPaymentMethod()` prompts the NFC screen on the device, customer taps their card or phone.

### 4.4 Tap to Pay — Android (Stripe Terminal localMobile)

**Use case:** Solo professional on Android, no extra hardware.

**Requirements:**
- NFC-enabled Android device
- Android 10+ (API 29+)
- `NFC` permission in `AndroidManifest.xml`
- `discoveryMethod: 'localMobile'`
- Google Play Services (standard on consumer devices)

**Flow:** Identical to iOS path; SDK handles platform differences.

### 4.5 Manual Card Entry

**Use case:** Backup for both personas when hardware is unavailable or NFC fails.

**Flow:**
1. Render `@stripe/stripe-react-native` `CardField` component (PCI-compliant, no raw card data touches the app)
2. `createPaymentMethod({ type: 'card' })` on the client
3. `POST /api/payments/confirm-manual` (new endpoint — sends `paymentMethodId` + `amount` + `storeId`)
4. Server creates and confirms `PaymentIntent` with `stripeAccount` and `application_fee_amount`
5. If 3DS required: server returns `client_secret`, app presents `confirmPayment()` sheet
6. Success or failure returned to app

**New endpoint needed:** `POST /api/payments/confirm-manual`

### 4.6 Stripe Connect Onboarding (per account)

**Flow:**
1. Settings → Stripe Connect → **Link Stripe Account** button
2. App opens Stripe OAuth URL in `expo-web-browser` (in-app browser)
3. `GET /api/stripe/connect` (already built) — redirects to Stripe
4. Salon owner logs in to existing Stripe account or creates one
5. Stripe redirects to `GET /api/stripe/callback` (already built) — stores `stripeAccountId` in DB
6. App polls `GET /api/stripe/connect/status` → shows green Connected badge
7. Webhook `account.updated` tracks `charges_enabled` + `payouts_enabled` capabilities

**Backend status:** ~85% complete. All OAuth routes exist. The mobile app just needs the Settings screen UI.

---

## 5. Technical Decisions

### 5.1 Stripe SDK

```
@stripe/stripe-react-native v0.40+
```

- Covers Terminal (M2 + Tap to Pay), `CardField` (manual entry), `PaymentSheet`
- **Requires native build** — Expo Go will not work
- Use EAS Dev Client from day one for development
- `StripeProvider` wraps the root `_layout.tsx`

### 5.2 Navigation

Expo Router (file-based), already in use in `apps/staff-mobile` — same pattern.

```
apps/certxa-pos/app/
  _layout.tsx              ← StripeProvider + auth gate + mode routing
  (auth)/
    login.tsx
  (owner)/
    _layout.tsx            ← tab bar: Calendar | POS | Clients | Reports | Settings
    index.tsx              ← Calendar (tablet-optimised)
    pos/
      index.tsx            ← Ticket builder
      payment.tsx          ← Payment screen
      receipt.tsx          ← Receipt screen
    clients.tsx
    reports.tsx
    settings/
      index.tsx
      stripe-connect.tsx
      reader.tsx
  (owner-phone)/
    _layout.tsx            ← tab bar: Dashboard | Staff | Payroll | Settings
    index.tsx              ← Dashboard
    staff/
      index.tsx
      [id].tsx
    payroll.tsx
    settings.tsx
  (solo)/
    _layout.tsx            ← tab bar: My Day | Clients | Earnings | Settings
    index.tsx              ← My Day
    ticket.tsx             ← Ticket builder
    payment.tsx
    receipt.tsx
    clients.tsx
    earnings.tsx
    settings.tsx
```

### 5.3 Mode Detection

```typescript
// On login success, read account type from API response
// GET /api/auth/user returns { role, storeId, isOwner, staffId, soloMode }
// Route accordingly:
if (user.soloMode) router.replace('/(solo)/')
else if (isTablet()) router.replace('/(owner)/')
else router.replace('/(owner-phone)/')
```

Tablet detection uses `expo-device` `DeviceType.TABLET` — no manual breakpoints.

### 5.4 State & Data

- **TanStack Query** for all server state (already in monorepo catalog)
- **AsyncStorage** for offline cart: queue failed payments → sync on reconnect
- **WebSocket** for real-time calendar sync: existing `/ws` endpoint in API server
- All API calls go to `EXPO_PUBLIC_API_URL` (set per environment in EAS)

### 5.5 Security

| Concern | Approach |
|---|---|
| API keys in bundle | Never — all Stripe keys server-side, only publishable key in app |
| PaymentIntent creation | Always server-side (amount and fee cannot be spoofed) |
| connection_token endpoint | Auth-gated (`requireAuth` middleware) |
| Biometric app lock | `expo-local-authentication` on app foreground |
| Session | Same JWT/cookie session as web app |

### 5.6 Build & Distribution

| | iOS | Android |
|---|---|---|
| Build service | EAS Build | EAS Build |
| Dev testing | EAS Dev Client | EAS Dev Client |
| Tap to Pay requirement | Apple entitlement (apply via Stripe) | NFC permission in manifest |
| Distribution | App Store | Google Play |
| OTA updates | Expo Updates (JS-only changes) | Expo Updates |

---

## 6. What's Reusable from the Existing Codebase

| Existing asset | Reuse in native app |
|---|---|
| `artifacts/api-server` (entire backend) | 100% — no changes needed for most features |
| `artifacts/api-server/src/routes/stripeConnect.ts` | All Connect OAuth endpoints already done |
| `artifacts/api-server/src/routes/stripeWebhook.ts` | Webhook handling already done |
| POS business logic (cart, tip, loyalty, discount) | Port from `artifacts/booking/src/pages/POSInterface.tsx` |
| Calendar data model + API calls | Same `/api/appointments` endpoints |
| Client search + profile | Same `/api/clients` endpoints |
| Payroll data | Same `/api/payroll` endpoints |
| `apps/staff-mobile` auth (OTP + biometric) | Copy pattern directly into new app |
| `shared/` schema types | Import as `@workspace/shared` |

---

## 7. New Backend Work Required

The API server is already ~90% ready. The only new endpoints needed:

| Endpoint | Purpose | Complexity |
|---|---|---|
| `POST /api/payments/confirm-manual` | Confirm a PaymentIntent from a manual-entry PaymentMethod on the client | Low — ~30 lines, same pattern as existing Stripe routes |
| `GET /api/stripe/connect/status` | Poll Stripe Connect account capabilities from mobile | Low — query `store_payment_accounts` table |
| `PATCH /api/settings/solo-mode` | Toggle a store/staff account between solo and owner mode | Low |

---

## 8. Build Phases

### Phase 1 — Foundation (Weeks 1–2)

- [ ] Create `apps/certxa-pos/` workspace package with Expo config
- [ ] Install `@stripe/stripe-react-native`, set up EAS Dev Client build
- [ ] Auth flow: OTP login, biometric lock, session persistence
- [ ] Mode routing: tablet detection → owner tablet, phone → owner phone, solo flag → solo pro
- [ ] Stripe Connect onboarding screen (Settings → Link Account)
- [ ] Owner tablet: Calendar screen (multi-column staff grid, WebSocket sync)
- [ ] Solo pro: My Day screen + ticket builder

### Phase 2 — POS & Payments (Weeks 2–3)

- [ ] Owner POS: full ticket builder (services, staff assign, discount, loyalty, tip, split payment)
- [ ] M2 Bluetooth: discover, connect, collect, capture
- [ ] Tap to Pay: iOS localMobile + Android localMobile
- [ ] Manual card entry: `CardField` + `confirm-manual` endpoint
- [ ] Cash flow: amount tendered, change calculation, drawer command
- [ ] Receipt screen: email, SMS, Bluetooth thermal print, skip
- [ ] Reader management screen: pair, test, status, unpair

### Phase 3 — Owner Phone + Polish (Weeks 3–4)

- [ ] Dashboard screen (owner phone)
- [ ] Staff management screens (list, profile, hours, pay rate)
- [ ] Payroll screens (current period, approve run, history)
- [ ] Solo pro earnings screen + Stripe dashboard deep link
- [ ] Day close modal (owner tablet): float, summary, export
- [ ] Offline payment queue: AsyncStorage → sync on reconnect
- [ ] Push notifications: Expo Notifications + existing API webhooks
- [ ] EAS Build profiles: development, preview, production
- [ ] App Store + Google Play submission configs

---

## 9. Open Questions

| Question | Options | Recommendation |
|---|---|---|
| Do solo pros share the same Certxa account as owner-mode businesses, or is it a separate account type? | Shared account with a `soloMode` flag vs. separate account type | Flag on existing account — simpler, allows upgrading to owner later |
| Should the tablet calendar replace the web app entirely on a tablet, or coexist? | Full replacement vs. supplementary | Supplementary first — owner can choose which to use |
| Platform fee % for solo pros vs. multi-staff salons? | Same rate vs. different tiers | Different — solo pro likely lower volume, but simpler plan |
| Offline booking creation (no network)? | Queue locally → sync | Phase 4 scope — payments offline is complex with Stripe |
| Apple Tap to Pay entitlement timeline? | Stripe applies on your behalf, takes 1–4 weeks | Apply immediately when Phase 2 starts |

---

## 10. Success Criteria

- Owner on a tablet can run a full day of appointments and POS transactions without touching a laptop or phone
- Solo professional can collect a card payment in under 10 seconds from app open
- M2 reader pairs reliably and reconnects automatically after sleep
- Tap to Pay works on both iOS and Android NFC-capable devices
- All payments land in the salon's own Stripe account with the platform fee auto-deducted
- App operates without a browser and can be kiosk-locked on a tablet
