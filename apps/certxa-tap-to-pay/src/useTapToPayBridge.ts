import { useCallback, useRef } from 'react';
import { useStripeTerminal, Reader } from '@stripe/stripe-terminal-react-native';
import { setCurrentLocationId, getCurrentLocationId } from './currentLocation';
import { getSessionCookieHeader } from './sessionCookie';
import { BACKEND_BASE_URL } from './backendConfig';

/**
 * Messages the WEBSITE can send into the app (via
 * window.ReactNativeWebView.postMessage(JSON.stringify(msg))):
 *
 *   { type: 'SET_ACCOUNT', locationId }
 *      -> tells the app which Stripe Terminal Location to use for this
 *         client. Send this once when the page loads / whenever the
 *         logged-in client changes, before COLLECT_PAYMENT. Note there's
 *         no account ID or token here anymore — the backend derives
 *         which connected account to charge entirely from the session
 *         cookie the WebView is already holding.
 *
 *   { type: 'SET_READER_TYPE', readerType: 'tapToPay' | 'bluetoothM2' }
 *      -> chooses which hardware to use for the next payment.
 *         'tapToPay' uses the phone's own NFC (no pairing needed).
 *         'bluetoothM2' uses a physical Stripe M2 reader, which must be
 *         paired first via PAIR_BLUETOOTH_READER / CONNECT_BLUETOOTH_READER.
 *
 *   { type: 'PAIR_BLUETOOTH_READER' }
 *      -> starts a Bluetooth scan for nearby M2 readers. Results stream
 *         back as READER_LIST messages (may fire more than once as more
 *         readers are found). Call CANCEL_DISCOVERY to stop scanning.
 *
 *   { type: 'CONNECT_BLUETOOTH_READER', serialNumber }
 *      -> connects to one of the readers from the most recent
 *         READER_LIST message, identified by serialNumber.
 *
 *   { type: 'CANCEL_DISCOVERY' }
 *      -> stops an in-progress Bluetooth scan.
 *
 *   { type: 'COLLECT_PAYMENT', requestId, amount, currency }
 *      -> ensures a reader is connected (Tap to Pay auto-connects;
 *         Bluetooth M2 must already be paired), creates the PaymentIntent
 *         via your backend (account resolved server-side from the
 *         session cookie), collects + confirms it on the reader
 *         (authorization only — capture_method is "manual" on the
 *         backend), then calls your backend's /capture endpoint to
 *         actually take the funds.
 *
 * Messages the APP sends back to the website (delivered as a
 * `message` event on `window`):
 *
 *   { type: 'PAYMENT_RESULT', requestId, status: 'succeeded' | 'failed', error? }
 *   { type: 'READER_STATUS', status }
 *   { type: 'READER_LIST', readers: { serialNumber, deviceType, batteryLevel }[] }
 */

type ReaderType = 'tapToPay' | 'bluetoothM2';

type WebMessage =
  | { type: 'SET_ACCOUNT'; locationId: string }
  | { type: 'SET_READER_TYPE'; readerType: ReaderType }
  | { type: 'PAIR_BLUETOOTH_READER' }
  | { type: 'CONNECT_BLUETOOTH_READER'; serialNumber: string }
  | { type: 'CANCEL_DISCOVERY' }
  | { type: 'COLLECT_PAYMENT'; requestId: string; amount: number; currency: string }
  | { type: 'CANCEL_PAYMENT'; requestId: string };

type NativeMessage =
  | { type: 'PAYMENT_RESULT'; requestId: string; status: 'succeeded' | 'failed'; error?: string }
  | { type: 'READER_STATUS'; status: string }
  | {
      type: 'READER_LIST';
      readers: { serialNumber: string; deviceType: string; batteryLevel: number | null }[];
    };

// Calls your backend's POST /terminal/payment-intent (see
// api-server-integration/), which wraps createTerminalPaymentIntent().
// Note this is created with capture_method: "manual" server-side — the
// reader only AUTHORIZES the card; captureOnBackend() below is what
// actually takes the money, called after the SDK confirms collection.
async function createPaymentIntentOnBackend(
  amount: number,
  currency: string
): Promise<{ clientSecret: string; id: string }> {
  const cookieHeader = await getSessionCookieHeader();

  const res = await fetch(`${BACKEND_BASE_URL}/terminal/payment-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ amount, currency }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create PaymentIntent: ${res.status}`);
  }

  const { clientSecret, id } = await res.json();
  return { clientSecret, id };
}

async function captureOnBackend(paymentIntentId: string): Promise<void> {
  const cookieHeader = await getSessionCookieHeader();

  const res = await fetch(`${BACKEND_BASE_URL}/terminal/payment-intent/${paymentIntentId}/capture`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
  });

  if (!res.ok) {
    throw new Error(`Failed to capture payment: ${res.status}`);
  }
}

// Best-effort — called if something fails after a PaymentIntent was
// already created, so it doesn't sit around authorized-but-uncaptured
// forever. A failure here isn't itself fatal to reporting the original
// error back to the web page.
async function cancelOnBackendBestEffort(paymentIntentId: string): Promise<void> {
  try {
    const cookieHeader = await getSessionCookieHeader();
    await fetch(`${BACKEND_BASE_URL}/terminal/payment-intent/${paymentIntentId}/cancel`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
  } catch (err) {
    console.warn('Best-effort PaymentIntent cancel also failed:', err);
  }
}

// Session-scoped state — one active WebView/session at a time in this app.
let preferredReaderType: ReaderType = 'tapToPay';
let lastDiscoveredReaders: Reader.Type[] = [];

export function useTapToPayBridge(sendToWeb: (payload: NativeMessage) => void) {
  const {
    discoverReaders,
    cancelDiscovering,
    connectLocalMobileReader, // Tap to Pay on Android
    connectBluetoothReader, // Stripe M2, BBPOS WisePOS E, etc.
    connectedReader,
    collectPaymentMethod,
    confirmPaymentIntent,
    retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      lastDiscoveredReaders = readers;
      sendToWeb({
        type: 'READER_LIST',
        readers: readers.map((r) => ({
          serialNumber: r.serialNumber,
          deviceType: r.deviceType ?? 'unknown',
          batteryLevel: r.batteryLevel ?? null,
        })),
      });
    },
  });

  const busyRef = useRef(false);
  const discoveringRef = useRef(false);

  // --- Tap to Pay: fully automatic, no user reader-selection needed ---
  const ensureTapToPayConnected = useCallback(async () => {
    if (connectedReader) return connectedReader;
    const locationId = getCurrentLocationId();
    if (!locationId) {
      throw new Error('No location set for this client — send SET_ACCOUNT first');
    }

    sendToWeb({ type: 'READER_STATUS', status: 'discovering' });

    const { readers, error: discoverError } = await discoverReaders({
      discoveryMethod: 'localMobile',
      simulated: __DEV__, // flip off for real hardware/production
    });

    if (discoverError || !readers?.length) {
      throw new Error(discoverError?.message ?? 'No Tap to Pay reader found');
    }

    sendToWeb({ type: 'READER_STATUS', status: 'connecting' });

    const { reader, error: connectError } = await connectLocalMobileReader({
      reader: readers[0],
      locationId,
    });

    if (connectError || !reader) {
      throw new Error(connectError?.message ?? 'Failed to connect Tap to Pay reader');
    }

    sendToWeb({ type: 'READER_STATUS', status: 'connected' });
    return reader;
  }, [connectedReader, discoverReaders, connectLocalMobileReader, sendToWeb]);

  // --- Bluetooth M2: must already be paired via the flow below ---
  const ensureBluetoothConnected = useCallback(async () => {
    if (connectedReader) return connectedReader;
    throw new Error('No M2 reader connected — pair one first (PAIR_BLUETOOTH_READER)');
  }, [connectedReader]);

  const ensureReaderConnected = useCallback(async () => {
    return preferredReaderType === 'bluetoothM2'
      ? ensureBluetoothConnected()
      : ensureTapToPayConnected();
  }, [ensureBluetoothConnected, ensureTapToPayConnected]);

  // Scans for nearby M2 readers. Results stream back via onUpdateDiscoveredReaders
  // above as they're found — the web page should render them as a picker.
  const pairBluetoothReader = useCallback(async () => {
    if (discoveringRef.current) return;
    discoveringRef.current = true;
    lastDiscoveredReaders = [];

    sendToWeb({ type: 'READER_STATUS', status: 'discovering' });

    const { error } = await discoverReaders({
      discoveryMethod: 'bluetoothScan',
      simulated: __DEV__,
    });

    discoveringRef.current = false;

    if (error) {
      sendToWeb({ type: 'READER_STATUS', status: 'discovery_failed' });
    }
  }, [discoverReaders, sendToWeb]);

  const connectBluetoothReaderBySerial = useCallback(
    async (serialNumber: string) => {
      const reader = lastDiscoveredReaders.find((r) => r.serialNumber === serialNumber);
      if (!reader) {
        sendToWeb({ type: 'READER_STATUS', status: 'reader_not_found' });
        return;
      }
      const locationId = getCurrentLocationId();
      if (!locationId) {
        sendToWeb({ type: 'READER_STATUS', status: 'no_location_set' });
        return;
      }

      sendToWeb({ type: 'READER_STATUS', status: 'connecting' });

      const { reader: connected, error } = await connectBluetoothReader({
        reader,
        locationId,
      });

      if (error || !connected) {
        sendToWeb({ type: 'READER_STATUS', status: 'connect_failed' });
        return;
      }

      sendToWeb({ type: 'READER_STATUS', status: 'connected' });
    },
    [connectBluetoothReader, sendToWeb]
  );

  const collectPayment = useCallback(
    async (requestId: string, amount: number, currency: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      // Tracked outside the try so the catch block can attempt a
      // best-effort cancel if we got far enough to create one.
      let paymentIntentId: string | null = null;

      try {
        await ensureReaderConnected();

        // Your backend already created the PaymentIntent (with
        // capture_method: "manual") — we retrieve THAT one into the
        // SDK rather than creating a second, separate one.
        const { clientSecret, id } = await createPaymentIntentOnBackend(amount, currency);
        paymentIntentId = id;

        const { paymentIntent, error: retrieveError } = await retrievePaymentIntent(clientSecret);

        if (retrieveError || !paymentIntent) {
          throw new Error(retrieveError?.message ?? 'Could not retrieve PaymentIntent');
        }

        const { paymentIntent: collected, error: collectError } =
          await collectPaymentMethod({ paymentIntent });

        if (collectError || !collected) {
          throw new Error(collectError?.message ?? 'Failed to collect payment method');
        }

        // This AUTHORIZES the card (capture_method is "manual" on the
        // backend) — it does not move money yet.
        const { paymentIntent: confirmed, error: confirmError } =
          await confirmPaymentIntent({ paymentIntent: collected });

        if (confirmError || !confirmed) {
          throw new Error(confirmError?.message ?? 'Failed to confirm payment');
        }

        // This is the step that actually captures the funds.
        await captureOnBackend(paymentIntentId);

        sendToWeb({ type: 'PAYMENT_RESULT', requestId, status: 'succeeded' });
      } catch (err: any) {
        if (paymentIntentId) {
          await cancelOnBackendBestEffort(paymentIntentId);
        }
        sendToWeb({
          type: 'PAYMENT_RESULT',
          requestId,
          status: 'failed',
          error: err?.message ?? 'Unknown error',
        });
      } finally {
        busyRef.current = false;
      }
    },
    [ensureReaderConnected, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent, sendToWeb]
  );

  const handleWebMessage = useCallback(
    (msg: WebMessage) => {
      switch (msg.type) {
        case 'SET_ACCOUNT':
          setCurrentLocationId(msg.locationId);
          break;
        case 'SET_READER_TYPE':
          preferredReaderType = msg.readerType;
          break;
        case 'PAIR_BLUETOOTH_READER':
          pairBluetoothReader();
          break;
        case 'CONNECT_BLUETOOTH_READER':
          connectBluetoothReaderBySerial(msg.serialNumber);
          break;
        case 'CANCEL_DISCOVERY':
          cancelDiscovering();
          discoveringRef.current = false;
          break;
        case 'COLLECT_PAYMENT':
          collectPayment(msg.requestId, msg.amount, msg.currency);
          break;
        case 'CANCEL_PAYMENT':
          // wire up cancelCollectPaymentMethod() here if needed
          break;
      }
    },
    [collectPayment, pairBluetoothReader, connectBluetoothReaderBySerial, cancelDiscovering]
  );

  return { handleWebMessage };
}
