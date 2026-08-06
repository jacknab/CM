// Production API URL. For dev builds, override via EXPO_PUBLIC_API_URL env var.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://certxa.com';

export const ENDPOINTS = {
  /** POST → { token: string, storeId: number } */
  mobileToken: '/api/auth/mobile-token',
  /** POST → { secret: string } */
  connectionToken: '/api/payments/terminal/connection-token',
  /** POST { amountCents, currency } → { clientSecret, paymentIntentId, amount, currency } */
  createPaymentIntent: '/api/payments/terminal/create-payment-intent',
  /** GET → { locationId: string } — Stripe Terminal location for this store */
  terminalLocation: '/api/payments/terminal/location',
};

export const APP_SETTINGS = {
  /** Initial URL loaded in the auth WebView */
  authUrl: `${API_BASE_URL}/auth`,
};
