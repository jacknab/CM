// The kiosk and customer-screen calls that read client data or change anything must come from a
// device the salon has set up (see api-server lib/kioskAccess.ts). Inside the Certxa owner app the
// signed-in session is enough. A plain browser is paired once with the salon's device code, and
// the token it gets back is kept here and sent with those calls.

const key = (slug: string) => `certxa_kiosk_device:${slug}`;

export function kioskDeviceToken(slug: string): string | null {
  try { return localStorage.getItem(key(slug)); } catch { return null; }
}

export function saveKioskDeviceToken(slug: string, token: string) {
  try { localStorage.setItem(key(slug), token); } catch { /* private mode: the pairing lasts until reload */ }
}

export function forgetKioskDeviceToken(slug: string) {
  try { localStorage.removeItem(key(slug)); } catch { /* ignore */ }
}

/** fetch() for the protected kiosk calls: adds this device's pairing token when it has one. */
export function kioskFetch(slug: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = kioskDeviceToken(slug);
  if (token) headers.set("X-Kiosk-Device", token);
  return fetch(url, { credentials: "include", ...init, headers });
}

/** Asks the server whether this browser may use the kiosk calls. Fails open on a network error. */
export async function isKioskDeviceAuthorized(slug: string): Promise<boolean> {
  try {
    const r = await kioskFetch(slug, `/api/public/kiosk/${slug}/device`, { cache: "no-store" });
    if (!r.ok) return r.status >= 500;
    const d = await r.json();
    return d?.authorized === true;
  } catch {
    return true;
  }
}
