import { staffApi } from "@/lib/staffScreenApi";
import bcrypt from "bcryptjs";
import { nailOffline, nailOfflineStore } from "@/lib/nail-offline";

/**
 * The salon's manager PIN is checked by the server (POST /api/nail/manager-pin/check) whenever it can be reached.
 *
 * With no connection the tablet checks it against its offline database: the salon's PIN hash (or "still the
 * default"), fetched when /nail or /barber opens, when the connection comes back, and whenever the PIN is changed
 * anywhere (the server announces `manager_pin_changed` — refreshOfflineManagerPin). So a tablet knows the current
 * PIN offline even if it was changed on another device, or never typed on this one.
 * Before a tablet has fetched it: the last PIN accepted on this tablet, then the old shared default.
 */
const LEGACY_KEY = "certxa.managerPinHash";
const DEFAULT_PIN = "2026";
/** Where the offline copy is kept on the tablet (one name for both screens). */
const OFFLINE_URL = "/api/nail/manager-pin/offline";

type OfflinePin = { hash: string | null; isDefault: boolean; badges?: { techId: number; hash: string }[]; showKeypad?: string | null };

/**
 * A manager badge (owner and Managers, printed from Tech ID Print): "M<Tech ID>-<6 letters/digits>". Scanned wherever
 * the manager PIN is asked, it counts as the PIN — the server checks it the same way. At the lock screen it signs
 * them in by their Tech ID.
 */
export const MANAGER_BADGE = /^M(\d{1,2})-([A-Z2-7]{6})$/;
export const managerBadge = (code: string) => {
  const m = MANAGER_BADGE.exec(code.trim().toUpperCase());
  return m ? { code: m[0], techId: Number(m[1]), secret: m[2] } : null;
};
/** The salon this tablet last kept the PIN for — /barber does not set nailOfflineStore(). */
let keptFor: number | null = null;

async function sha256(text: string, prefix = "certxa-manager-pin:"): Promise<string> {
  const bytes = new TextEncoder().encode(`${prefix}${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Brings this tablet's offline copy of the salon's manager PIN up to date. Quiet on failure (kept as it was). */
export async function refreshOfflineManagerPin(storeId: number): Promise<void> {
  keptFor = storeId;
  try {
    const res = await fetch(staffApi("/manager-pin/offline"), { credentials: "include", cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    if (typeof d?.isDefault !== "boolean") return;
    const badges = Array.isArray(d.badges)
      ? d.badges.filter((b: any) => Number.isInteger(b?.techId) && typeof b?.hash === "string").map((b: any) => ({ techId: b.techId, hash: b.hash }))
      : [];
    const pin: OfflinePin = { hash: typeof d.hash === "string" && d.hash ? d.hash : null, isDefault: d.isDefault, badges,
      showKeypad: typeof d.showKeypad === "string" ? d.showKeypad : null };
    await nailOffline.remember(storeId, OFFLINE_URL, pin);
  } catch { /* offline, or the device store is unavailable: the copy it has stays */ }
}

/** The PIN checked on this tablet alone, with no server. */
export async function checkManagerPinOffline(pin: string, storeId: number | null = nailOfflineStore() ?? keptFor): Promise<boolean> {
  const badge = managerBadge(pin);
  if (!badge && !/^\d{4}$/.test(pin)) return false;
  const kept = storeId == null ? undefined : await nailOffline.recall<OfflinePin>(storeId, OFFLINE_URL).catch(() => undefined);
  if (badge) {
    // Only a badge this tablet was told about works offline (same hash as the server's).
    const hash = await sha256(badge.secret, "certxa-manager-badge:");
    return !!kept?.data?.badges?.some((b) => b.techId === badge.techId && b.hash === hash);
  }
  if (kept?.data) {
    if (kept.data.isDefault || !kept.data.hash) return pin === DEFAULT_PIN;
    try { return await bcrypt.compare(pin, kept.data.hash); } catch { return false; }
  }
  let remembered: string | null = null;
  try { remembered = localStorage.getItem(LEGACY_KEY); } catch { /* none */ }
  if (remembered) return (await sha256(pin)) === remembered;
  return pin === DEFAULT_PIN;
}

/** The salon's KEYPAD code (printed from Tech ID Print → Hide Keypad), checked on this tablet alone. */
export async function checkKeypadCodeOffline(code: string, storeId: number | null = nailOfflineStore() ?? keptFor): Promise<boolean> {
  if (storeId == null) return false;
  const kept = await nailOffline.recall<OfflinePin>(storeId, OFFLINE_URL).catch(() => undefined);
  const hash = kept?.data?.showKeypad;
  return typeof hash === "string" && hash === (await sha256(code.trim().toUpperCase(), "certxa-show-keypad:"));
}

export type PinCheck = "ok" | "wrong" | "locked";

export async function checkManagerPin(pin: string): Promise<PinCheck> {
  try {
    const res = await fetch(staffApi("/manager-pin/check"), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      if (!managerBadge(pin)) {
        try { localStorage.setItem(LEGACY_KEY, await sha256(pin)); } catch { /* the offline copy is a convenience only */ }
      }
      return "ok";
    }
    if (res.status === 429) return "locked";
    if (res.status === 403) return "wrong";
    throw new Error(`PIN check failed (${res.status})`);
  } catch (err) {
    if (err instanceof TypeError || (err as Error)?.message?.startsWith("PIN check failed")) {
      return (await checkManagerPinOffline(pin)) ? "ok" : "wrong";
    }
    throw err;
  }
}

/** Change the salon's manager PIN. Throws with the server's message when it is refused. */
export async function changeManagerPin(currentPin: string, newPin: string): Promise<void> {
  const res = await fetch(staffApi("/manager-pin"), {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPin, newPin }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Could not change the PIN");
  }
  try { localStorage.setItem(LEGACY_KEY, await sha256(newPin)); } catch { /* convenience only */ }
  const storeId = nailOfflineStore() ?? keptFor;
  if (storeId != null) await refreshOfflineManagerPin(storeId);
}
