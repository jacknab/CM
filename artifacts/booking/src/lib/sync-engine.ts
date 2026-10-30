import { offlineDB, type PendingOp, type ServerEntry } from "./offline-db";
import { offlineLimitReached } from "./offline-limit";
import { actionQueueDB, type ActionType, type SyncAction } from "./action-queue-db";
import { appointmentsCacheDB } from "./appointments-cache-db";
import { getDeviceId } from "./device-id";
import { clientPhoneCacheDB } from "./client-phone-cache-db";
import { nailOffline, browserTransport, nailOfflineStore } from "./nail-offline";
import { reportUnauthorized } from "./resumeSignIn";

export type SyncStatus = "online" | "offline" | "syncing";

export type SyncConflictKind =
  | "booking_updated"
  | "walkin_merged"
  | "staff_changed"
  | "batch_resumed"
  | "action_rejected"
  | "generic"
  // The offline Turn pick (TURN_ASSIGN with source:"offline_turn") no longer
  // matches server-side eligibility by the time it synced — someone else got
  // there first. The appointment itself is unaffected (staffId already
  // committed via CREATE_BOOKING); only Turn's lock/audit bookkeeping may be off.
  | "turn_changed";

type SyncListener = (status: SyncStatus) => void;
type QueueListener = () => void;
type OnlineHandler = (storeId?: number) => Promise<void> | void;
type ConflictListener = (kind: SyncConflictKind, detail?: string) => void;

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000;

// Status codes that are permanent failures — retrying won't help
const NON_RETRYABLE_STATUSES = new Set([400, 403, 409, 422]);

class SyncConflictError extends Error {
  constructor(
    public readonly conflictKind: SyncConflictKind,
    public readonly conflictDetail: string
  ) {
    super(conflictDetail);
    this.name = "SyncConflictError";
  }
}

function inferConflictKind(type: ActionType): SyncConflictKind {
  if (type === "ASSIGN_STAFF") return "staff_changed";
  if (type === "WALKIN" || type === "CREATE_BOOKING") return "walkin_merged";
  if (
    type === "UPDATE_BOOKING" ||
    type === "CHECKIN" ||
    type === "CHECKOUT" ||
    type === "CANCEL_BOOKING"
  )
    return "booking_updated";
  return "action_rejected";
}

async function extractConflictDetail(res: Response, type: ActionType): Promise<string> {
  try {
    const body = await res.clone().json().catch(() => null);
    if (body?.message) return String(body.message);
    if (body?.error) return String(body.error);
    if (body?.detail) return String(body.detail);
  } catch {}
  return `${type} rejected by server (${res.status})`;
}

async function throwIfConflict(res: Response, type: ActionType): Promise<void> {
  if (NON_RETRYABLE_STATUSES.has(res.status)) {
    const detail = await extractConflictDetail(res, type);
    throw new SyncConflictError(inferConflictKind(type), detail);
  }
  // 404 on mutations means the entity was deleted remotely — that's a conflict
  if (
    res.status === 404 &&
    (type === "UPDATE_BOOKING" ||
      type === "CHECKIN" ||
      type === "CHECKOUT" ||
      type === "CANCEL_BOOKING" ||
      type === "UPDATE_CLIENT")
  ) {
    throw new SyncConflictError("booking_updated", `${type}: record no longer exists on server`);
  }
}

const LAST_CONTACT_KEY = "certxa.sync.lastContactAt";

class SyncEngine {
  private status: SyncStatus = navigator.onLine ? "online" : "offline";
  // Whether the Certxa server actually answers. `navigator.onLine` only says the tablet has a network
  // interface up: on salon Wi-Fi with the internet down it stays true, which is why nothing used to be
  // treated as offline (and nothing was queued) during a real outage.
  private reachable = true;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private nailTimer: ReturnType<typeof setInterval> | null = null;
  private syncListeners: Set<SyncListener> = new Set();
  private queueListeners: Set<QueueListener> = new Set();
  private conflictListeners: Set<ConflictListener> = new Set();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;
  private onlineHandlers: Set<OnlineHandler> = new Set();
  private lastKnownStoreId: number | undefined;

  constructor() {
    window.addEventListener("online", () => { this.reachable = true; this.handleOnline(); });
    window.addEventListener("offline", () => this.handleOffline());
    // Work saved on /nail while offline is counted and re-sent like the rest of the queue.
    nailOffline.onChange(() => { this.notifyQueueChange(); this.reportSoon(); });
    setInterval(() => void this.reportDeviceStatus(), 60_000);
    this.nailTimer = setInterval(() => {
      if (this.isOffline() || this.isSyncing) return;
      void nailOffline.counts().then((c) => { if (c.pending > 0) void this.runSync(); }).catch(() => {});
    }, 30_000);
  }

  /**
   * Tell the server what this device still holds: changes to send, and cash taken offline that the server has
   * not received. Day Close on any tablet reads it, so the day is not closed over another tablet's unsent cash.
   * Only for a device that has used the /nail offline store (it has a salon), and only when reachable.
   */
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private reportSoon() {
    if (this.reportTimer) clearTimeout(this.reportTimer);
    this.reportTimer = setTimeout(() => void this.reportDeviceStatus(), 1_500);
  }
  async reportDeviceStatus(): Promise<void> {
    const storeId = nailOfflineStore();
    if (storeId == null || this.isOffline()) return;
    try {
      const c = await nailOffline.counts(storeId);
      await fetch("/api/device-sync-status", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), pending: c.pending, attention: c.attention, cashCount: c.cash.count, cashAmount: c.cash.amount,
          // For support's POS tab (back office): the screen this tablet is on, its station, and the Certxa app build.
          ...deviceDetails() }),
      });
    } catch { /* told next time */ }
  }

  /** The server answered "not signed in" while work was waiting. Nothing is sent, and nothing is dropped, until `noteSignedIn`. */
  private signInNeeded = false;
  needsSignIn(): boolean { return this.signInNeeded; }
  /** A request just succeeded with this device's sign-in: sending can resume. */
  noteSignedIn() {
    if (!this.signInNeeded) return;
    this.signInNeeded = false;
    this.notifyQueueChange();
    this.scheduleSyncWithDelay(500);
  }

  // ── How long this device may work with no server ────────────────────────────────────────────────────────
  // The moment the server last answered is kept on the device. Past OFFLINE_LIMIT_MS without an answer the
  // screens lock until it is back; nothing saved on the device is touched.
  private lastContactAt: number = (() => {
    try {
      const saved = Number(localStorage.getItem(LAST_CONTACT_KEY));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch { /* storage unavailable */ }
    return Date.now();
  })();
  private lastContactSavedAt = 0;

  /** The server answered just now. */
  noteContact() {
    const now = Date.now();
    this.lastContactAt = now;
    if (now - this.lastContactSavedAt < 60_000) return;
    this.lastContactSavedAt = now;
    try { localStorage.setItem(LAST_CONTACT_KEY, String(now)); } catch { /* storage unavailable */ }
  }

  /** True when the server has been out of reach for longer than a device is allowed to work alone. */
  offlineTooLong(now: number = Date.now()): boolean {
    return this.isOffline() && offlineLimitReached(this.lastContactAt, now);
  }

  /** Ask the server once, now, whether it can be reached. */
  async checkNow(): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const res = await fetch(`/api/sync/heartbeat?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) { if (res.status >= 502 && res.status <= 504) this.noteUnreachable(); return false; }
      this.noteContact();
      if (!this.reachable) { this.reachable = true; this.handleOnline(); this.scheduleSyncWithDelay(800); }
      return true;
    } catch {
      this.noteUnreachable();
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * While the server answers, ask it every 15 s whether it still does. With the salon's Wi-Fi up and the
   * internet down nothing else notices until someone taps and waits; this way the screen is already working
   * from the device by then. One small request per tablet; started by the salon screens.
   */
  private watching = false;
  watchReachability() {
    if (this.watching) return;
    this.watching = true;
    setInterval(() => {
      if (!this.reachable || document.visibilityState === "hidden") return;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5_000);
      fetch(`/api/sync/heartbeat?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal })
        // nginx answering 502–504 = the app is down behind it (a restart, or the VPS still booting).
        .then((res) => { if (res.ok) this.noteContact(); else if (res.status >= 502 && res.status <= 504) this.noteUnreachable(); })
        .catch(() => this.noteUnreachable())
        .finally(() => clearTimeout(timer));
    }, 15_000);
  }

  /** True when the server cannot be reached — no network, or a network with no way out. */
  isOffline(): boolean {
    return !navigator.onLine || !this.reachable;
  }

  /** A request got no answer at all: treat the server as unreachable and keep checking until it is back. */
  noteUnreachable() {
    if (!this.reachable && this.probeTimer) return;
    this.reachable = false;
    this.setStatus("offline");
    this.scheduleProbe(5_000);
  }

  private scheduleProbe(ms: number) {
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = setTimeout(() => void this.probe(), ms);
  }

  private async probe() {
    this.probeTimer = null;
    if (this.reachable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6_000);
    try {
      const res = await fetch(`/api/sync/heartbeat?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
      if (res.ok) {
        this.reachable = true;
        this.noteContact();
        this.handleOnline();
        // Handlers registered by the app run their own sync; make sure one runs either way.
        this.scheduleSyncWithDelay(800);
        return;
      }
    } catch { /* still out */ } finally {
      clearTimeout(timer);
    }
    this.scheduleProbe(10_000);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  onStatusChange(fn: SyncListener): () => void {
    this.syncListeners.add(fn);
    return () => this.syncListeners.delete(fn);
  }

  onQueueChange(fn: QueueListener): () => void {
    this.queueListeners.add(fn);
    return () => this.queueListeners.delete(fn);
  }

  onConflict(fn: ConflictListener): () => void {
    this.conflictListeners.add(fn);
    return () => this.conflictListeners.delete(fn);
  }

  registerOnlineHandler(fn: OnlineHandler): () => void {
    this.onlineHandlers.add(fn);
    return () => this.onlineHandlers.delete(fn);
  }

  setStoreId(storeId: number) {
    this.lastKnownStoreId = storeId;
  }

  async getPendingCount(): Promise<number> {
    const [ops, actions, nail] = await Promise.all([
      offlineDB.getAllPendingOps().catch(() => [] as PendingOp[]),
      actionQueueDB.getPending().catch(() => [] as SyncAction[]),
      nailOffline.counts().catch(() => ({ pending: 0, attention: 0 })),
    ]);
    return ops.length + actions.length + nail.pending + nail.attention;
  }

  /** Remove all queued actions for an entity that ended up in CONFLICT state and notify listeners. */
  async discardConflict(entityTempId: string): Promise<void> {
    await actionQueueDB.discardByTempId(entityTempId);
    this.notifyQueueChange();
  }

  /** Remove all CONFLICT-state actions tied to a real (server-assigned) appointment ID and notify. */
  async discardConflictForRealId(realId: number): Promise<void> {
    await actionQueueDB.discardConflictsByRealId(realId);
    this.notifyQueueChange();
  }

  private setStatus(s: SyncStatus) {
    if (this.status === s) return;
    this.status = s;
    this.syncListeners.forEach((fn) => fn(s));
  }

  private notifyQueueChange() {
    this.queueListeners.forEach((fn) => fn());
  }

  private emitConflict(kind: SyncConflictKind, detail?: string) {
    this.conflictListeners.forEach((fn) => fn(kind, detail));
  }

  private handleOnline() {
    this.setStatus("syncing");
    if (this.onlineHandlers.size > 0) {
      this.onlineHandlers.forEach((fn) => {
        try {
          fn(this.lastKnownStoreId);
        } catch {}
      });
    } else {
      this.scheduleSyncWithDelay(500);
    }
  }

  private handleOffline() {
    this.setStatus("offline");
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private scheduleSyncWithDelay(ms: number) {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.runSync(), ms);
  }

  async runSync(storeId?: number): Promise<void> {
    if (this.isSyncing || this.isOffline() || this.signInNeeded) return;
    this.isSyncing = true;
    this.setStatus("syncing");

    const effectiveStoreId = storeId ?? this.lastKnownStoreId;

    try {
      // ── Phase 1: waitlist pendingOps ────────────────────────────────────
      const ops = await offlineDB.getAllPendingOps();

      for (const op of ops) {
        // An operation that keeps failing is skipped for this pass, never deleted: it stays on the device
        // until it goes through or a person removes it.
        if (op.attempts >= MAX_ATTEMPTS) continue;

        try {
          await this.executeOp(op);
          await offlineDB.deletePendingOp(op.id);
          this.notifyQueueChange();
        } catch (opErr) {
          // No answer from the server is not a failed attempt: stop here and wait for the connection.
          if (opErr instanceof TypeError) { this.noteUnreachable(); break; }
          await offlineDB.incrementOpAttempts(op.id);
          const delay =
            BACKOFF_BASE_MS * Math.pow(2, op.attempts) + Math.random() * 500;
          this.scheduleSyncWithDelay(delay);
          break;
        }
      }

      // ── Phase 2: action queue (bookings, clients, loyalty, timeclock) ───
      await this.processActionQueue((a) => a.type !== "RECEIPT_TEXT" && a.type !== "NAIL_BOOKING");

      // ── Phase 3: clients, walk-ins and tickets made on /nail while offline (lib/nail-offline) ───
      // Only the signed-in salon's changes are sent; with no salon known, nothing is.
      const nailStore = nailOfflineStore();
      const nail = nailStore != null ? await nailOffline.sync(browserTransport, nailStore)
        : { synced: 0, stopped: null, pending: 0, attention: 0 } as Awaited<ReturnType<typeof nailOffline.sync>>;
      if (nail.stopped === "unreachable") this.noteUnreachable();
      // Signed out while work was queued: nothing is discarded. Ask for the sign-in ONCE, then stop trying
      // until someone has signed in — an unauthorised request is not retried over and over.
      if (nail.stopped === "sign-in") {
        if (!this.signInNeeded) { this.signInNeeded = true; this.notifyQueueChange(); reportUnauthorized("/api/nail/tickets"); }
      }
      if (nail.stopped === "server") this.scheduleSyncWithDelay(20_000);
      if (nail.synced > 0) { this.notifyQueueChange(); void nailOffline.prune().catch(() => {}); }
      // ── Phase 4: bookings made and receipts texted offline — after the clients, tickets and cash sales they
      // belong to have gone through.
      if (nail.stopped == null) await this.processActionQueue((a) => a.type === "NAIL_BOOKING" || a.type === "RECEIPT_TEXT");
      // Back in touch: say what is (or is no longer) waiting on this device.
      void this.reportDeviceStatus();

      if (effectiveStoreId) {
        await this.fetchAndMergeServerState(effectiveStoreId);
      }

      const [remainingOps, remainingActions] = await Promise.all([
        offlineDB.getAllPendingOps(),
        actionQueueDB.getPending(),
      ]);
      if (this.isOffline()) this.setStatus("offline");
      else this.setStatus(
        remainingOps.length + remainingActions.length + nail.pending > 0 ? "syncing" : "online"
      );
    } catch {
      this.setStatus(this.isOffline() ? "offline" : "online");
    } finally {
      this.isSyncing = false;
    }
  }

  // ── Action queue processing ──────────────────────────────────────────────

  private async processActionQueue(which: (action: SyncAction) => boolean = () => true): Promise<void> {
    const pending = (await actionQueueDB.getPending().catch(() => [] as SyncAction[])).filter(which);
    const tempIdMappings: Record<string, number> = {};

    const applyClientMappings = async (action: SyncAction): Promise<SyncAction> => {
      const payload = { ...action.payload } as any;
      const storeId = Number(payload.storeId);
      let changed = false;
      const mapField = async (field: "customerId" | "clientId") => {
        const value = payload[field];
        if (typeof value !== "string" || !value.startsWith("local_client_")) return;
        let realId = tempIdMappings[value];
        if (!realId && Number.isFinite(storeId)) {
          const cached = await clientPhoneCacheDB.getById(storeId, value).catch(() => null);
          realId = cached?._syncedRealId ?? 0;
        }
        if (!realId) throw new Error(`Waiting for offline client ${value} to sync before ${action.type}`);
        payload[field] = realId;
        changed = true;
      };
      await mapField("customerId");
      await mapField("clientId");

      // TURN_ASSIGN/TURN_LOG_OVERRIDE queued for an offline-created walk-in carry
      // the CREATE_BOOKING temp id in payload.appointmentId — resolve it to the
      // real id once that CREATE_BOOKING has confirmed earlier in this same pass
      // (tempIdMappings only lives for the duration of one processActionQueue()
      // call — cleanupSyncedLocalBookings() below deletes the local record's
      // linkage at the end of every pass, so a later pass can't recover this).
      if (action.type === "TURN_ASSIGN" || action.type === "TURN_LOG_OVERRIDE") {
        const value = payload.appointmentId;
        if (typeof value === "string" && value.startsWith("local_booking_")) {
          const realId = tempIdMappings[value];
          if (!realId) throw new Error(`Waiting for offline booking ${value} to sync before ${action.type}`);
          payload.appointmentId = realId;
          changed = true;
        }
      }

      if (changed) {
        await actionQueueDB.setState(action.id, action.state, { payload });
        return { ...action, payload };
      }
      return action;
    };

    for (const queuedAction of pending) {
      let action = queuedAction;
      if (action.attempts >= MAX_ATTEMPTS) {
        await actionQueueDB.setState(action.id, "CONFLICT", {
          conflict: "Max retry attempts reached — manual review required",
        });
        this.emitConflict(
          inferConflictKind(action.type),
          `${action.type} failed after ${MAX_ATTEMPTS} attempts`
        );
        continue;
      }

      try {
        action = await applyClientMappings(action);
        await actionQueueDB.setState(action.id, "SYNCING");
        const realId = await this.executeAction(action);

        await actionQueueDB.setState(action.id, "CONFIRMED", {
          entity_real_id: realId ?? undefined,
          synced_at: new Date().toISOString(),
        });

        if (action.type === "CREATE_CLIENT" && action.entity_temp_id && realId) {
          tempIdMappings[action.entity_temp_id] = realId;
          const storeId = Number((action.payload as any).storeId);
          if (Number.isFinite(storeId)) {
            await clientPhoneCacheDB.markSynced(storeId, action.entity_temp_id, realId).catch(() => {});
          }
        }

        // Mark local booking as synced so calendar stops showing temp entry,
        // and make the real id available to any TURN_ASSIGN/TURN_LOG_OVERRIDE
        // queued for this same booking later in this pass (see applyClientMappings).
        if (action.type === "CREATE_BOOKING" && action.entity_temp_id && realId) {
          tempIdMappings[action.entity_temp_id] = realId;
          await appointmentsCacheDB
            .markLocalBookingSynced(action.entity_temp_id, realId)
            .catch(() => {});
        }

        this.notifyQueueChange();
      } catch (err) {
        if (err instanceof SyncConflictError) {
          // Permanent failure — don't retry, surface to UI immediately
          await actionQueueDB.setState(action.id, "CONFLICT", {
            conflict: err.conflictDetail,
          });
          this.emitConflict(err.conflictKind, err.conflictDetail);
          this.notifyQueueChange();
        } else if (err instanceof TypeError) {
          // No answer from the server at all. That is being offline, not a failed attempt: the action
          // keeps its place and its count, and the pass stops until the server is back. (Counting these
          // used to push healthy actions to "manual review" after five tries during an outage.)
          await actionQueueDB.setState(action.id, "PENDING");
          this.noteUnreachable();
          break;
        } else if (err instanceof Error && /^Waiting for offline /.test(err.message)) {
          // It depends on something queued ahead of it that has not gone through yet: wait, don't count.
          await actionQueueDB.setState(action.id, "PENDING");
        } else if (err instanceof Error && /: 401$/.test(err.message)) {
          // Signed out. Keep everything and get the device signed back in.
          await actionQueueDB.setState(action.id, "PENDING");
          reportUnauthorized("/api/sync");
          break;
        } else {
          // Transient failure — increment attempts and retry later
          await actionQueueDB.setState(action.id, "PENDING");
          await actionQueueDB.incrementAttempts(action.id);
          console.warn(
            `[sync] Action ${action.type} (${action.id}) failed, attempt ${action.attempts + 1}:`,
            err
          );
        }
      }
    }

    // Clean up confirmed entries and stale local bookings
    await actionQueueDB.clearConfirmed().catch(() => {});
    await appointmentsCacheDB.cleanupSyncedLocalBookings().catch(() => {});
  }

  private async executeAction(action: SyncAction): Promise<number | null> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Idempotency-Key": action.idempotency_key,
      "X-Device-ID": action.device_id || getDeviceId(),
      "X-Sequence-Index": String(action.sequence_index ?? 0),
    };

    const { payload } = action;

    switch (action.type) {
      case "CREATE_BOOKING": {
        const { tempId: _t, ...body } = payload as any;
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (res.status === 200) {
          const d = await res.clone().json().catch(() => null);
          if (d?.alreadyProcessed) return d.id ?? null;
        }
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`CREATE_BOOKING failed: ${res.status}`);
        const d = await res.json();
        return d.id ?? null;
      }

      case "UPDATE_BOOKING": {
        const { id, ...body } = payload as any;
        if (!id) return null;
        const idNum = Number(id);
        if (!Number.isFinite(idNum) || String(id).startsWith("local_booking_")) {
          throw new SyncConflictError("booking_updated", `${action.type}: unresolved local booking id ${String(id)}`);
        }
        const res = await fetch(`/api/appointments/${idNum}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`UPDATE_BOOKING failed: ${res.status}`);
        return idNum;
      }

      case "CANCEL_BOOKING": {
        const { id, ...body } = payload as any;
        if (!id) return null;
        const idNum = Number(id);
        if (!Number.isFinite(idNum) || String(id).startsWith("local_booking_")) {
          throw new SyncConflictError("booking_updated", `${action.type}: unresolved local booking id ${String(id)}`);
        }
        const res = await fetch(`/api/appointments/${idNum}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ ...body, status: "cancelled" }),
          credentials: "include",
        });
        // 404 on cancel = already gone, treat as conflict not error
        await throwIfConflict(res, action.type);
        if (!res.ok && res.status !== 404)
          throw new Error(`CANCEL_BOOKING failed: ${res.status}`);
        return idNum;
      }

      case "CHECKIN": {
        const { id, ...body } = payload as any;
        if (!id) return null;
        const idNum = Number(id);
        if (!Number.isFinite(idNum) || String(id).startsWith("local_booking_")) {
          throw new SyncConflictError("booking_updated", `${action.type}: unresolved local booking id ${String(id)}`);
        }
        const res = await fetch(`/api/appointments/${idNum}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ ...body, status: "confirmed" }),
          credentials: "include",
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`CHECKIN failed: ${res.status}`);
        return idNum;
      }

      case "CHECKOUT": {
        const { id, ...body } = payload as any;
        if (!id) return null;
        const idNum = Number(id);
        if (!Number.isFinite(idNum) || String(id).startsWith("local_booking_")) {
          throw new SyncConflictError("booking_updated", `${action.type}: unresolved local booking id ${String(id)}`);
        }
        const res = await fetch(`/api/appointments/${idNum}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ ...body, status: "completed" }),
          credentials: "include",
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`CHECKOUT failed: ${res.status}`);
        return idNum;
      }

      case "WALKIN": {
        const res = await fetch("/api/appointments/walk-in", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (res.status === 200) {
          const d = await res.clone().json().catch(() => null);
          if (d?.alreadyProcessed) return d.id ?? null;
        }
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`WALKIN failed: ${res.status}`);
        const d = await res.json();
        return d.id ?? null;
      }

      case "CREATE_CLIENT": {
        const { tempId: _t, ...body } = payload as any;
        const res = await fetch("/api/clients", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (res.status === 200) {
          const d = await res.clone().json().catch(() => null);
          if (d?.alreadyProcessed) return d.id ?? null;
        }
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`CREATE_CLIENT failed: ${res.status}`);
        const d = await res.json();
        return d.id ?? null;
      }

      case "UPDATE_CLIENT": {
        const { id, ...body } = payload as any;
        if (!id) return null;
        const res = await fetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`UPDATE_CLIENT failed: ${res.status}`);
        return Number(id);
      }

      case "LOYALTY_ADJUST": {
        const res = await fetch("/api/loyalty/adjust", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`LOYALTY_ADJUST failed: ${res.status}`);
        return null;
      }

      case "TIMECLOCK_PUNCH": {
        const { action: punchAction, staffId, storeId, ...rest } = payload as any;
        const endpoint = punchAction === "clock_in"
          ? "/api/timeclock/clock-in"
          : "/api/timeclock/clock-out";
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ staffId, storeId, ...rest }),
          credentials: "include",
        });
        // Already clocked in (409), or no open clock-in to close (404): someone got there first, and that is
        // the state this punch wanted. Not a conflict for staff to resolve.
        if ((punchAction === "clock_in" && res.status === 409) || (punchAction !== "clock_in" && res.status === 404)) return null;
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`TIMECLOCK_PUNCH failed: ${res.status}`);
        return null;
      }

      case "TURN_ASSIGN": {
        const res = await fetch("/api/turn/assign-walkin", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (res.status === 409) {
          // For an offline-origin pick (payload carries staffId + source:"offline_turn"),
          // a 409 means the tech this device claimed while offline is no longer
          // eligible server-side (someone else got there first) — surface as a
          // conflict so the UI can tell the front desk, rather than silently
          // swallowing it. The appointment itself is unaffected either way.
          if ((payload as any).source === "offline_turn") {
            const detail = await extractConflictDetail(res, action.type);
            throw new SyncConflictError("turn_changed", detail);
          }
          // Online-origin 409 = already assigned / idempotent — treat as success.
          try { window.dispatchEvent(new CustomEvent("turn-eligibility-changed")); } catch {}
          return null;
        }
        if (!res.ok) throw new Error(`TURN_ASSIGN failed: ${res.status}`);
        try { window.dispatchEvent(new CustomEvent("turn-eligibility-changed")); } catch {}
        return null;
      }

      case "TURN_LOG_OVERRIDE": {
        const res = await fetch("/api/turn/log-override", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        // Log failures are non-critical — don't retry endlessly
        if (!res.ok && res.status !== 404) throw new Error(`TURN_LOG_OVERRIDE failed: ${res.status}`);
        return null;
      }

      case "NAIL_BOOKING": {
        const { storeId, clientId, info: _info, ...rest } = payload as any;
        let client = Number(clientId);
        // A client made on the tablet offline has a temporary (negative) id until it is sent.
        if (client < 0) {
          const rec = (await nailOffline.records(Number(storeId)).catch(() => [])).find((r) => r.id === client) as { realId?: number | null } | undefined;
          if (!rec?.realId) throw new Error(`Waiting for offline client ${client} to sync before ${action.type}`);
          client = Number(rec.realId);
        }
        const res = await fetch("/api/nail/bookings", {
          method: "POST", headers, credentials: "include", body: JSON.stringify({ ...rest, clientId: client }),
        });
        // The time was taken on another device meanwhile, or the booking no longer fits: the front desk has to
        // call the client and pick another time — shown as a conflict, never retried into a double booking.
        if (res.status === 409 || res.status === 400) {
          const data = await res.json().catch(() => null);
          const who = (payload as any).info?.label ? ` (${(payload as any).info.label})` : "";
          throw new SyncConflictError("booking_updated", `A booking made offline could not be kept${who}: ${data?.message ?? "the time is no longer free"}. Call the client to pick another time.`);
        }
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`NAIL_BOOKING failed: ${res.status}`);
        try { window.dispatchEvent(new CustomEvent("turn-eligibility-changed")); } catch { /* ignore */ }
        return null;
      }

      case "TURN_ADJUST": {
        const { storeId: _store, ...body } = payload as any;
        const res = await fetch("/api/nail/turn-adjust", { method: "POST", headers, credentials: "include", body: JSON.stringify(body) });
        // The PIN is no longer the salon's (changed meanwhile), the technician is gone, or the rules no longer
        // allow it: the manager has to look again — shown as a conflict, not retried.
        if (res.status === 400 || res.status === 403 || res.status === 404) {
          const data = await res.json().catch(() => null);
          throw new SyncConflictError("turn_changed", `A turn change made offline was not saved: ${data?.message ?? "it was refused"}.`);
        }
        if (!res.ok) throw new Error(`TURN_ADJUST failed: ${res.status}`);
        try { window.dispatchEvent(new CustomEvent("turn-eligibility-changed")); } catch { /* ignore */ }
        return null;
      }

      case "RECEIPT_TEXT": {
        const { storeId, appointmentId, phone, snapshot } = payload as any;
        let id = Number(appointmentId);
        // A ticket made on the tablet offline has a temporary (negative) id until it is sent.
        if (id < 0) {
          const rec = (await nailOffline.records(Number(storeId)).catch(() => [])).find((r) => r.id === id) as { realId?: number | null } | undefined;
          if (!rec?.realId) throw new Error(`Waiting for offline ticket ${id} to sync before ${action.type}`);
          id = Number(rec.realId);
        }
        const res = await fetch("/api/pos/receipt-link", {
          method: "POST", headers, credentials: "include",
          body: JSON.stringify({ appointmentId: id, phone, snapshot }),
        });
        await throwIfConflict(res, action.type);
        if (!res.ok) throw new Error(`RECEIPT_TEXT failed: ${res.status}`);
        return null;
      }

      default:
        console.warn(`[sync] Unknown action type: ${(action as any).type}`);
        return null;
    }
  }

  // ── Waitlist op processing (legacy pendingOps) ───────────────────────────

  private buildHeaders(op: PendingOp): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Idempotency-Key": op.idempotencyKey,
      "X-Device-ID": op.deviceId || getDeviceId(),
      "X-Sequence-Index": String(op.sequenceIndex ?? 0),
    };
  }

  private async executeOp(op: PendingOp): Promise<void> {
    const { type, payload } = op;

    if (type === "create_queue") {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: this.buildHeaders(op),
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (res.status === 200 && (await res.clone().json().catch(() => null))?.alreadyProcessed) {
        return;
      }
      if (!res.ok) throw new Error(`create_queue failed: ${res.status}`);

      const data = await res.json();
      if (payload.tempId && data.id) {
        await offlineDB.replaceTempId(payload.tempId as string, data.id as number);
        this.notifyQueueChange();
      }
      return;
    }

    if (type === "update_queue") {
      const { serverId, ...updates } = payload;
      if (!serverId) return;
      const res = await fetch(`/api/waitlist/${serverId}`, {
        method: "PUT",
        headers: this.buildHeaders(op),
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`update_queue failed: ${res.status}`);
      return;
    }

    if (type === "delete_queue") {
      const { serverId } = payload;
      if (!serverId) return;
      const res = await fetch(`/api/waitlist/${serverId}`, {
        method: "DELETE",
        headers: {
          "X-Idempotency-Key": op.idempotencyKey,
          "X-Device-ID": op.deviceId || getDeviceId(),
        },
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`delete_queue failed: ${res.status}`);
      }
      return;
    }

    if (type === "queue_next") {
      const { storeId } = payload;
      const res = await fetch(
        `/api/queue/next${storeId ? `?storeId=${storeId}` : ""}`,
        {
          method: "POST",
          headers: {
            "X-Idempotency-Key": op.idempotencyKey,
            "X-Device-ID": op.deviceId || getDeviceId(),
          },
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error(`queue_next failed: ${res.status}`);
      return;
    }
  }

  async fetchAndMergeServerState(storeId: number): Promise<void> {
    try {
      const res = await fetch("/api/waitlist?scope=today", { credentials: "include" });
      if (!res.ok) return;
      const data: ServerEntry[] = await res.json();
      const todayStr = new Date().toDateString();
      const todayEntries = data.filter(
        (e) => new Date(e.createdAt).toDateString() === todayStr
      );
      await offlineDB.mergeServerQueue(todayEntries, storeId);
      this.notifyQueueChange();
    } catch {}
  }
}

export const syncEngine = new SyncEngine();

/** What this tablet is, for the back office POS tab: its screen (/nail, /frontdesk…), station and app build. */
function deviceDetails(): { page?: string; registerId?: number; appBuild?: string } {
  if (typeof window === "undefined") return {};
  const out: { page?: string; registerId?: number; appBuild?: string } = {};
  const page = window.location.pathname.split("/")[1];
  if (page) out.page = `/${page}`.slice(0, 60);
  try { const r = Number(localStorage.getItem("certxa_register_id")); if (Number.isInteger(r) && r > 0) out.registerId = r; } catch { /* none */ }
  const build = (window as unknown as { CERTXA_APP_BUILD?: string }).CERTXA_APP_BUILD;
  if (build) out.appBuild = String(build).slice(0, 60);
  return out;
}
