# Certxa Self Check-In Kiosk

A GoCheckin-style tablet kiosk system built into the Certxa SalonOS platform. Clients walk up and check themselves in using their phone number, select their services, and receive a QR-code ticket that staff scan to instantly pull up the booking.

---

## Quick Start

1. **Find your store slug** — go to Settings → Business Settings → Booking Link. Your slug is the last part of your booking URL (e.g. `my-salon`).

2. **Open the kiosk URL on a tablet:**
   ```
   https://[your-domain]/kiosk/[your-slug]
   ```
   Example: `https://certxa.app/kiosk/my-salon`

3. **Put the tablet in full-screen mode** — in most tablet browsers, tap the address bar and choose "Add to Home Screen" or use browser full-screen (F11 / double-tap home bar). Safari on iPad: tap the share button → "Add to Home Screen".

4. **Orient the tablet in landscape mode** — the kiosk is designed for landscape (wider than tall) orientation.

---

## Client Check-In Flow

```
[Idle Screen]
      ↓  (tap anywhere)
[Enter Phone Number]  ← Custom 10-digit keypad, no native keyboard
      ↓  (auto-submits at 10 digits)
[Phone Lookup]
      ├── Found → "Welcome back, [Name]!" (shows loyalty points)
      └── Not found → Enter first name (on-screen keyboard)
            ↓
[Select Services]  ← Touch-friendly grid of all your services
      ↓  (tap "Check In")
[QR Code Ticket]  ← Auto-resets to idle after 30 seconds
```

### Phone Entry Screen
- Split-screen layout: store branding on the left, numpad on the right
- Circular number buttons (1–9, 0, backspace) — no native tablet keyboard ever appears
- Auto-submits once 10 digits are entered
- Shows formatted phone number as digits are entered: `(555) 555-5555`

### Service Selection Screen
- 3-column grid of all services for your store
- Shows: service name, category, duration, and price
- Tap to select/deselect (multiple services allowed)
- Running total and duration shown at the bottom
- "Check In" button submits and creates a walk-in appointment

### QR Code Ticket Screen
- Large QR code displayed for staff to scan
- Client info and selected services shown on the left panel
- Auto-resets to idle after **30 seconds**
- "New Check-in" button resets immediately

---

## Staff: Scanning a QR Code Ticket

When a client shows you their QR code:

1. **Scan the QR code** with any smartphone or tablet camera (it opens a URL automatically)
2. The ticket page loads showing:
   - Client name and phone
   - Services requested + prices + total duration
   - Check-in time
   - Booking reference number (linked to appointment in the system)
3. **Use the action buttons** to track the service:
   - **📣 Call Client to Chair** — marks the ticket as "Called"
   - **💈 Start Service** — marks as "Now Serving"
   - **✓ Mark as Completed** — closes the ticket

Ticket URLs look like:
```
https://[your-domain]/kiosk/[slug]/ticket/[token]
```

> Tickets expire after **4 hours**.

---

## New vs. Returning Clients

| Scenario | What Happens |
|---|---|
| **Returning client** (phone found) | Greeted by name, loyalty points shown, proceeds to service selection |
| **New client** (phone not found) | Shown on-screen QWERTY keyboard to enter first name, then proceeds to service selection |
| **Walk-in (new)** | A new appointment is created with `status: checked_in` and linked to the QR ticket |
| **Walk-in (returning)** | Appointment linked to the existing client record in your database |

---

## Data & Appointments

When a client checks in:

- A **walk-in appointment** is created in your appointments database with:
  - `status: "checked_in"`
  - `checked_in_at: [timestamp]`
  - The selected service (first service if multiple)
  - The client ID (if found)
- A **kiosk_checkins record** is created, storing the token, services JSON, client info, and appointment link
- The QR code encodes a URL that staff can scan to view all check-in details

You can view walk-in appointments in your **Calendar** and **Front Desk** views like any other appointment.

---

## Kiosk Hardware Recommendations

| Setting | Recommendation |
|---|---|
| **Device** | iPad (any modern model) or Android tablet 10"+ |
| **Orientation** | Landscape |
| **Browser** | Safari (iPad) or Chrome (Android) |
| **Full screen** | Add to Home Screen for a kiosk-style fullscreen mode |
| **Auto-brightness** | Set to always-on / prevent sleep |
| **Stand** | Countertop stand or wall mount at chest height |
| **Network** | WiFi connected to same network as your POS |

### Prevent Sleep (iPad)
Settings → Display & Brightness → Auto-Lock → **Never**

### Prevent Sleep (Android)
Settings → Display → Screen timeout → **Never** (or maximum available)

---

## Security & Privacy

- The kiosk URL is **public** (no login required) — the slug is your only access control
- Phone numbers are looked up but never displayed in full to clients
- Tokens in QR codes expire after 4 hours
- Client data stays within your store's database — nothing is shared externally
- The kiosk is scoped to **your store only** — clients can't see other stores' data

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Store not found" error | Check your slug is correct (Settings → Booking Link) |
| Services not showing | Add services in Services & Products → Services |
| Phone lookup never finds clients | Clients must have a phone number on file in the Clients tab |
| QR code won't scan | Ensure the QR is fully visible; try different angles or more light |
| Ticket expired | Tickets expire after 4 hours; have the client re-check in |
| Page reloads after 30s | This is by design (auto-reset for privacy); disable only via code change |
| Tablet keyboard appears | Use the kiosk URL, not a normal browser form — the keypad is custom |

---

## URL Reference

| URL | Purpose |
|---|---|
| `/kiosk/:slug` | Client-facing check-in kiosk (tablet) |
| `/kiosk/:slug/ticket/:token` | Staff ticket viewer (from QR scan) |
| `/api/public/kiosk/:slug/config` | Store config + services (public API) |
| `/api/public/kiosk/:slug/lookup` | Client phone lookup (public API) |
| `/api/public/kiosk/:slug/checkin` | Create check-in session (public API) |
| `/api/public/kiosk/ticket/:token` | Fetch ticket data (public API) |
| `/api/public/kiosk/ticket/:token/status` | Update ticket status (public API) |
