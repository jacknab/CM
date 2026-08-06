/**
 * m2ReaderPicker.js
 *
 * A self-contained modal that lets the merchant pick a nearby Stripe M2
 * reader and connect to it. Depends on certxaTerminalBridge.js being
 * loaded first (uses window.CertxaTerminalBridge).
 *
 * Usage:
 *   <link rel="stylesheet" href="/m2ReaderPicker.css">
 *   <script src="/certxaTerminalBridge.js"></script>
 *   <script src="/m2ReaderPicker.js"></script>
 *   <script>
 *     document.getElementById('pair-reader-btn').addEventListener('click', function () {
 *       CertxaReaderPicker.open({
 *         onConnected: function () { console.log('M2 connected'); }
 *       });
 *     });
 *   </script>
 */
(function (global) {
  var STATUS_LABELS = {
    discovering: 'Searching for nearby readers…',
    connecting: 'Connecting…',
    connected: 'Connected!',
    discovery_failed: 'Could not search for readers. Check Bluetooth is on.',
    connect_failed: 'Could not connect to that reader. Try again.',
    reader_not_found: 'That reader is no longer available. Rescan and try again.',
    no_location_set: 'No account selected yet — reload the page and try again.',
  };

  var overlayEl = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function close() {
    if (!overlayEl) return;
    global.CertxaTerminalBridge.stopPairingM2();
    overlayEl.remove();
    overlayEl = null;
  }

  function open(options) {
    options = options || {};
    if (!global.CertxaTerminalBridge || !global.CertxaTerminalBridge.isInsideApp()) {
      if (options.onError) options.onError(new Error('Card reader pairing only available in the app'));
      return;
    }

    if (overlayEl) return; // already open

    overlayEl = el('div', 'ctp-overlay');
    var modal = el('div', 'ctp-modal');
    var header = el('div', 'ctp-header');
    header.appendChild(el('h2', 'ctp-title', 'Connect a card reader'));
    var closeBtn = el('button', 'ctp-close', '\u00D7');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    var statusEl = el('div', 'ctp-status', 'Searching for nearby readers…');
    var listEl = el('ul', 'ctp-reader-list');
    var emptyStateEl = el('div', 'ctp-empty', 'No readers found yet. Make sure the M2 is powered on and nearby.');
    emptyStateEl.style.display = 'none';

    modal.appendChild(header);
    modal.appendChild(statusEl);
    modal.appendChild(listEl);
    modal.appendChild(emptyStateEl);
    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) close();
    });

    function renderReaders(readers) {
      listEl.innerHTML = '';
      emptyStateEl.style.display = readers.length === 0 ? 'block' : 'none';

      readers.forEach(function (reader) {
        var item = el('li', 'ctp-reader-item');
        var label = el('div', 'ctp-reader-label');
        label.appendChild(el('span', 'ctp-reader-name', 'M2 Reader \u00B7 ' + reader.serialNumber));

        if (reader.batteryLevel != null) {
          var pct = Math.round(reader.batteryLevel * 100);
          label.appendChild(el('span', 'ctp-reader-battery', pct + '% battery'));
        }

        var connectBtn = el('button', 'ctp-connect-btn', 'Connect');
        connectBtn.addEventListener('click', function () {
          connectBtn.disabled = true;
          connectBtn.textContent = 'Connecting…';
          global.CertxaTerminalBridge.connectToReader(reader.serialNumber);
        });

        item.appendChild(label);
        item.appendChild(connectBtn);
        listEl.appendChild(item);
      });
    }

    function handleStatus(status) {
      statusEl.textContent = STATUS_LABELS[status] || status;

      if (status === 'connected') {
        if (options.onConnected) options.onConnected();
        setTimeout(close, 800); // brief confirmation before closing
      }

      if (status === 'connect_failed' || status === 'reader_not_found') {
        // Re-enable any disabled connect buttons so the merchant can retry.
        listEl.querySelectorAll('.ctp-connect-btn').forEach(function (btn) {
          btn.disabled = false;
          btn.textContent = 'Connect';
        });
      }
    }

    global.CertxaTerminalBridge.setReaderType('bluetoothM2');
    global.CertxaTerminalBridge.startPairingM2(renderReaders, handleStatus);
  }

  global.CertxaReaderPicker = { open: open, close: close };
})(window);
