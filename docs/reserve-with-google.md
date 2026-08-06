# Reserve with Google — Integration Documentation

**Status:** Not started — for future implementation  
**Last updated:** August 2, 2026  
**Author:** Certxa Engineering

---

## Table of Contents

1. [Overview](#1-overview)
2. [How It Works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Architecture](#4-architecture)
5. [Data Feeds](#5-data-feeds)
6. [API Endpoints to Build](#6-api-endpoints-to-build)
7. [Background Jobs](#7-background-jobs)
8. [Salon Onboarding Flow](#8-salon-onboarding-flow)
9. [What Already Exists in Certxa](#9-what-already-exists-in-certxa)
10. [New Work Required](#10-new-work-required)
11. [Google Partner Application Process](#11-google-partner-application-process)
12. [Google Test Suite Requirements](#12-google-test-suite-requirements)
13. [Implementation Checklist](#13-implementation-checklist)
14. [Realistic Timeline](#14-realistic-timeline)
15. [Edge Cases & Gotchas](#15-edge-cases--gotchas)
16. [References](#16-references)

---

## 1. Overview

**Reserve with Google** (now called the **Business Profile Bookings API**) lets salons on Certxa display a **"Book Online"** button directly in Google Maps and Google Search results. When a potential client searches for a salon, they can book an appointment without leaving Google.

### What the end-user sees
- A **"Book Online"** or **"Reserve"** button on the Google Business listing
- Real-time available time slots pulled from Certxa
- Booking confirmation handled inside Google, which triggers Certxa to create the appointment

### What this is NOT
- This is **not** the same as the Google Business Profile API (which Certxa already uses for reviews, hours, photos)
- It requires a **separate partner approval** from Google
- It is a **push-based** feed system — Certxa pushes data to Google, Google does not poll Certxa on demand (except for the booking and check-availability endpoints)

---

## 2. How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        CERTXA                                │
│                                                              │
│  Booking Engine ──► Feed Generator ──► Availability Feed    │
│       │                                       │              │
│       │                               Push every 15 min     │
│       │                                       │              │
│       ▼                                       ▼              │
│  Appointment DB              ┌────────────────────────────┐  │
│                              │   GOOGLE AGGREGATOR SERVER │  │
│  /google-reserve/            │                            │  │
│    create-booking ◄──────────┤  Stores feeds, serves      │  │
│    check-availability ◄──────┤  "Book Online" button      │  │
│    cancel-booking ◄──────────┤                            │  │
│                              └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                       │
                              Google Maps / Search
                                       │
                                 End User Books
```

**Flow summary:**
1. Certxa pushes merchant, service, and availability feeds to Google every ~15 minutes
2. Google displays the "Book Online" button with real-time slots
3. User selects a slot on Google
4. Google calls Certxa's `check-availability` endpoint to re-validate the slot
5. User confirms — Google calls Certxa's `create-booking` endpoint
6. Certxa creates the appointment, sends confirmation email
7. If user cancels, Google calls Certxa's `cancel-booking` endpoint

---

## 3. Prerequisites

### From Google (must be completed before building)
- [ ] Accepted as an official Google Reserve Partner (see §11)
- [ ] Sandbox API credentials from Google
- [ ] Designated partner rep / support contact at Google
- [ ] Access to Google's test suite environment

### From Certxa (already done)
- [x] Google Business Profile API connected (OAuth tokens stored)
- [x] Booking engine (`bookingEngine.ts`) capable of generating available slots
- [x] Appointment creation, cancellation APIs
- [x] Transactional email system
- [x] Timezone-aware scheduling (`TimeService`)

### Environment Variables to add (when ready)
```
GOOGLE_RESERVE_PARTNER_KEY=       # Issued by Google after partner approval
GOOGLE_RESERVE_PARTNER_SECRET=    # Issued by Google
GOOGLE_RESERVE_FEED_ENDPOINT=     # Google's aggregator URL (sandbox vs prod differ)
GOOGLE_RESERVE_WEBHOOK_SECRET=    # For verifying Google's inbound POST requests
```

---

## 4. Architecture

### New files to create
```
artifacts/api-server/src/
├── routes/
│   └── googleReserve.ts          # Inbound booking/cancel/check endpoints
├── lib/
│   └── googleReserveFeeds.ts     # Feed generation logic
│   └── googleReservePush.ts      # HTTP push to Google aggregator
└── jobs/
    └── reserveFeedScheduler.ts   # 15-min cron job
```

### Database additions needed
```sql
-- Tracks which salons have opted in to Reserve with Google
CREATE TABLE google_reserve_merchants (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES locations(id),
  merchant_id     TEXT NOT NULL UNIQUE,    -- "certxa-{store_id}"
  is_active       BOOLEAN NOT NULL DEFAULT false,
  last_feed_push  TIMESTAMP,
  feed_error      TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Maps Google booking IDs to Certxa appointment IDs
CREATE TABLE google_reserve_bookings (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL,
  google_booking_id TEXT NOT NULL UNIQUE,  -- Google's booking reference
  appointment_id    INTEGER REFERENCES appointments(id),
  status            TEXT DEFAULT 'confirmed',  -- confirmed | cancelled
  created_at        TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Data Feeds

All feeds are JSON sent via `HTTP POST` to Google's aggregator endpoint with a partner API key in the header.

### 5.1 Merchant Feed

Sent once when a salon opts in, and whenever their business info changes.

```json
{
  "merchant": {
    "merchant_id": "certxa-salon-42",
    "name": "Jim's Nails Tucson",
    "telephone": "+15205551234",
    "url": "https://certxa.com/book/jims-nails",
    "geo": {
      "latitude": 32.2217,
      "longitude": -110.9265
    },
    "address": {
      "street_address": "1234 N Oracle Rd",
      "city": "Tucson",
      "state": "AZ",
      "country": "US",
      "postal_code": "85705"
    },
    "category": "hair_salon"   // or nail_salon, spa, barber, etc.
  }
}
```

**Category mapping from Certxa specialty:**
| Certxa specialty | Google category |
|---|---|
| Hair | `hair_salon` |
| Nails | `nail_salon` |
| Barber | `barber_shop` |
| Esthetician | `spa` |
| Massage | `massage_therapist` |
| Makeup | `beauty_salon` |
| Wax / Lash / Brows | `beauty_salon` |

---

### 5.2 Service Feed

Sent when services are added/edited, and on the initial opt-in push.

```json
{
  "services": [
    {
      "service_id": "certxa-svc-101",
      "merchant_id": "certxa-salon-42",
      "name": "Basic Manicure",
      "description": "Classic manicure with polish of your choice.",
      "price": {
        "currency_code": "USD",
        "units": 35,
        "nanos": 0
      },
      "duration_seconds": 1800,
      "prepayment_type": "NOT_REQUIRED",   // or REQUIRED or OPTIONAL
      "rules": {
        "min_advance_booking_seconds": 3600,   // 1 hour
        "max_advance_booking_seconds": 2592000  // 30 days
      }
    }
  ]
}
```

---

### 5.3 Availability Feed *(most critical — refreshed every 15 min)*

This is the core feed. It lists every open slot for every service for every opted-in salon for the next 30 days.

```json
{
  "service_availability": [
    {
      "merchant_id": "certxa-salon-42",
      "service_id": "certxa-svc-101",
      "resources": {
        "staff_id": "certxa-staff-7",        // optional but recommended
        "staff_name": "Lisa M."
      },
      "start_time_restrict": "2026-08-03T00:00:00-07:00",
      "end_time_restrict":   "2026-09-02T23:59:59-07:00",
      "availability": [
        {
          "start_time": "2026-08-03T09:00:00-07:00",
          "duration_seconds": 1800,
          "spots_total": 1,
          "spots_open": 1
        },
        {
          "start_time": "2026-08-03T09:30:00-07:00",
          "duration_seconds": 1800,
          "spots_total": 1,
          "spots_open": 1
        }
      ]
    }
  ]
}
```

**How to generate this from existing code:**

```typescript
// lib/googleReserveFeeds.ts (pseudocode)
import { bookingEngine } from "./bookingEngine";

export async function generateAvailabilityFeed(storeId: number) {
  const store = await getStore(storeId);
  const services = await getActiveServices(storeId);
  const staff = await getActiveStaff(storeId);
  const timezone = store.timezone;

  const feedItems = [];
  const now = new Date();
  const horizon = addDays(now, 30);

  for (const service of services) {
    for (const staffMember of staff) {
      // Re-use existing booking engine
      const slots = await bookingEngine.getAvailableSlots({
        storeId,
        serviceId: service.id,
        staffId: staffMember.id,
        from: now,
        to: horizon,
        timezone,
      });

      feedItems.push({
        merchant_id: `certxa-salon-${storeId}`,
        service_id: `certxa-svc-${service.id}`,
        resources: {
          staff_id: `certxa-staff-${staffMember.id}`,
          staff_name: staffMember.name,
        },
        availability: slots.map(slot => ({
          start_time: slot.startTime.toISOString(),
          duration_seconds: service.duration * 60,
          spots_total: 1,
          spots_open: 1,
        })),
      });
    }
  }

  return { service_availability: feedItems };
}
```

> ⚠️ **Performance note:** For a salon with 10 staff and 20 services, this generates 200 slot lists over 30 days. Cache aggressively and run the feed job per-store in a background queue.

---

## 6. API Endpoints to Build

All inbound requests from Google arrive at your server. Google signs requests with an HMAC header — **always verify the signature before processing.**

### 6.1 Check Availability
Google calls this immediately before showing the user the final "Confirm" screen to make sure the slot is still free.

```
POST /api/google-reserve/check-availability
Authorization: Bearer {GOOGLE_RESERVE_WEBHOOK_SECRET}

Request body:
{
  "merchant_id": "certxa-salon-42",
  "service_id": "certxa-svc-101",
  "start_time": "2026-08-03T09:00:00-07:00",
  "duration_seconds": 1800,
  "resources": { "staff_id": "certxa-staff-7" }
}

Response (slot available):
{
  "slot_is_available": true
}

Response (slot taken):
{
  "slot_is_available": false,
  "next_available_time": "2026-08-03T09:30:00-07:00"  // optional
}
```

**Implementation:**
- Run the same availability check as booking engine
- Must respond within **2 seconds** (Google timeout)
- This is called frequently — cache recent slot calculations

---

### 6.2 Create Booking
Called when the user confirms the booking on Google.

```
POST /api/google-reserve/create-booking
Authorization: Bearer {GOOGLE_RESERVE_WEBHOOK_SECRET}

Request body:
{
  "booking_id": "google-booking-abc123",   // Google's own reference
  "merchant_id": "certxa-salon-42",
  "service_id": "certxa-svc-101",
  "start_time": "2026-08-03T09:00:00-07:00",
  "duration_seconds": 1800,
  "resources": { "staff_id": "certxa-staff-7" },
  "user_information": {
    "given_name": "Jane",
    "family_name": "Doe",
    "email": "jane@example.com",
    "telephone": "+15205550001",
    "telephone_country": "US"
  },
  "payment_information": {
    "prepayment_status": "NOT_PROVIDED"
  }
}

Success response:
{
  "booking_id": "google-booking-abc123",
  "status": {
    "status": "BOOKING_STATUS_CONFIRMED"
  },
  "user_payment_option_id": ""
}

Failure response (double-booked):
{
  "booking_id": "google-booking-abc123",
  "status": {
    "status": "BOOKING_STATUS_FAILED",
    "failure_reason": "SLOT_UNAVAILABLE"
  }
}
```

**Implementation steps:**
1. Parse `merchant_id` → extract `storeId`
2. Parse `service_id` → extract Certxa `serviceId`
3. Parse `resources.staff_id` → extract Certxa `staffId`
4. Find or create client record from `user_information`
5. Call existing appointment creation logic with a double-booking guard
6. Save `google_booking_id ↔ appointment_id` mapping in `google_reserve_bookings`
7. Send confirmation email via existing `systemEmails.ts`
8. Return success

---

### 6.3 Cancel Booking
Called when the user cancels through Google (or Google cancels on their behalf).

```
POST /api/google-reserve/cancel-booking
Authorization: Bearer {GOOGLE_RESERVE_WEBHOOK_SECRET}

Request body:
{
  "booking_id": "google-booking-abc123"
}

Response:
{
  "status": {
    "status": "BOOKING_STATUS_CANCELLED"
  }
}
```

**Implementation steps:**
1. Look up `appointment_id` from `google_reserve_bookings` by `google_booking_id`
2. Cancel the appointment in Certxa (set status = `cancelled`)
3. Mark `google_reserve_bookings.status = 'cancelled'`
4. Send cancellation email to client
5. Trigger availability feed re-push for that salon (to free up the slot on Google)

---

### 6.4 Get Booking *(optional — for Google to fetch status)*

```
GET /api/google-reserve/booking/{google_booking_id}

Response:
{
  "booking": {
    "booking_id": "google-booking-abc123",
    "merchant_id": "certxa-salon-42",
    "service_id": "certxa-svc-101",
    "start_time": "2026-08-03T09:00:00-07:00",
    "duration_seconds": 1800,
    "status": {
      "status": "BOOKING_STATUS_CONFIRMED"
    }
  }
}
```

---

## 7. Background Jobs

### 7.1 Availability Feed Pusher

Runs every 15 minutes. Processes all opted-in salons.

```typescript
// jobs/reserveFeedScheduler.ts
import { generateAvailabilityFeed } from "../lib/googleReserveFeeds";
import { pushFeedToGoogle } from "../lib/googleReservePush";

export async function runAvailabilityFeedJob() {
  const activeMerchants = await db
    .select()
    .from(googleReserveMerchants)
    .where(eq(googleReserveMerchants.isActive, true));

  for (const merchant of activeMerchants) {
    try {
      const feed = await generateAvailabilityFeed(merchant.storeId);
      await pushFeedToGoogle("availability", feed);
      await db
        .update(googleReserveMerchants)
        .set({ lastFeedPush: new Date(), feedError: null })
        .where(eq(googleReserveMerchants.storeId, merchant.storeId));
    } catch (err) {
      await db
        .update(googleReserveMerchants)
        .set({ feedError: String(err) })
        .where(eq(googleReserveMerchants.storeId, merchant.storeId));
    }
  }
}

// Wire into index.ts:
setInterval(runAvailabilityFeedJob, 15 * 60 * 1000);
// Also trigger immediately after any appointment create/cancel
```

### 7.2 Triggered Re-push

In addition to the scheduled job, availability should be pushed immediately after:
- A new appointment is booked (to remove that slot)
- An appointment is cancelled (to restore that slot)
- Business hours change
- Staff availability changes

```typescript
// Call this after any appointment mutation:
await triggerImmediateReserveFeedPush(storeId);
```

---

## 8. Salon Onboarding Flow

When a salon owner wants to enable Reserve with Google:

```
Settings → Booking Controls → Google Booking & Reviews
                                      │
                              "Enable Reserve with Google"
                                      │
                              ┌───────▼────────┐
                              │  1. Verify GBP  │  (must have Google Business
                              │     connected   │   Profile OAuth connected)
                              └───────┬────────┘
                                      │
                              ┌───────▼────────┐
                              │  2. Select      │  Which services to show
                              │     services    │  on Google (default: all)
                              └───────┬────────┘
                                      │
                              ┌───────▼────────┐
                              │  3. Initial     │  Push merchant + service +
                              │     feed push   │  availability feeds to Google
                              └───────┬────────┘
                                      │
                              ┌───────▼────────┐
                              │  4. Pending     │  Google takes up to 48 hours
                              │     (48h sync)  │  to display the button
                              └────────────────┘
```

### UI needed (in Business Settings → Booking Controls)
- Toggle: "Enable Reserve with Google"
- Status badge: Pending / Active / Error
- Last feed push timestamp
- "Sync now" button (manual re-push)
- Service selector (which services appear on Google)

---

## 9. What Already Exists in Certxa

| Needed Component | Certxa File / Feature | Status |
|---|---|---|
| Slot availability calculation | `artifacts/api-server/src/lib/bookingEngine.ts` | ✅ Done |
| Timezone handling | `TimeService`, `formatInTimeZone` | ✅ Done |
| Appointment creation | `POST /api/appointments` | ✅ Done |
| Appointment cancellation | existing cancel endpoint | ✅ Done |
| Client lookup / create | clients table + routes | ✅ Done |
| Confirmation emails | `lib/systemEmails.ts` | ✅ Done |
| Google OAuth tokens (per salon) | `google_oauth_tokens` table | ✅ Done |
| Business hours data | `business_hours` table | ✅ Done |
| Service catalogue | `services` table | ✅ Done |
| Staff roster | `staff` table | ✅ Done |
| Background job infrastructure | `setInterval` in `index.ts` | ✅ Done (basic) |

---

## 10. New Work Required

| Task | Estimated Effort | Notes |
|---|---|---|
| DB migrations (2 tables) | 0.5 day | `google_reserve_merchants`, `google_reserve_bookings` |
| Feed generator (`googleReserveFeeds.ts`) | 2 days | Heaviest piece — wrap bookingEngine for 30-day horizon |
| Feed push HTTP client (`googleReservePush.ts`) | 0.5 day | Signed HTTP POST to Google aggregator |
| `POST create-booking` endpoint | 1 day | Includes double-booking guard + client upsert |
| `POST check-availability` endpoint | 0.5 day | Thin wrapper around bookingEngine |
| `POST cancel-booking` endpoint | 0.5 day | |
| `GET booking` endpoint | 0.25 day | Simple DB lookup |
| Background feed scheduler | 0.5 day | + triggered re-push on mutations |
| Salon opt-in UI (Settings page) | 1 day | Toggle, status, service selector |
| Signature verification middleware | 0.5 day | Verify Google's HMAC on inbound requests |
| Logging + alerting for feed failures | 0.5 day | |
| **Total** | **~7–8 days engineering** | |

---

## 11. Google Partner Application Process

### Step 1 — Submit Partner Interest Form
URL: **https://reserve.google.com/business** → "Are you a scheduling software?"  
Or directly: **https://developers.google.com/maps-booking/guide**

**What to include in the application:**
- Company name: Certxa
- Type: Multi-merchant scheduling SaaS (beauty & wellness vertical)
- Approximate number of active merchants: [your number]
- Monthly booking volume: [your number]
- Existing GBP API integration: Yes
- Tech contact email + engineering lead

### Step 2 — Google Vetting (~2–3 weeks)
Google reviews your platform. They look at:
- Is the booking flow end-to-end functional?
- Do you send proper confirmation emails?
- Do you support cancellations?
- Is your business legitimate?

### Step 3 — Sandbox Credentials
Once accepted, Google issues:
- `partner_key` and `partner_secret`
- Sandbox aggregator endpoint URL
- Access to their test dashboard

### Step 4 — Build Against Sandbox
Implement all feeds and endpoints using sandbox credentials.

### Step 5 — Run Google's Test Suite (~2–3 weeks)
Google has ~30 automated test cases covering:
1. Merchant feed accepted
2. Service feed accepted
3. Availability feed — slots appear on Google
4. `check-availability` returns correct response
5. `create-booking` creates appointment + confirmation email
6. Double-booking prevention (two simultaneous requests for same slot)
7. `cancel-booking` cancels appointment + sends cancellation email
8. Availability feed updates after booking (slot removed)
9. Availability feed updates after cancellation (slot restored)
10. Edge cases: past slots, out-of-hours slots, staff unavailable

### Step 6 — Production Approval (~4–8 weeks)
Google manually reviews your live implementation and flips the "Book Online" button live for your salons.

---

## 12. Google Test Suite Requirements

Google will test each of these scenarios — ensure all pass before submitting for production review:

| Test Case | What Google Checks |
|---|---|
| Merchant feed | Accepted, mapped to a GBP listing |
| Service feed | All services indexed |
| Availability feed | Slots match business hours |
| Slot selection | User can see slots in Maps |
| `check-availability` | Returns 200 in < 2 seconds |
| `create-booking` | Appointment created, email sent within 1 minute |
| Duplicate booking attempt | Second request returns `SLOT_UNAVAILABLE` |
| `cancel-booking` | Appointment cancelled, email sent |
| Feed update after booking | Slot no longer appears |
| Feed update after cancel | Slot reappears |
| Out-of-hours slot | Not present in feed |
| Past slot | Not present in feed |
| Multi-staff salon | Slots correctly attributed to staff members |

---

## 13. Implementation Checklist

### Phase 1 — Foundation (before Google application)
- [ ] Create `google_reserve_merchants` DB table
- [ ] Create `google_reserve_bookings` DB table
- [ ] Build `googleReserveFeeds.ts` — merchant, service, and availability generators
- [ ] Build `googleReservePush.ts` — HTTP client for Google's aggregator
- [ ] Add salon opt-in UI in Settings → Booking Controls

### Phase 2 — Endpoints (after receiving sandbox credentials)
- [ ] `POST /api/google-reserve/check-availability`
- [ ] `POST /api/google-reserve/create-booking`
- [ ] `POST /api/google-reserve/cancel-booking`
- [ ] `GET  /api/google-reserve/booking/:id`
- [ ] Signature verification middleware for all `/api/google-reserve/*` routes

### Phase 3 — Background Jobs
- [ ] 15-minute feed scheduler wired into `index.ts`
- [ ] Triggered re-push after appointment create / cancel
- [ ] Feed error alerting (log + notify owner in dashboard)

### Phase 4 — Testing
- [ ] Unit tests for feed generators (especially slot calculation edge cases)
- [ ] Integration tests for booking/cancel endpoints
- [ ] Load test: simulate 100 salons × 20 services × 10 staff feed generation
- [ ] Pass all ~30 Google sandbox test cases

### Phase 5 — Production Launch
- [ ] Submit production approval request to Google
- [ ] Monitor feed push success rate
- [ ] Monitor `create-booking` error rate
- [ ] Add Google Reserve status to owner dashboard

---

## 14. Realistic Timeline

| Phase | Duration |
|---|---|
| Submit partner application | Day 1 |
| Google vetting & sandbox access | 2–3 weeks |
| Build feeds + endpoints (Phase 1–3) | 1–2 weeks (can run in parallel with vetting) |
| Google sandbox testing (Phase 4) | 2–3 weeks |
| Google production approval | 4–8 weeks |
| **First "Book Online" button live** | **~3 months from application date** |

> ⏱ Start the Google application immediately — the partner review process dominates the timeline and runs in parallel with engineering.

---

## 15. Edge Cases & Gotchas

### Double-booking race condition
Google may call `check-availability` and `create-booking` with milliseconds between them. Two users could check the same slot simultaneously.  
**Solution:** Use a database-level lock or atomic `UPDATE ... WHERE spots_open > 0 RETURNING *` when creating the booking.

### Timezone mismatches
Google sends slot times as ISO 8601 with UTC offset. The booking engine uses the salon's stored timezone.  
**Solution:** Convert Google's `start_time` to the salon's IANA timezone using `formatInTimeZone` before passing to the booking engine — same pattern as the existing timezone fix.

### Availability feed size
A salon with 10 staff × 20 services × 30 days × ~16 slots/day = **96,000 slot objects** per feed push. This payload can be 5–10 MB.  
**Solution:** Use Google's delta feed format (only push changes since last push) once initial full feed is accepted.

### Service price mismatch
If Certxa's service price changes, the Google service feed must be re-pushed. Google may pause the "Book Online" button if it detects price inconsistencies.  
**Solution:** Trigger a service feed re-push whenever a service price is updated.

### Cancelled merchants
When a Certxa salon cancels their subscription, Google Reserve must be disabled and a `DELETE merchant` feed pushed.  
**Solution:** Hook into the account suspension/cancellation logic to deactivate the `google_reserve_merchants` record and push a deletion feed.

### Prepayment
If a salon requires deposits (Certxa supports this), `prepayment_type` must be set to `REQUIRED` in the service feed, and Google's payment handling must be configured. This is an advanced use case — **recommend starting with `NOT_REQUIRED` for initial launch.**

---

## 16. References

| Resource | URL |
|---|---|
| Google Maps Booking API docs | https://developers.google.com/maps-booking |
| Partner application | https://reserve.google.com/business |
| Feed format reference | https://developers.google.com/maps-booking/reference/rest |
| Business Profile Bookings API | https://developers.google.com/my-business/reference/bookings |
| Test suite guide | https://developers.google.com/maps-booking/guides/testing |
| Availability feed spec | https://developers.google.com/maps-booking/reference/feeds |
| Category list (for merchant feed) | https://developers.google.com/maps-booking/reference/categories |

---

*This document covers the full technical scope of the Reserve with Google integration for Certxa. No code has been implemented yet. Use this as the engineering spec when the time comes to build.*
