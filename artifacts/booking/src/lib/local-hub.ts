/**
 * The salon's local hub, as a screen uses it.
 *
 * Inside the Certxa Android app (1.0.3+) the salon's tablets can reach each other over its own Wi-Fi: a POS
 * tablet (/nail) accepts the others, and the customer screen (/frontdesk) and kiosk connect to it.
 * It carries the same messages the server carries between a POS and its customer screen. Every message
 * still goes through the server whenever the server can be reached; the hub is used when it cannot.
 *
 * Each tablet learns the salon's hub token and the selected host's address from the server while online and
 * keeps both, so the link still comes up after a restart with no internet. POS stations report their own LAN
 * address every minute; screens also report their address for connection diagnostics. The main station is preferred;
 * another station takes over if it stops checking in.
 */
import { staffApi } from "@/lib/staffScreenApi";
import { syncEngine } from "./sync-engine";
import { forRegister, type HubMessage } from "./local-hub-rules";

export { forRegister, type HubMessage };

interface HubWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  CERTXA_NATIVE_HUB?: number;
  __certxaHubEvent?: (json: string) => void;
}
export interface HubSettings { token: string; address: string | null; hostRegisterId?: number | null }
/** How long a checkout message waits for a reconnect to the host before it is dropped. */
const PENDING_MS = 20_000;
/** Another tablet found the internet gone (sent over the hub when a tablet goes offline). */
const NET_DOWN = "hub_net_down";
/** How long a tablet gives the server when another tablet has just found it unreachable. */
export const PEER_CHECK_MS = 3_000;

/**
 * A tablet asked over the hub: it could not reach the server, and the salon's tablets share one router. Unless this
 * tablet already knows it is offline, check (briefly) before answering — otherwise every request it makes on the
 * way waits out its full deadline while the asking tablet gives up (the host answered nothing for the first
 * minutes of an outage).
 */
export function confirmOutage(): Promise<unknown> {
  return syncEngine.isOffline() ? Promise.resolve() : syncEngine.checkNow(PEER_CHECK_MS);
}
/**
 * `pos` / `station`: POS stations that may host or connect to the hub. `screen`: a customer screen or kiosk.
 */
export type HubRole = "pos" | "station" | "screen";
type Listener = (message: HubMessage) => void;

const settingsKey = (storeId: number) => `certxa.hub.${storeId}`;
/** Where the hub settings are also kept in the tablet's offline database (nailOffline). */
/** Where the hub settings are kept on the device (the same key on /nail and /barber). */
const HUB_URL = "/api/nail/hub";

/** What the Connected popup shows (HubInfo there). */
export interface HubSnapshot {
  /** This tablet's address on the salon's Wi-Fi. */
  ownAddress: string | null;
  /** The hub's address: the tablet the others connect to (this one when it hosts). */
  hubAddress: string | null;
  isHost: boolean;
  /** "serving" (hosting), "connected", "connecting" or "off", as the app reports it. */
  status: string;
  /** Tablets connected to this one (when hosting), as the app last said. */
  peers: number;
  hostRegisterId: number | null;
  /** When the link was last up (serving or connected) — ISO; null = not since this page opened. */
  lastLinkedAt: string | null;
  /** When the app last had to search the Wi-Fi for the hub and found it at a new address. */
  foundAt: string | null;
  role: string | null;
}
const w = (): HubWindow => window as unknown as HubWindow;

export function hasLocalHub(): boolean {
  return typeof window !== "undefined" && !!w().ReactNativeWebView && !!w().CERTXA_NATIVE_HUB;
}

function readSaved(storeId: number): HubSettings | null {
  try {
    const raw = localStorage.getItem(settingsKey(storeId));
    const saved = raw ? JSON.parse(raw) : null;
    return saved && typeof saved.token === "string"
      ? { token: saved.token, address: saved.address ?? null, hostRegisterId: saved.hostRegisterId ?? null }
      : null;
  } catch {
    return null;
  }
}

class LocalHubClient {
  private listeners = new Set<Listener>();
  private hostListeners = new Set<(isHost: boolean) => void>();
  private statusListeners = new Set<(status: string) => void>();
  private wired = false;
  private status = "off";
  private storeId: number | null = null;
  private role: HubRole | null = null;
  private registerId = 0;
  /** This tablet's station is known (or the salon has none). Until then it reports no address: a heartbeat with
   *  no station is refused once a salon has stations (on every page load, before the station had loaded). */
  private registerKnown = true;
  private hostRegisterId: number | null = null;
  private selectedHost = false;
  private heartbeatRevision = 0;
  /** This tablet's own address on the salon's Wi-Fi, as the app last said. */
  private ownAddress: string | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private addressWaiters: ((address: string | null) => void)[] = [];
  private peers = 0;
  private lastLinkedAt: string | null = null;
  private foundAt: string | null = null;
  /** An Update (refresh()) is running: it reports the address to the server itself and waits for the answer. */
  private refreshing = false;
  private healTimer: ReturnType<typeof setInterval> | null = null;

  private post(message: Record<string, unknown>) { w().ReactNativeWebView?.postMessage(JSON.stringify(message)); }

  private setSelectedHost(isHost: boolean) {
    if (this.selectedHost === isHost) return;
    this.selectedHost = isHost;
    this.hostListeners.forEach((fn) => { try { fn(isHost); } catch { /* a listener must not interrupt hub events */ } });
  }

  private wire() {
    if (this.wired) return;
    this.wired = true;
    // The salon's tablets share one router, so when one finds the internet gone the others are told and check at once
    // instead of each waiting for its own next check — offline mode used to come together only once the last tablet
    // had noticed by itself (the owner saw "about 2 minutes" before the tablets worked with each other).
    let wasOffline = syncEngine.isOffline();
    syncEngine.onStatusChange(() => {
      const offline = syncEngine.isOffline();
      if (offline && !wasOffline) this.send({ type: NET_DOWN });
      wasOffline = offline;
    });
    w().__certxaHubEvent = (json: string) => {
      let event: any;
      try { event = JSON.parse(json); } catch { return; }
      if (event.kind === "message" && event.message?.type === NET_DOWN) {
        if (!syncEngine.isOffline()) void syncEngine.checkNow(PEER_CHECK_MS);
        return;
      }
      if (event.kind === "message" && event.message && typeof event.message === "object") {
        this.listeners.forEach((fn) => { try { fn(event.message as HubMessage); } catch { /* one listener must not stop the rest */ } });
      } else if (event.kind === "status") {
        const was = this.status;
        this.status = String(event.status);
        this.peers = Number(event.peers) || 0;
        if (this.status === "serving" || this.status === "connected") this.lastLinkedAt = new Date().toISOString();
        if (this.status === "connected") this.flushPending();
        if (this.status !== was) this.statusListeners.forEach((fn) => { try { fn(this.status); } catch { /* a listener must not interrupt hub events */ } });
        void this.reportStatus(event);
      } else if (event.kind === "found" && event.address && this.storeId != null) {
        this.foundAt = new Date().toISOString();
        // The app searched the Wi-Fi and found the hub at a new address (its tablet got another one from the
        // router, with no internet to tell the others): kept on this tablet so it connects there from now on.
        const saved = readSaved(this.storeId);
        if (saved && saved.address !== String(event.address)) {
          const next = { ...saved, address: String(event.address) };
          this.save(this.storeId, next);
          if (!this.selectedHost) this.applySettings(next);
        }
      } else if (event.kind === "address" && event.address) {
        const address = String(event.address);
        this.ownAddress = address;
        this.addressWaiters.splice(0).forEach((fn) => fn(address));
        if (!this.refreshing) void this.reportAddress(address);
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
      await fetch(staffApi("/hub/status"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: this.role, status: event.status, peers: event.peers ?? 0, address: event.address ?? null }) });
    } catch { /* diagnostics only */ }
  }

  /** Every POS station reports its LAN address; the server elects and advertises the active hub host.
   *  True when the server answered and its settings were saved here. */
  private async reportAddress(address: string, force = false): Promise<boolean> {
    if (this.storeId == null || (this.role !== "pos" && this.role !== "station")) return false;
    if (syncEngine.isOffline() || !this.registerKnown) return false;
    const storeId = this.storeId;
    const registerId = this.registerId;
    const role = this.role;
    try {
      const res = await fetch(staffApi("/hub/heartbeat"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registerId, address, ...(force ? { force: true } : {}) }),
      });
      if (!res.ok) {
        console.error(`[local-hub] Station heartbeat failed: HTTP ${res.status}`);
        return false;
      }
      const fresh = await res.json() as HubSettings;
      if (typeof fresh.token !== "string" || this.storeId !== storeId || this.registerId !== registerId || this.role !== role) return false;
      this.save(storeId, fresh);
      this.heartbeatRevision++;
      this.applySettings(fresh);
      return true;
    } catch (err) {
      console.error("[local-hub] Could not report station heartbeat", err);
      return false;
    }
  }

  /** Kept on this tablet twice: in its own storage (read at once on load) and in its offline database. */
  private save(storeId: number, settings: HubSettings, force = false) {
    const json = JSON.stringify(settings);
    let same = false;
    try { same = localStorage.getItem(settingsKey(storeId)) === json; localStorage.setItem(settingsKey(storeId), json); } catch { /* the offline database still has it */ }
    // Written to the database only when something changed (screens re-check every minute), or on Update.
    if (same && !force) return;
    // Loaded when needed: the offline database's engine itself uses this hub.
    void import("./nail-offline").then(({ nailOffline }) => nailOffline.remember(storeId, HUB_URL, settings)).catch(() => {});
  }

  /** The saved settings, from the tablet's own storage or else its offline database (storage cleared). */
  private async savedSettings(storeId: number): Promise<HubSettings | null> {
    const saved = readSaved(storeId);
    if (saved) return saved;
    try {
      const { nailOffline } = await import("./nail-offline");
      const kept = await nailOffline.recall<HubSettings>(storeId, HUB_URL);
      if (!kept?.data || typeof kept.data.token !== "string") return null;
      const settings = { token: kept.data.token, address: kept.data.address ?? null, hostRegisterId: kept.data.hostRegisterId ?? null };
      try { localStorage.setItem(settingsKey(storeId), JSON.stringify(settings)); } catch { /* ignore */ }
      return settings;
    } catch {
      return null;
    }
  }

  /** This tablet's address, asked of the app afresh (null when it gives none within 5 s). */
  private askAddress(): Promise<string | null> {
    return new Promise((resolve) => {
      const done = (address: string | null) => { clearTimeout(timer); resolve(address); };
      const timer = setTimeout(() => { this.addressWaiters = this.addressWaiters.filter((fn) => fn !== done); resolve(null); }, 5_000);
      this.addressWaiters.push(done);
      this.post({ type: "HUB_ADDRESS" });
    });
  }

  /** This tablet's address, asked of the app when not known yet (the Connected popup). */
  async lookupAddress(): Promise<string | null> {
    if (!hasLocalHub()) return null;
    return this.ownAddress ?? this.askAddress();
  }

  snapshot(): HubSnapshot {
    const saved = this.storeId == null ? null : readSaved(this.storeId);
    return {
      ownAddress: this.ownAddress,
      hubAddress: this.selectedHost ? this.ownAddress : saved?.address ?? null,
      isHost: this.selectedHost,
      status: this.status,
      peers: this.peers,
      hostRegisterId: this.hostRegisterId,
      lastLinkedAt: this.lastLinkedAt,
      foundAt: this.foundAt,
      role: this.role,
    };
  }

  /**
   * Update (the Connected popup): this tablet's address is asked of the app again; a POS station reports it to the
   * server (which elects the hub) and a screen asks the server where the hub is; the answer is saved on the server's
   * side, in this tablet's storage and its offline database; then the hub link is brought up again (a tablet that
   * connects to the hub starts a fresh connection; the hub itself is never stopped — that would drop the others).
   * With no internet the saved settings are used. Resolves once the link is up, or after 10 s.
   */
  async refresh(): Promise<HubSnapshot & { savedOnServer: boolean }> {
    const storeId = this.storeId, role = this.role;
    if (storeId == null || !role || !hasLocalHub()) throw new Error("The salon hub works only in the Certxa app.");
    this.refreshing = true;
    let savedOnServer = false;
    try {
      const address = await this.askAddress();
      if (role === "pos" || role === "station") {
        if (address) savedOnServer = await this.reportAddress(address, true);
      } else if (!syncEngine.isOffline()) {
        try {
          const res = await fetch(staffApi("/hub"), { credentials: "include", cache: "no-store" });
          const fresh = res.ok ? (await res.json()) as HubSettings : null;
          if (fresh && typeof fresh.token === "string") {
            this.save(storeId, { token: fresh.token, address: fresh.address ?? null, hostRegisterId: fresh.hostRegisterId ?? null });
            savedOnServer = true;
          }
        } catch { /* the saved settings below */ }
      }
    } finally {
      this.refreshing = false;
    }
    const settings = await this.savedSettings(storeId);
    if (settings) {
      this.save(storeId, settings, true);
      this.hostRegisterId = settings.hostRegisterId ?? null;
      this.setSelectedHost(this.hostsFor(this.hostRegisterId));
      if (!this.selectedHost) this.post({ type: "HUB_STOP" });
      this.applySettings(settings);
    }
    await new Promise<void>((resolve) => {
      if (this.status === "serving" || this.status === "connected") { resolve(); return; }
      const off = this.onStatusChange((st) => { if (st === "serving" || st === "connected") { off(); clearTimeout(timer); resolve(); } });
      const timer = setTimeout(() => { off(); resolve(); }, 10_000);
    });
    return { ...this.snapshot(), savedOnServer };
  }

  /** Whether this tablet hosts the hub under the given election (none known yet: the main POS does). */
  private hostsFor(hostRegisterId: number | null | undefined): boolean {
    if (this.role === "screen" || !this.role) return false;
    return hostRegisterId == null ? this.role === "pos" : this.registerId === Number(hostRegisterId);
  }

  private applySettings(settings: HubSettings) {
    if (!this.role) return;
    this.hostRegisterId = settings.hostRegisterId == null ? null : Number(settings.hostRegisterId);
    const isHost = this.hostsFor(this.hostRegisterId);
    this.setSelectedHost(isHost);
    if (isHost) this.post({ type: "HUB_SERVE", token: settings.token });
    else if (settings.address) this.post({ type: "HUB_JOIN", host: settings.address, token: settings.token });
    else this.post({ type: "HUB_STOP" });
  }

  /**
   * Bring the hub up for this screen. POS stations serve or connect to the elected host; screens always connect.
   * Safe to call again (with a new role too); does nothing outside the Android app.
   */
  async start(storeId: number, role: HubRole, registerId = 0, registerKnown = true): Promise<void> {
    this.storeId = storeId;
    this.role = role;
    this.registerId = registerId;
    this.registerKnown = registerKnown;
    // What this tablet already knows first, so the link comes up with no internet.
    const saved = readSaved(storeId) ?? (hasLocalHub() ? await this.savedSettings(storeId) : null);
    this.hostRegisterId = saved?.hostRegisterId ?? null;
    this.setSelectedHost(this.hostsFor(this.hostRegisterId));
    if (!hasLocalHub()) return;
    this.wire();
    this.ownAddress = null;
    if (!this.checkTimer) this.checkTimer = setInterval(() => void this.check(), 60_000);
    if (!this.healTimer) this.healTimer = setInterval(() => this.heal(), 20_000);
    // A tablet that connects to the host starts a fresh connection on each page load, so the app says what state
    // the link is in. The host never stops its hub here: that would drop every other tablet.
    if (!this.selectedHost) this.post({ type: "HUB_STOP" });
    if (saved) this.applySettings(saved);
    this.post({ type: "HUB_ADDRESS" });
    if (syncEngine.isOffline()) return;
    const roleAtRequest = this.role;
    const registerIdAtRequest = this.registerId;
    const heartbeatRevisionAtRequest = this.heartbeatRevision;
    try {
      const res = await fetch(staffApi("/hub"), { credentials: "include" });
      if (!res.ok) return;
      const fresh = (await res.json()) as HubSettings;
      if (typeof fresh?.token !== "string" || this.storeId !== storeId || this.role !== roleAtRequest
        || this.registerId !== registerIdAtRequest || this.heartbeatRevision !== heartbeatRevisionAtRequest) return;
      const next: HubSettings = {
        token: fresh.token,
        address: fresh.address ?? null,
        hostRegisterId: fresh.hostRegisterId ?? null,
      };
      this.save(storeId, next);
      this.applySettings(next);
    } catch { /* keeps what it has */ }
  }

  /**
   * Every 20 seconds, with or without internet: the host makes sure its hub is running (the app ignores a request
   * to serve while it already serves), and a tablet that is not connected to the host starts a fresh connection —
   * a connection attempt that never gets an answer otherwise never ends.
   * The host must never be stopped here: that drops every other tablet (store 2, 2026-11-01: the POS restarted its
   * hub every 20 s, the customer screen was off the link a fifth of the time and missed the cash sale's result).
   */
  private heal() {
    const storeId = this.storeId;
    if (storeId == null || !this.role) return;
    const s = readSaved(storeId);
    if (!s) return;
    if (this.selectedHost) {
      if (this.status !== "serving") this.post({ type: "HUB_SERVE", token: s.token });
      return;
    }
    if (this.status === "connected" || !s.address) return;
    this.post({ type: "HUB_STOP" });
    this.applySettings(s);
  }

  /**
   * The minute-by-minute check while online. POS stations refresh their host lease; screens follow the elected host.
   */
  private async check() {
    const storeId = this.storeId, role = this.role;
    if (storeId == null || !role || syncEngine.isOffline()) return;
    if (role === "pos" || role === "station") { this.post({ type: "HUB_ADDRESS" }); return; }
    this.post({ type: "HUB_ADDRESS" });
    try {
      const res = await fetch(staffApi("/hub"), { credentials: "include" });
      if (!res.ok) return;
      const fresh = (await res.json()) as HubSettings;
      if (typeof fresh?.token !== "string" || !fresh.address) return;
      const settings = { token: fresh.token, address: fresh.address, hostRegisterId: fresh.hostRegisterId ?? null };
      this.save(storeId, settings);
      if (this.storeId === storeId && this.role === role) this.applySettings(settings);
    } catch { /* tried again in a minute */ }
  }

  /**
   * Hand a message to the hub for the salon's other tablets. False when this is not the Android app.
   * A checkout message sent while this tablet is reconnecting to the host is held and sent once it is back
   * (within PENDING_MS) — a tip, a card result or a receipt choice must not vanish in a reconnect.
   */
  send(message: HubMessage): boolean {
    if (!hasLocalHub()) return false;
    if (!this.selectedHost && this.status !== "connected" && typeof message.type === "string" && message.type.startsWith("kiosk_checkout_")) {
      const now = Date.now();
      this.pending = [...this.pending.filter((p) => now - p.at < PENDING_MS), { message, at: now }].slice(-30);
      return true;
    }
    this.post({ type: "HUB_SEND", message });
    return true;
  }

  private pending: { message: HubMessage; at: number }[] = [];
  private flushPending() {
    const now = Date.now();
    const due = this.pending.filter((p) => now - p.at < PENDING_MS);
    this.pending = [];
    due.forEach((p) => this.post({ type: "HUB_SEND", message: p.message }));
  }

  /** The link's state as the app reports it ("serving", "connecting", "connected", "off"). */
  onStatusChange(fn: (status: string) => void): () => void {
    this.statusListeners.add(fn);
    return () => { this.statusListeners.delete(fn); };
  }

  onMessage(fn: Listener): () => void {
    this.wire();
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  onHostChange(fn: (isHost: boolean) => void): () => void {
    this.hostListeners.add(fn);
    return () => { this.hostListeners.delete(fn); };
  }

  isSelectedHost(): boolean { return this.selectedHost; }
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
