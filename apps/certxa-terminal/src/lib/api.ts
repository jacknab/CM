import { API_BASE_URL, ENDPOINTS } from '../config/env';

// Module-level token — set after WebView auth, used for every native API call.
let _token: string | null = null;

export function setApiToken(token: string | null) {
  _token = token;
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = body;
    try {
      message = JSON.parse(body).error ?? body;
    } catch {}
    throw new Error(message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** Fetches a Stripe Terminal connection token secret from the server. */
export async function fetchConnectionToken(): Promise<string> {
  const data = await apiFetch<{ secret: string }>(
    ENDPOINTS.connectionToken,
    { method: 'POST' }
  );
  return data.secret;
}

/** Creates a server-side Stripe PaymentIntent for Terminal collection. */
export async function createPaymentIntent(amountCents: number): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}> {
  return apiFetch(ENDPOINTS.createPaymentIntent, {
    method: 'POST',
    body: JSON.stringify({ amountCents, currency: 'usd' }),
  });
}

/**
 * Fetches the Stripe Terminal location ID for this store.
 * The server creates the location automatically if one doesn't exist yet.
 * Must be called before connectReader() — the SDK requires a locationId.
 */
export async function fetchTerminalLocation(): Promise<string> {
  const data = await apiFetch<{ locationId: string }>(ENDPOINTS.terminalLocation);
  return data.locationId;
}
