/**
 * certxaTerminalBridge.js
 *
 * Drop this script on any certxa.com page that needs to trigger card-present
 * payments from the Certxa Owner App (Android WebView wrapper).
 *
 * Everything here is a safe no-op outside the app — isInsideApp() is false in
 * a regular browser, so existing web pages can load this script without harm.
 *
 * Usage:
 *   <script src="/certxaTerminalBridge.js"></script>
 *   <script>
 *     // 1. On page load, fetch + register the store's Terminal location.
 *     CertxaTerminalBridge.fetchTerminalLocationId()
 *       .then(locationId => CertxaTerminalBridge.setActiveAccount(locationId));
 *
 *     // 2. To charge a card (Tap to Pay or already-paired M2):
 *     CertxaTerminalBridge.collectPayment(1999, 'usd')
 *       .then(() => showReceipt())
 *       .catch(err => showError(err.message));
 *
 *     // 3. To pair a physical M2 reader (one-time per device), open the picker:
 *     CertxaReaderPicker.open({ onConnected: () => console.log('M2 ready') });
 *   </script>
 *
 * Ported from apps/certxa-tap-to-pay/web-integration/ — adapted to match the
 * actual API routes in artifacts/api-server/src/routes/stripeConnect.ts.
 */
(function (global) {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isInsideApp() {
    return !!global.ReactNativeWebView;
  }

  function postToApp(message) {
    if (!isInsideApp()) return;
    global.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  // ── Account / reader type ──────────────────────────────────────────────────

  /**
   * Call once after fetchTerminalLocationId() resolves, and again whenever the
   * logged-in store changes. Tells the app which Stripe Terminal Location to use.
   * No account token needed — the app authenticates via the session cookie.
   */
  function setActiveAccount(locationId) {
    postToApp({ type: 'SET_ACCOUNT', locationId: locationId });
  }

  /**
   * Switch between 'tapToPay' (phone NFC, default) and 'bluetoothM2'
   * (physical M2 reader — must be paired first via CertxaReaderPicker).
   */
  function setReaderType(readerType) {
    postToApp({ type: 'SET_READER_TYPE', readerType: readerType });
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  /**
   * Collects a card-present payment on the currently active reader.
   * Returns a Promise that resolves on success or rejects with an Error.
   * @param {number} amount   Amount in smallest currency unit (cents).
   * @param {string} currency ISO currency code, e.g. 'usd'.
   */
  function collectPayment(amount, currency) {
    currency = currency || 'usd';
    return new Promise(function (resolve, reject) {
      if (!isInsideApp()) {
        reject(new Error('Card reader is only available inside the Certxa app'));
        return;
      }

      var requestId =
        global.crypto && global.crypto.randomUUID
          ? global.crypto.randomUUID()
          : 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      function onMessage(event) {
        var data;
        try { data = JSON.parse(event.data); } catch (e) { return; }
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

  // ── M2 Bluetooth pairing ───────────────────────────────────────────────────

  var _onReaderList   = null;
  var _onReaderStatus = null;

  /**
   * Starts a Bluetooth scan for nearby M2 readers.
   * @param {function} onReaders  Called with [{serialNumber, deviceType, batteryLevel}] as readers are found.
   * @param {function} onStatus   Called with a status string as discovery/connection progresses.
   */
  function startPairingM2(onReaders, onStatus) {
    _onReaderList   = onReaders;
    _onReaderStatus = onStatus;
    postToApp({ type: 'PAIR_BLUETOOTH_READER' });
  }

  function stopPairingM2() {
    postToApp({ type: 'CANCEL_DISCOVERY' });
    _onReaderList   = null;
    _onReaderStatus = null;
  }

  function connectToReader(serialNumber) {
    postToApp({ type: 'CONNECT_BLUETOOTH_READER', serialNumber: serialNumber });
  }

  // ── Backend helpers (called directly from the page, not via the app) ────────
  // Same-origin as certxa.com — credentials: 'include' forwards the session
  // cookie exactly like any other authenticated fetch on this page.

  var BACKEND_URL = '/api/payments';

  /**
   * Fetches (or auto-creates) the Stripe Terminal Location for this store, then
   * registers it with the app via setActiveAccount(). Call once on page load.
   * @returns {Promise<string>} The locationId.
   */
  function fetchTerminalLocationId() {
    return fetch(BACKEND_URL + '/terminal/location', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch terminal location: ' + res.status);
        return res.json();
      })
      .then(function (data) { return data.locationId; });
  }

  /**
   * Registers a physical M2 reader with this store using the code printed on the
   * reader. Only needs to be called once per reader (code is valid ~24 h).
   * @param {string} registrationCode  The code from the reader's packaging.
   * @param {string} [label]           Optional friendly name (e.g. "Front desk").
   */
  function registerReader(registrationCode, label) {
    return fetch(BACKEND_URL + '/terminal/reader/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationCode: registrationCode, label: label }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Failed to register reader');
        return data;
      });
    });
  }

  /**
   * Lists M2 readers already registered to this store.
   * @returns {Promise<Array>}
   */
  function listReaders() {
    return fetch(BACKEND_URL + '/terminal/reader/list', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to list readers: ' + res.status);
        return res.json();
      })
      .then(function (data) { return data.readers; });
  }

  // ── Inbound message listener (app → page) ──────────────────────────────────
  global.addEventListener('message', function (event) {
    var data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === 'READER_LIST'   && _onReaderList)   _onReaderList(data.readers);
    if (data.type === 'READER_STATUS' && _onReaderStatus) _onReaderStatus(data.status);
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  global.CertxaTerminalBridge = {
    isInsideApp:           isInsideApp,
    setActiveAccount:      setActiveAccount,
    setReaderType:         setReaderType,
    collectPayment:        collectPayment,
    startPairingM2:        startPairingM2,
    stopPairingM2:         stopPairingM2,
    connectToReader:       connectToReader,
    fetchTerminalLocationId: fetchTerminalLocationId,
    registerReader:        registerReader,
    listReaders:           listReaders,
  };

})(window);
