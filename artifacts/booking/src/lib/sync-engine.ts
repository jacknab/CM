import { offlineDB, type PendingOp, type ServerEntry } from "./offline-db";
import { actionQueueDB, type ActionType, type SyncAction } from "./action-queue-db";
import { appointmentsCacheDB } from "./appointments-cache-db";
import { getDeviceId } from "./device-id";
import { clientPhoneCacheDB } from "./client-phone-cache-db";

export type SyncStatus = "online" | "offline" | "syncing";

export type SyncConflictKind =
  | "booking_updated"
  | "walkin_merged"
  | "staff_changed"
  | "batch_resumed"
  | "action_rejected"
  | "generic";

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

class SyncEngine {
  private status: SyncStatus = navigator.onLine ? "online" : "offline";
  private syncListeners: Set<SyncListener> = new Set();
  private queueListeners: Set<QueueListener> = new Set();
  private conflictListeners: Set<ConflictListener> = new Set();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;
  private onlineHandlers: Set<OnlineHandler> = new Set();
  private lastKnownStoreId: number | undefined;

  constructor() {
    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());
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
    const [ops, actions] = await Promise.all([
      offlineDB.getAllPendingOps().catch(() => [] as PendingOp[]),
      actionQueueDB.getPending().catch(() => [] as SyncAction[]),
    ]);
    return ops.length + actions.length;
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
    if (this.isSyncing || !navigator.onLine) return;
    this.isSyncing = true;
    this.setStatus("syncing");

    const effectiveStoreId = storeId ?? this.lastKnownStoreId;

    try {
      // ── Phase 1: waitlist pendingOps ────────────────────────────────────
      const ops = await offlineDB.getAllPendingOps();

      for (const op of ops) {
        if (op.attempts >= MAX_ATTEMPTS) {
          await offlineDB.deletePendingOp(op.id);
          continue;
        }

        try {
          await this.executeOp(op);
          await offlineDB.deletePendingOp(op.id);
          this.notifyQueueChange();
        } catch {
          await offlineDB.incrementOpAttempts(op.id);
          const delay =
            BACKOFF_BASE_MS * Math.pow(2, op.attempts) + Math.random() * 500;
          this.scheduleSyncWithDelay(delay);
          break;
        }
      }

      // ── Phase 2: action queue (bookings, clients, loyalty, timeclock) ───
      await this.processActionQueue();

      if (effectiveStoreId) {
        await this.fetchAndMergeServerState(effectiveStoreId);
      }

      const [remainingOps, remainingActions] = await Promise.all([
        offlineDB.getAllPendingOps(),
        actionQueueDB.getPending(),
      ]);
      this.setStatus(
        remainingOps.length + remainingActions.length > 0 ? "syncing" : "online"
      );
    } catch {
      this.setStatus(navigator.onLine ? "online" : "offline");
    } finally {
      this.isSyncing = false;
    }
  }

  // ── Action queue processing ──────────────────────────────────────────────

  private async processActionQueue(): Promise<void> {
    const pending = await actionQueueDB.getPending().catch(() => [] as SyncAction[]);
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

        // Mark local booking as synced so calendar stops showing temp entry
        if (action.type === "CREATE_BOOKING" && action.entity_temp_id && realId) {
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
          body: JSON.stringify({ ...body, status: "checked_in" }),
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
        // 409 = already assigned / idempotent — treat as success for this action
        if (!res.ok && res.status !== 409) throw new Error(`TURN_ASSIGN failed: ${res.status}`);
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
