/**
 * The salon's local hub, as a screen uses it.
 *
 * Inside the Certxa Android app (1.0.3+) the salon's tablets can reach each other over its own Wi-Fi: the
 * main POS tablet (/nail) accepts the others, and the customer screen (/frontdesk) and kiosk connect to it.
 * It carries the same messages the server carries between a POS and its customer screen. Every message
 * still goes through the server whenever the server can be reached; the hub is used when it cannot.
 *
 * Each tablet learns the salon's hub token and the main POS tablet's address from the server while online
 * and keeps both, so the link still comes up after a restart with no internet. While online it checks again
 * every minute: the POS tablet's address changes when the tablets move to another Wi-Fi or the router hands
 * out a new one, and a screen that kept the old address could not reach the POS once the internet was down.
 */
import { syncEngine } from "./sync-engine";
import { forRegister, type HubMessage } from "./local-hub-rules";

export { forRegister, type HubMessage };

interface HubWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  CERTXA_NATIVE_HUB?: number;
  __certxaHubEvent?: (json: string) => void;
}
/** How often the main POS tablet re-confirms its address to the server while online. */
const CONFIRM_EVERY_MS = 30 * 60 * 1000;

export interface HubSettings { token: string; address: string | null }
/**
 * `pos`: POS #1 — accepts the salon's other tablets. `station`: another POS station — connects to POS #1, so
 * the POS tablets share one turn line offline. `screen`: a customer screen or kiosk — connects to POS #1.
 */
export type HubRole = "pos" | "station" | "screen";
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
  private role: HubRole | null = null;
  /** This tablet's own address on the salon's Wi-Fi (main POS only), as the app last said. */
  private ownAddress: string | null = null;
  /** When the server last heard this tablet's address (ms); re-sent every CONFIRM_EVERY_MS while online. */
  private confirmedAt = 0;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private healTimer: ReturnType<typeof setInterval> | null = null;

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
        void this.reportStatus(event);
      } else if (event.kind === "address" && event.address) {
        // Reported when the page opens, whenever this tablet's address changes, and every 30 minutes as a
        // confirmation (the back office shows when it was last confirmed) — not on every minute's check.
        const address = String(event.address);
        const due = Date.now() - this.confirmedAt >= CONFIRM_EVERY_MS;
        if (address === this.ownAddress && !due) return;
        const changed = address !== this.ownAddress;
        this.ownAddress = address;
        void this.reportAddress(address, !changed);
      }
    };
  }

  /** While online, tell the server what state this tablet's hub link is in, so a link that never comes up
   *  can be diagnosed without the tablet in hand. Only when the state changes. */
  private lastReported = "";
  private async reportStatus(event: { status?: string; peers?: number; address?: string | null }) {
    const line = `${this.role}:${event.status}:${event.peers ?? 0}:${event.address ?? ""}`;
    if (line === this.lastReported || syncEngine.isOffline()) return;
    this.lastReported = line;
    try {
      await fetch("/api/nail/hub/status", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: this.role, status: event.status, peers: event.peers ?? 0, address: event.address ?? null }) });
    } catch { /* diagnostics only */ }
  }

  /** The main POS tablet tells the server where it is on the salon's network, so the others can find it. */
  private async reportAddress(address: string, confirmOnly = false) {
    if (this.storeId == null || this.role !== "pos") return;
    const saved = readSaved(this.storeId);
    if (syncEngine.isOffline()) return;
    if (saved?.address === address && !confirmOnly && Date.now() - this.confirmedAt < CONFIRM_EVERY_MS) return;
    try {
      const res = await fetch("/api/nail/hub", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
      if (res.ok) {
        this.confirmedAt = Date.now();
        if (saved) localStorage.setItem(settingsKey(this.storeId), JSON.stringify({ ...saved, address }));
      }
    } catch { /* tried again at the next check */ }
  }

  /**
   * Bring the hub up for this screen. `pos`: this tablet accepts the others. `station` / `screen`: this tablet
   * connects to the main POS tablet. Safe to call again (with a new role too); does nothing outside the Android app.
   */
  async start(storeId: number, role: HubRole): Promise<void> {
    if (!hasLocalHub()) return;
    this.wire();
    this.storeId = storeId;
    this.role = role;
    this.ownAddress = null;
    if (!this.checkTimer) this.checkTimer = setInterval(() => void this.check(), 60_000);
    if (!this.healTimer) this.healTimer = setInterval(() => this.heal(), 20_000);
    // The app keeps its hub running across page loads and stays silent when asked for what it is already
    // doing. A screen or station stops it once per page load so it connects afresh and says what state the
    // link is in. The main POS never does: restarting its hub disconnects every other tablet, and a screen
    // knocked off that way could stay stuck "connecting" (store 2, 2026-10-16: off from 8:37 PM on).
    let restarted = role === "pos";
    const apply = (s: HubSettings | null) => {
      if (!s) return;
      if (!restarted) { restarted = true; this.post({ type: "HUB_STOP" }); }
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

  /**
   * A screen or station that is not connected to the main POS starts a fresh connection, with or without
   * internet (from the address it saved). A connection attempt that never gets an answer otherwise never ends.
   */
  private heal() {
    const storeId = this.storeId;
    if (storeId == null || !this.role || this.role === "pos" || this.status === "connected") return;
    const s = readSaved(storeId);
    if (!s?.address) return;
    this.post({ type: "HUB_STOP" });
    this.post({ type: "HUB_JOIN", host: s.address, token: s.token });
  }

  /**
   * The minute-by-minute check while online. A screen or station follows the main POS tablet to its current
   * address (the app ignores a join to the address it is already on). The main POS asks the app for its own
   * address, which is reported only if it changed.
   */
  private async check() {
    const storeId = this.storeId, role = this.role;
    if (storeId == null || !role || syncEngine.isOffline()) return;
    if (role === "pos") { this.post({ type: "HUB_ADDRESS" }); return; }
    try {
      const res = await fetch("/api/nail/hub", { credentials: "include" });
      if (!res.ok) return;
      const fresh = (await res.json()) as HubSettings;
      if (typeof fresh?.token !== "string" || !fresh.address) return;
      localStorage.setItem(settingsKey(storeId), JSON.stringify({ token: fresh.token, address: fresh.address }));
      if (this.storeId === storeId && this.role === role) this.post({ type: "HUB_JOIN", host: fresh.address, token: fresh.token });
    } catch { /* tried again in a minute */ }
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
    // With the Wi-Fi up but the internet down a request can hang for a long time before failing. These
    // messages are part of a live checkout, so the server gets three seconds and then the hub takes over.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3_000);
    try {
      const res = await fetch("/api/kiosk/checkout-event", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (res.ok) return true;
    } catch {
      syncEngine.noteUnreachable();
    } finally {
      clearTimeout(timer);
    }
  }
  return localHub.send(body);
}
