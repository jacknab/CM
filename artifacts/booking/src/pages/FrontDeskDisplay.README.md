# Front Desk Display — customer-facing tablet

The screen that runs on the customer-facing tablet mounted at the front desk /
POS. It is a trimmed clone of the self-service check-in kiosk — **no** walk-in
booking, service picking, stylist picking, or waitlist. It does three things:
lightweight check-in, the customer tip screen, and card-payment instruction
screens (Stripe M2 reader **or** Tap to Pay on the tablet's own NFC).

Component: [`FrontDeskDisplay.tsx`](./FrontDeskDisplay.tsx) · Route: `/frontdesk/:slug`

---

## Loading it on the tablet

```
https://certxa.com/frontdesk/<bookingSlug>
```

- `<bookingSlug>` is the store's booking slug (`locations.booking_slug`) — the
  same value used by `/kiosk/<slug>`. Find it in the address bar of the store's
  public booking page, or:
  ```bash
  set -a; . /etc/certxa.env; set +a
  psql "$DATABASE_URL" -Atc "SELECT id, name, booking_slug FROM locations WHERE id = <storeId>;"
  ```
- Example — **Luxury Nails (store 2)**: `https://certxa.com/frontdesk/jims`

Open it in a full-screen / kiosk-mode browser (or the Certxa native Android app),
set the device to never sleep, and leave it. It re-fetches catalog/settings every
5 minutes while idle, so it can stay up for days.

---

## One-time setup

1. **Turn on Dual Screen mode.** Owner app → **Kiosk Settings** → enable
   *Dual Screen*. This is what makes the POS and this tablet talk over the
   notifications WebSocket. Without it the tip screen and the payment screens
   never appear.
2. **Point the POS at the same store.** The tablet and the staff POS must be the
   same salon/store — events are routed by `storeId`.
3. **(Tap to Pay only)** The tablet must be an NFC-capable Android running the
   Certxa native app. See "Tap to Pay" below.

---

## What each screen is

| Screen | When |
|---|---|
| **Idle** ("tap to begin", language pills) | Waiting for a customer. Tap anywhere → phone entry. |
| **Phone entry** | Customer types their 10-digit number. Auto-submits on the 10th digit. |
| **You're checked in** (appointment card) | Number matched an appointment today. The server has already set that appointment to `checked_in`. Auto-returns to idle after 30s. |
| **Checked in — see the front desk** | Number matched a client with **no** appointment today, or a brand-new number (after a quick name entry). Front desk takes it from here. |
| **Add a Tip?** | POS asked for a tip. Customer picks a preset, confirms; the amount posts straight back to the POS ticket. |
| **Tap your card on the reader** (M2) | POS started an M2 card charge. Illustration + looping tap animation only — the actual charge runs from the POS via Stripe Terminal. |
| **Tap your card or phone here** (Tap to Pay) | POS started a Tap to Pay charge. This tablet's NFC reader is armed by the native app; the result is sent back to the POS. |
| **Thank you!** | Payment finished. Auto-resets after 15s. |

The check-in screens and the POS overlay are independent — a checkout can start
on top of whatever check-in screen is showing.

---

## How the POS drives it

Staff never touch this tablet. From the POS checkout sheet:

- Opening the checkout → customer sees the tip screen (if not already collected),
  then a "ready for payment" holding screen.
- **M2 Reader** button → tablet shows the M2 instruction screen; Stripe Terminal
  collects on the reader; on approval the tablet shows Thank You.
- **Tap to Pay** button (only visible when Dual Screen is on) → tablet shows the
  NFC instruction screen and arms its reader. Tap the button again to cancel and
  free the tablet. On approval a `tap` tender is added to the ticket
  automatically.

Events used (all over `/ws/notifications?storeId=…`, relayed by the server):
`kiosk_checkout_start`, `kiosk_checkout_tip_request` / `…_tip_selected`,
`kiosk_checkout_await_payment` `{mode:"m2"|"tap"}`, `kiosk_checkout_payment_result`,
`kiosk_checkout_cancel`.

---

## Tap to Pay — native app requirement

The "tap card on this screen" flow needs the **Certxa native Android app** to
implement the bridge (not done yet as of this writing):

1. Receive `{ type: "TAP_TO_PAY", appointmentId, amountCents, clientName }` via
   `ReactNativeWebView.postMessage`, run Tap to Pay on Android, capture.
2. On success: `window.dispatchEvent(new CustomEvent("certxa_native_payment_complete", { detail: { amount, last4 } }))`.
3. On failure: `window.dispatchEvent(new CustomEvent("certxa_native_payment_failed", { detail: { message } }))`.

The page relays both back to the POS as `kiosk_checkout_payment_result`.

Until the native side ships: use the **M2 Reader** button on the POS. If Tap to
Pay is pressed on a non-native browser, the tablet just shows the instruction
screen and nothing completes — press **Cancel** on the POS.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Tip / payment screens never show | Dual Screen mode off, or tablet and POS on different stores. |
| "Failed to connect" on load | Wrong slug, or store account suspended. |
| Payment screen stuck on "Waiting…" | Tap to Pay pressed without the native app — cancel on the POS and use M2. |
| Check-in shows "see the front desk" for someone with an appointment | Their phone number isn't on that client record, or the appointment is >… earlier today / already `completed`/`checked_in`. |
| Tablet shows stale services/prices | It refreshes every 5 min while idle; force with a browser reload. |
