/**
 * Authenticated fetch client for the Certxa API — replaces certxa-owner's
 * WebView `apiCaller` shim (lib/terminalBridge.ts) with a direct call using
 * the JWT from authSession.ts, since this app has no WebView/cookie jar.
 */

import { getToken, clearToken } from './authSession';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://certxa.com';

async function doFetch(
  endpoint: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // no/invalid JSON body
  }
  return { ok: res.ok, status: res.status, json };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** For screens: throws ApiError on any non-2xx response. A 401 also clears the stored token. */
async function apiRequest(endpoint: string, method: string, body?: unknown): Promise<any> {
  const { ok, status, json } = await doFetch(endpoint, method, body);
  if (status === 401) await clearToken();
  if (!ok) throw new ApiError(status, json?.message ?? json?.error ?? `Request failed (${status})`);
  return json;
}

export const api = {
  get: (endpoint: string) => apiRequest(endpoint, 'GET'),
  post: (endpoint: string, body?: unknown) => apiRequest(endpoint, 'POST', body),
  patch: (endpoint: string, body?: unknown) => apiRequest(endpoint, 'PATCH', body),
  del: (endpoint: string) => apiRequest(endpoint, 'DELETE'),
};

/**
 * For the Stripe Terminal payment/reader-discovery hooks ported from
 * certxa-owner: resolves with the JSON body on ANY response, even non-2xx,
 * so callers can read the server's `{ error }` message themselves — matches
 * the contract those hooks were originally written against.
 */
export async function terminalApiCall(endpoint: string, method: string, body?: unknown): Promise<any> {
  const { status, json } = await doFetch(endpoint, method, body);
  if (status === 401) await clearToken();
  if (json === null) throw new Error(`Request failed (${status})`);
  return json;
}
