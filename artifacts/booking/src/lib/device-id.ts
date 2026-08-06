const DEVICE_FINGERPRINT_KEY = "certxa_device_fingerprint";

let _cached: string | null = null;

/**
 * Generates or retrieves a persistent device fingerprint stored in localStorage.
 * This fingerprint silently identifies the device across bookings even if the
 * user provides different names or phone numbers, helping salons detect
 * potentially high-risk booking patterns (abuse / no-shows).
 *
 * The fingerprint is a composite hash of:
 *   - A random unique device ID (persisted in localStorage)
 *   - Browser user agent (anonymised prefix)
 *   - Screen resolution
 *   - Timezone offset
 *
 * This makes it reasonably stable per device while avoiding PII.
 */
function generateCompositeFingerprint(): string {
  const parts: string[] = [];

  // 1. Persistent random device ID (survives cache clear = new identity)
  let deviceId: string;
  try {
    deviceId = localStorage.getItem(DEVICE_FINGERPRINT_KEY) ?? "";
  } catch {
    deviceId = "";
  }

  if (!deviceId) {
    // 20 characters of high-entropy random
    const buf = new Uint8Array(15);
    crypto.getRandomValues(buf);
    deviceId = `dev_${Array.from(buf)
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")}`;
    try {
      localStorage.setItem(DEVICE_FINGERPRINT_KEY, deviceId);
    } catch {
      // localStorage unavailable — fall back to ephemeral id
    }
  }

  parts.push(deviceId);

  // 2. UA prefix (first 60 chars, non-PII portion)
  try {
    const ua = (navigator.userAgent || "").slice(0, 60);
    if (ua) parts.push(ua);
  } catch {
    // silently skip
  }

  // 3. Screen resolution
  try {
    const res = `${screen.width}x${screen.height}x${screen.colorDepth}`;
    parts.push(res);
  } catch {
    // silently skip
  }

  // 4. Timezone offset (signed minutes)
  try {
    parts.push(String(new Date().getTimezoneOffset()));
  } catch {
    // silently skip
  }

  // Hash the composite to a stable short string
  const raw = parts.join("||");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // Encode as base36 for a readable alphanumeric fingerprint
  const fingerprint = (hash >>> 0).toString(36).padStart(7, "0");
  return `fp_${fingerprint}`;
}

export function getDeviceFingerprint(): string {
  if (_cached) return _cached;
  _cached = generateCompositeFingerprint();
  return _cached;
}

export function getDeviceId(): string {
  return getDeviceFingerprint();
}
