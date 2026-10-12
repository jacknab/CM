/**
 * The salon's local hub, as a screen uses it.
 *
 * Inside the Certxa Android app (1.0.3+) the salon's tablets can reach each other over its own Wi-Fi: the
 * main POS tablet (/nail) accepts the others, and the customer screen (/frontdesk) and kiosk connect to it.
 * It carries the same messages the server carries between a POS and its customer screen. Every message
 * still goes through the server whenever the server can be reached; the hub is used when it cannot.
 *
 * Each tablet learns the salon's hub token and the main POS tablet's address from the server while online
 * and keeps both, so the link still comes up after a restart with no internet.
 */
import { syncEngine } from "./sync-engine";
import { forRegister, type HubMessage } from "./local-hub-rules";

export { forRegister, type HubMessage };

interface HubWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  CERTXA_NATIVE_HUB?: number;
  __certxaHubEvent?: (json: string) => void;
}
export interface HubSettings { token: string; address: string | null }
type Listener = (message: HubMessage) => void;

const settingsKey = (storeId: number) => `certxa.hub.${storeId}`;
const w = (): HubWindow => window as unknown as HubWindow;

export function hasLocalHub(): boolean {
  return typeof window !== "undefined" && !!w().ReactNativeWebView && !!w().CERTXA_NATIVE_HUB;
}

function readSaved(storeId: number): HubSettings | null {
  try {
    const raw = localStorage.getItem(settingsKey(storeId));
    const saved = raw ? JSON.parse(raw) : null;
    return saved && typeof saved.token === "string" ? { token: saved.token, address: saved.address ?? null } : null;
  } catch {
    return null;
  }
}

class LocalHubClient {
  private listeners = new Set<Listener>();
  private wired = false;
  private status = "off";
  private storeId: number | null = null;
  private role: "pos" | "screen" | null = null;

  private post(message: Record<string, unknown>) { w().ReactNativeWebView?.postMessage(JSON.stringify(message)); }

  private wire() {
    if (this.wired) return;
    this.wired = true;
    w().__certxaHubEvent = (json: string) => {
      let event: any;
      try { event = JSON.parse(json); } catch { return; }
      if (event.kind === "message" && event.message && typeof event.message === "object") {
        this.listeners.forEach((fn) => { try { fn(event.message as HubMessage); } catch { /* one listener must not stop the rest */ } });
      } else if (event.kind === "status") {
        this.status = String(event.status);
      } else if (event.kind === "address" && event.address) {
        void this.reportAddress(String(event.address));
      }
    };
  }

  /** The main POS tablet tells the server where it is on the salon's network, so the others can find it. */
  private async reportAddress(address: string) {
    if (this.storeId == null || this.role !== "pos") return;
    const saved = readSaved(this.storeId);
    if (saved?.address === address || syncEngine.isOffline()) return;
    try {
      const res = await fetch("/api/nail/hub", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
      if (res.ok && saved) localStorage.setItem(settingsKey(this.storeId), JSON.stringify({ ...saved, address }));
    } catch { /* tried again the next time the screen opens */ }
  }

  /**
   * Bring the hub up for this screen. `pos`: this tablet accepts the others. `screen`: this tablet connects
   * to the main POS tablet. Safe to call again; does nothing outside the Android app.
   */
  async start(storeId: number, role: "pos" | "screen"): Promise<void> {
    if (!hasLocalHub()) return;
    this.wire();
    this.storeId = storeId;
    this.role = role;
    const apply = (s: HubSettings | null) => {
      if (!s) return;
      if (role === "pos") { this.post({ type: "HUB_SERVE", token: s.token }); this.post({ type: "HUB_ADDRESS" }); }
      else if (s.address) this.post({ type: "HUB_JOIN", host: s.address, token: s.token });
    };
    // What this tablet already knows first, so the link comes up with no internet.
    apply(readSaved(storeId));
    if (syncEngine.isOffline()) return;
    try {
      const res = await fetch("/api/nail/hub", { credentials: "include" });
      if (!res.ok) return;
      const fresh = (await res.json()) as HubSettings;
      if (typeof fresh?.token !== "string") return;
      const next: HubSettings = { token: fresh.token, address: fresh.address ?? null };
      localStorage.setItem(settingsKey(storeId), JSON.stringify(next));
      apply(next);
    } catch { /* keeps what it has */ }
  }

  /** Hand a message to the hub for the salon's other tablets. False when this is not the Android app. */
  send(message: HubMessage): boolean {
    if (!hasLocalHub()) return false;
    this.post({ type: "HUB_SEND", message });
    return true;
  }

  onMessage(fn: Listener): () => void {
    this.wire();
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  getStatus(): string { return this.status; }
}

export const localHub = new LocalHubClient();

/**
 * Sends a POS ↔ customer screen message: through the server when it can be reached, otherwise through the
 * salon's local hub. Resolves true when it was handed to one of them.
 */
export async function relayCheckoutEvent(body: HubMessage): Promise<boolean> {
  if (!syncEngine.isOffline()) {
    try {
      const res = await fetch("/api/kiosk/checkout-event", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) return true;
    } catch {
      syncEngine.noteUnreachable();
    }
  }
  return localHub.send(body);
}
