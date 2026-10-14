/**
 * The salon's manager PIN is checked by the server (POST /api/nail/manager-pin/check), never in the page.
 *
 * With no connection the tablet can still open the Manager menu: it compares with the last PIN the server
 * accepted on this tablet, kept only as a hash. A tablet that has never had a PIN accepted falls back to
 * the old shared PIN, which is also what the server accepts until the salon sets its own.
 */
const KEY = "certxa.managerPinHash";
const DEFAULT_PIN = "2026";

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`certxa-manager-pin:${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PinCheck = "ok" | "wrong" | "locked";

export async function checkManagerPin(pin: string): Promise<PinCheck> {
  try {
    const res = await fetch("/api/nail/manager-pin/check", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      try { localStorage.setItem(KEY, await sha256(pin)); } catch { /* the offline copy is a convenience only */ }
      return "ok";
    }
    if (res.status === 429) return "locked";
    if (res.status === 403) return "wrong";
    throw new Error(`PIN check failed (${res.status})`);
  } catch (err) {
    if (err instanceof TypeError || (err as Error)?.message?.startsWith("PIN check failed")) {
      // No server: the last PIN this tablet saw accepted, or the shared default if it has never seen one.
      let remembered: string | null = null;
      try { remembered = localStorage.getItem(KEY); } catch { /* none */ }
      if (remembered) return (await sha256(pin)) === remembered ? "ok" : "wrong";
      return pin === DEFAULT_PIN ? "ok" : "wrong";
    }
    throw err;
  }
}

/** Change the salon's manager PIN. Throws with the server's message when it is refused. */
export async function changeManagerPin(currentPin: string, newPin: string): Promise<void> {
  const res = await fetch("/api/nail/manager-pin", {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPin, newPin }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Could not change the PIN");
  }
  try { localStorage.setItem(KEY, await sha256(newPin)); } catch { /* convenience only */ }
}
