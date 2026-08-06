# What to add to certxa.com/auth

The app can only relay messages — the payment trigger has to come from
your page's own JavaScript. The real, ready-to-use version of this code
now lives in `web-integration/` (see that folder's README for a
Replit AI prompt to wire it in). This file is a shorter reference for
the protocol itself.

```js
function isInsideApp() {
  return !!window.ReactNativeWebView;
}

// Call once whenever the client's Stripe Terminal Location is known —
// on page load, and again if it ever changes. No account ID or token
// needed: the backend resolves which connected account to charge from
// the certxa.sid session cookie the app reads out of this WebView.
function setActiveAccount(locationId) {
  if (!isInsideApp()) return;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SET_ACCOUNT', locationId }));
}

function collectPayment(amount, currency = 'usd') {
  return new Promise((resolve, reject) => {
    if (!isInsideApp()) {
      reject(new Error('Card reader only available in the app'));
      return;
    }

    const requestId = crypto.randomUUID();

    function onMessage(event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'PAYMENT_RESULT' && data.requestId === requestId) {
        window.removeEventListener('message', onMessage);
        if (data.status === 'succeeded') resolve(data);
        else reject(new Error(data.error || 'Payment failed'));
      }

      if (data.type === 'READER_STATUS') {
        // optional: update a "Connecting reader…" spinner in your UI
        console.log('Reader status:', data.status);
      }
    }

    window.addEventListener('message', onMessage);

    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'COLLECT_PAYMENT', requestId, amount, currency })
    );
  });
}

// Usage:
// CertxaTerminalBridge.fetchTerminalLocationId()
//   .then(function (locationId) { setActiveAccount(locationId); });
// collectPayment(1999, 'usd').then(() => showReceipt()).catch(showError);
```

For M2 (Bluetooth) reader pairing, don't build this by hand — use
`web-integration/certxaTerminalBridge.js` + `m2ReaderPicker.js`, which
already implement `SET_READER_TYPE`, `PAIR_BLUETOOTH_READER`,
`CONNECT_BLUETOOTH_READER`, and the picker UI itself.

Notes:
- `amount` is in the smallest currency unit (cents), matching Stripe's convention.
- Android WebView delivers native->web messages as `message` events on
  `window` — the listener above matches what `App.tsx`'s `sendToWeb()` injects.
- Consider hiding/disabling the "Charge card" button entirely when
  `isInsideApp()` is false, so the plain browser version of the site doesn't
  show a payment path that can't work there.
- **Auth:** the app authenticates to the backend using the same
  `certxa.sid` cookie this WebView already has from a normal login — no
  separate credential is passed from the page. Make sure the user is
  actually logged in before calling `collectPayment()`.
- `locationId` is the Stripe Terminal Location tied to the current
  client's connected account — each client needs their own. You no
  longer need to look this up or store it yourself:
  `CertxaTerminalBridge.fetchTerminalLocationId()` fetches it from your
  backend, which creates it automatically (via the store's address) the
  first time it's needed for that store.
- **Registering a physical M2 reader** (one-time, per reader) is done
  with `CertxaTerminalBridge.registerReader(registrationCode, label)`
  — build a small "Add a card reader" form somewhere in your admin/
  settings UI where a merchant types in the code printed on their M2.
