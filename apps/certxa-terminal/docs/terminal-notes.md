## Android configuration
- Required permissions already added in app.json: INTERNET, BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_CONNECT, BLUETOOTH_SCAN, ACCESS_FINE_LOCATION, NFC, WAKE_LOCK.
- For Tap to Pay ensure Google Play Services for AR/NFC is available and device is Play Protect certified; Stripe SDK handles capability checks.
- Use `npx expo prebuild` then `npx expo run:android` (dev client) for native modules.
- For production/signing: configure keystore in `android/app` after prebuild; generate AAB with `gradlew bundleRelease`.

## Backend endpoints (expected)
- GET /api/stripe/terminal/connection-token -> { secret }
- POST /api/payments/create-terminal-payment { amount, currency, orderId } -> { clientSecret, paymentIntentId }

## Terminal flow (native)
- StripeTerminalService wraps the Stripe SDK via useStripeTerminal hook with service-held state.
- Discovery: ReaderSelectScreen calls `discover({ discoveryMethod: 'tapToPay' })` and `discover({ discoveryMethod: 'bluetoothScan' })`; uses merged reader list.
- Connect: `connect({ discoveryMethod: reader.deviceType === 'tapToPay' ? 'tapToPay' : 'bluetoothScan', reader })`.
- Payment: PaymentScreen calls `collectAndProcess(amount, currency, orderId)` which fetches client_secret from backend, then collectPaymentMethod + processPaymentIntent.
- Cancel: PaymentScreen calls `cancelCollectPaymentMethod` on cancel.

## Bridge events
- From web: START_PAYMENT -> PaymentScreen; DISCOVER/CONNECT handled by ReaderSelect navigation; CANCEL triggers cancelCollect.
- To web: PAYMENT_COMPLETE / PAYMENT_FAILED / PAYMENT_CANCELLED; READER_CONNECTED on successful connect.

## Testing notes
- Run `npm run android` after prebuild with a dev client to exercise native modules; Expo Go won’t work for Terminal.
- For Tap to Pay, use a supported Android device and Stripe test cards; ensure NFC enabled.
- For M2/WisePOS/S700, ensure BT/location enabled and network for internet readers.
