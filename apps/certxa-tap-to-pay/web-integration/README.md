# Web integration: M2 reader picker

This folder contains everything needed to add card-reader pairing to
certxa.com/auth — it just needs to be wired into the actual page.

```
certxaTerminalBridge.js   — talks to the native app wrapper (postMessage)
m2ReaderPicker.js         — modal UI: scans, lists, and connects to M2 readers
m2ReaderPicker.css        — styling for the modal
```

## What it does

Calling `CertxaReaderPicker.open()` opens a modal that:
1. Tells the app to start scanning for nearby M2 readers.
2. Renders each one found (serial number + battery %) with a "Connect" button.
3. On tap, tells the app to connect to that reader.
4. Shows connect/fail states and closes automatically once connected.

It's plain, dependency-free JS/CSS — no build step, no framework
required — so it should drop into almost any web app.

## How to hand this to Replit AI

Paste the prompt below into Replit AI (or Claude/any coding agent)
**with this repo/folder open in the workspace**, so it can see the
actual files and your existing certxa.com/auth code to match against.

---

### Prompt to give Replit AI

```
I have three files in /web-integration that need to be wired into our
existing web app at the /auth route: certxaTerminalBridge.js,
m2ReaderPicker.js, and m2ReaderPicker.css.

Please:

1. Move or copy these three files into wherever our static assets /
   public JS lives in this project, and load them on the /auth page —
   certxaTerminalBridge.js first, then m2ReaderPicker.js, then the CSS.
   Don't rename the files or the functions they expose
   (window.CertxaTerminalBridge and window.CertxaReaderPicker) —  other
   code depends on those exact names.

2. On page load (after we know the user is logged in), call
   CertxaTerminalBridge.fetchTerminalLocationId() and pass the result to
   CertxaTerminalBridge.setActiveAccount(locationId). This talks to our
   backend, which creates the store's Stripe Terminal Location
   automatically the first time it's called — you don't need to find or
   store a location ID anywhere yourself. Re-run this if the logged-in
   client/store ever changes without a full page reload.

3. Add a small "Add a card reader" form somewhere in our admin/settings
   area (ask me where if it's not obvious) with one text input for a
   registration code (printed on/with each physical M2 reader) and an
   optional label input. On submit, call
   CertxaTerminalBridge.registerReader(registrationCode, label) and show
   a success/error message — registration codes expire after ~24 hours,
   so a clear error message matters here (surface whatever error string
   comes back rather than a generic one).

4. Add a "Connect card reader" button somewhere sensible near
   checkout/payment (this is separate from the registration form above
   — registration links a reader to the store once, this button is what
   a merchant taps at the start of a shift to actually connect to it
   over Bluetooth). Wire it to call CertxaReaderPicker.open({
   onConnected: () => { /* update UI to show a reader is connected */ }
   }).

5. Find or create wherever we trigger a card charge, and make sure it
   calls CertxaTerminalBridge.collectPayment(amountInCents, currency)
   and handles both the resolved (success) and rejected (failure) cases
   — show a loading/spinner state while it's pending, since the
   customer will be tapping/inserting a card during that time.

6. Everything in CertxaTerminalBridge is a safe no-op when not running
   inside our Android app wrapper (CertxaTerminalBridge.isInsideApp()
   returns false) — please guard any UI that depends on it (the
   registration form, "Connect card reader" button, etc.) so it's
   hidden or disabled on plain desktop/browser visits instead of
   showing something that can't work there.

Don't invent new payment logic beyond what's needed to call these
functions — the actual Stripe API calls happen in our backend and
native app, not here. If anything about our existing auth/session
structure, amount formatting, or currency handling is unclear, ask me
before guessing.
```

---

## Notes for you before running that prompt

- There's no `sessionToken` to find or pass anymore — the app reads the
  `certxa.sid` session cookie directly out of the WebView and forwards
  it to the backend itself. The only thing `/auth` needs to tell the
  app is the Stripe Terminal `locationId`.
- For that cookie-forwarding to actually work, your backend (see
  `../backend/`) needs to be reachable under a domain the `certxa.sid`
  cookie's `Domain` attribute covers — double check that once it's
  deployed, since a mismatched domain silently means the app can't
  authenticate at all.
- `fetchTerminalLocationId()` creates a Stripe Terminal Location using
  address fields read off your `locations` table
  (`address`/`city`/`state`/`postal_code`/`country`) — see the note in
  `../backend/src/services/terminalLocation.js` if those column names
  don't match your actual schema; Stripe will return a clear validation
  error if a field is missing rather than failing silently.
- If some of your clients only ever use Tap to Pay (not M2), you may
  not want the "Connect card reader" button visible for them — that's a
  business-logic decision Replit AI can't make for you, so double check
  its guess or tell it explicitly in a follow-up.
- The modal's default styling is intentionally plain/neutral
  (`m2ReaderPicker.css`) so it won't clash with your site — feel free to
  have Replit AI restyle it to match certxa.com's existing design system
  once it's wired up and working.
