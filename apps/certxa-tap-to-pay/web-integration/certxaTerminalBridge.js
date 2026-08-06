/**
 * certxaTerminalBridge.js
 *
 * Talks to the native Android app wrapper (WebView) via postMessage.
 * Include this on any page that needs to trigger card-present payments
 * (e.g. certxa.com/auth). Everything here is a no-op outside the app
 * (isInsideApp() is false), so it's safe to load on the regular website
 * too.
 *
 * Exposes window.CertxaTerminalBridge with the functions below.
 */
(function (global) {
  function isInsideApp() {
    return !!global.ReactNativeWebView;
  }

  function postToApp(message) {
    if (!isInsideApp()) return;
    global.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  // Call once whenever the client's Stripe Terminal Location is known —
  // on page load, and again if it ever changes. There's no account ID
  // or token to pass here: the backend resolves which connected account
  // to charge entirely from the certxa.sid session cookie the app reads
  // out of this WebView, so the page doesn't need to supply one.
  function setActiveAccount(locationId) {
    postToApp({ type: 'SET_ACCOUNT', locationId: locationId });
  }

  // 'tapToPay' (default, uses the phone's own NFC) or 'bluetoothM2'
  // (a physical Stripe M2 reader — must be paired first).
  function setReaderType(readerType) {
    postToApp({ type: 'SET_READER_TYPE', readerType });
  }

  function collectPayment(amount, currency) {
    currency = currency || 'usd';
    return new Promise(function (resolve, reject) {
      if (!isInsideApp()) {
        reject(new Error('Card reader only available in the app'));
        return;
      }

      var requestId =
        global.crypto && global.crypto.randomUUID
          ? global.crypto.randomUUID()
          : 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      function onMessage(event) {
        var data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        if (data.type === 'PAYMENT_RESULT' && data.requestId === requestId) {
          global.removeEventListener('message', onMessage);
          if (data.status === 'succeeded') resolve(data);
          else reject(new Error(data.error || 'Payment failed'));
        }
      }

      global.addEventListener('message', onMessage);
      postToApp({ type: 'COLLECT_PAYMENT', requestId: requestId, amount: amount, currency: currency });
    });
  }

  // --- M2 (Bluetooth) reader pairing ---
  //
  // Unlike Tap to Pay, an M2 reader is a physical device and has to be
  // discovered and picked from a list. These functions stream
  // READER_LIST / READER_STATUS events to whichever callbacks were
  // registered via startPairingM2().

  var onReaderListUpdate = null;
  var onReaderStatusUpdate = null;

  function startPairingM2(onReaders, onStatus) {
    onReaderListUpdate = onReaders; // (readers: {serialNumber, deviceType, batteryLevel}[]) => void
    onReaderStatusUpdate = onStatus; // (status: string) => void
    postToApp({ type: 'PAIR_BLUETOOTH_READER' });
  }

  function stopPairingM2() {
    postToApp({ type: 'CANCEL_DISCOVERY' });
    onReaderListUpdate = null;
    onReaderStatusUpdate = null;
  }

  function connectToReader(serialNumber) {
    postToApp({ type: 'CONNECT_BLUETOOTH_READER', serialNumber: serialNumber });
  }

  // --- Calls straight to YOUR backend (not through the native app) ---
  // These run in the page itself, so normal browser cookies apply —
  // credentials: 'include' sends the certxa.sid cookie the same way any
  // other authenticated call on this page already does.
  //
  // Same-origin as the site itself — confirmed the connection-token
  // route already lives at /api/payments/terminal/connection-token.

  var BACKEND_URL = 'https://certxa.com/api/payments';

  // Gets (or creates, on first call for this store) the Stripe Terminal
  // Location ID, then hands it straight to setActiveAccount(). Call this
  // once on page load before any payment/pairing action is available.
  function fetchTerminalLocationId() {
    return fetch(BACKEND_URL + '/terminal/location', {
      method: 'GET',
      credentials: 'include',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch terminal location: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        return data.locationId;
      });
  }

  // One-time step to link a physical M2 to this store, using the
  // registration code printed on/with the reader. Only needs to be
  // called once per reader, from whatever "add a reader" UI you build.
  function registerReader(registrationCode, label) {
    return fetch(BACKEND_URL + '/terminal/reader/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationCode: registrationCode, label: label }),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw new Error(data.message || 'Failed to register reader');
        });
      }
      return res.json();
    });
  }

  global.addEventListener('message', function (event) {
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (data.type === 'READER_LIST' && onReaderListUpdate) onReaderListUpdate(data.readers);
    if (data.type === 'READER_STATUS' && onReaderStatusUpdate) onReaderStatusUpdate(data.status);
  });

  global.CertxaTerminalBridge = {
    isInsideApp: isInsideApp,
    setActiveAccount: setActiveAccount,
    setReaderType: setReaderType,
    collectPayment: collectPayment,
    startPairingM2: startPairingM2,
    stopPairingM2: stopPairingM2,
    connectToReader: connectToReader,
    fetchTerminalLocationId: fetchTerminalLocationId,
    registerReader: registerReader,
  };
})(window);
