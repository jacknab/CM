// A stable identity for this tablet, for POS stations and customer-screen pairing.
//
// getDeviceId() in lib/device-id.ts is a booking-abuse fingerprint: it mixes the stored random id
// with the browser version, screen size and timezone. That changes when a POS / Kiosk tablet turns
// between landscape and portrait (on some Android WebViews the reported screen size swaps) and
// after every app update — and each change looked like a brand-new tablet to the station system.
// This returns just the stored random id (the same value device-id.ts keeps), which only changes
// if the app's data is cleared or it is reinstalled.

const KEY = "certxa_device_fingerprint";
let cached: string | null = null;

export function getStationDeviceId(): string {
  if (cached) return cached;
  let id = "";
  try { id = localStorage.getItem(KEY) ?? ""; } catch { /* unavailable */ }
  if (!id) {
    const buf = new Uint8Array(15);
    crypto.getRandomValues(buf);
    id = `dev_${Array.from(buf).map((b) => b.toString(36).padStart(2, "0")).join("")}`;
    try { localStorage.setItem(KEY, id); } catch { /* still usable for this session */ }
  }
  cached = id;
  return id;
}
