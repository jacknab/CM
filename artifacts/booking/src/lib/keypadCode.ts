import { staffApi } from "@/lib/staffScreenApi";
import type { QueryClient } from "@tanstack/react-query";
import { checkKeypadCodeOffline } from "@/lib/managerPin";

/**
 * The salon's KEYPAD QR (owner, 2026-11-02), printed from Manager → Tech ID Print → Hide Keypad: scanned at the lock
 * screen it switches the keypad — hides it while it shows, shows it again while hidden. One code per salon; each new
 * slip replaces it. With no internet this tablet checks it against its offline copy and switches its own keypad.
 */
export const KEYPAD_CODE = /^KP:[A-Z2-7]{8}$/i;

export async function scanKeypadCode(code: string, queryClient: QueryClient): Promise<{ ok: true; keypadVisible: boolean } | { ok: false; error: string }> {
  // The screen's own copy of the setting: /nail keeps it under /api/nail/…, /barber under /api/barber/….
  const settingsKey = [staffApi("/screen-settings")];
  const setVisible = (keypadVisible: boolean) =>
    queryClient.setQueriesData({ queryKey: settingsKey }, (old: any) => (old ? { ...old, keypadVisible } : old));
  try {
    const res = await fetch(staffApi("/keypad/toggle"), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: d?.message || "That keypad code isn't this salon's latest one." };
    setVisible(d.keypadVisible !== false);
    return { ok: true, keypadVisible: d.keypadVisible !== false };
  } catch {
    if (!(await checkKeypadCodeOffline(code))) return { ok: false, error: "No connection. Try again." };
    const now = (queryClient.getQueriesData<any>({ queryKey: settingsKey })[0]?.[1])?.keypadVisible !== false;
    setVisible(!now);
    return { ok: true, keypadVisible: !now };
  }
}
