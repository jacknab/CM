### Bridge scope (initial)
Web -> Native: START_PAYMENT, CANCEL_PAYMENT, DISCOVER_READERS, CONNECT_READER, GET_READER_STATUS
Native -> Web: PAYMENT_STARTED, PAYMENT_COMPLETE, PAYMENT_FAILED, PAYMENT_CANCELLED, READER_CONNECTED, READER_DISCONNECTED, READER_ERROR

`WebShellScreen` consumes messages via `onMessage`, validates JSON, and dispatches to `BridgeProvider`.
`BridgeProvider` holds a ref to the WebView for native->web postMessage and a `pendingPayment` snapshot.

Next steps: wire Stripe Terminal service to dispatch lifecycle events and replace mocks.
