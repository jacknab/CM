import { actionQueueDB, type ActionType, type SyncAction } from "./action-queue-db";
import { syncStateDB } from "./sync-state-db";
import { getDeviceId } from "./device-id";
import type { ConflictKind } from "@/hooks/use-sync-conflicts";

export type EnterpriseSyncStatus =
  | "online"
  | "offline"
  | "syncing"
  | "reconciling";

export type WsEvent = {
  type:
    | "booking_created"
    | "booking_updated"
    | "booking_deleted"
    | "staff_assigned"
    | "new_booking"
    | "payment_received"
    | "appointment_cancelled"
    | "turn_eligibility_changed";
  storeId: number;
  id: string;
  ts: number;
  [key: string]: unknown;
};

type StatusListener = (s: EnterpriseSyncStatus) => void;
type WsEventListener = (e: WsEvent) => void;
type QueueCountListener = (n: number) => void;
type ConflictListener = (kind: ConflictKind, detail?: string) => void;

const SYNC_PROTOCOL_VERSION = "1.0";
const MAX_ATTEMPTS = 5;
const BACKOFF_CAPS = [1_000, 5_000, 15_000, 60_000];
const WS_RECONNECT_BASE_MS = 2_000;
const WS_RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

function backoffDelay(attempts: number): number {
  const index = Math.min(attempts, BACKOFF_CAPS.length - 1);
  return BACKOFF_CAPS[index] + Math.random() * 500;
}

function buildWsUrl(storeId: number): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/notifications?storeId=${storeId}`;
}

function entityFingerprint(type: ActionType, payload: Record<string, unknown>): string {
  const p = payload as any;
  if (type === "CREATE_BOOKING") {
    const raw = p.date ? new Date(p.date) : null;
    const rounded = raw
      ? new Date(raw.getTime() - (raw.getMinutes() % 15) * 60_000).toISOString().slice(0, 16)
      : "nodate";
    return `booking:${p.customerId ?? ""}:${p.staffId ?? ""}:${rounded}`;
  }
  if (type === "WALKIN") {
    const name = String(p.customerName ?? "").toLowerCase().trim();
    return `walkin:${name}:${p.serviceId ?? ""}:${p.staffId ?? ""}`;
  }
  return "";
}

function makeBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferConflictKind(actionType: string): ConflictKind {
  if (actionType === "ASSIGN_STAFF") return "staff_changed";
  if (actionType === "WALKIN") return "walkin_merged";
  if (["UPDATE_BOOKING", "CHECKIN", "CHECKOUT", "CREATE_BOOKING"].includes(actionType)) return "booking_updated";
  return "generic";
}

class EnterpriseSyncEngine {
  private status: EnterpriseSyncStatus = navigator.onLine ? "online" : "offline";
  private statusListeners = new Set<StatusListener>();
  private wsEventListeners = new Set<WsEventListener>();
  private queueCountListeners = new Set<QueueCountListener>();
  private conflictListeners = new Set<ConflictListener>();

  private isSyncing = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongTs = 0;
  private currentStoreId: number | null = null;

  constructor() {
    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());
  }

  getStatus(): EnterpriseSyncStatus { return this.status; }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onWsEvent(fn: WsEventListener): () => void {
    this.wsEventListeners.add(fn);
    return () => this.wsEventListeners.delete(fn);
  }

  onQueueCountChange(fn: QueueCountListener): () => void {
    this.queueCountListeners.add(fn);
    return () => this.queueCountListeners.delete(fn);
  }

  onConflict(fn: ConflictListener): () => void {
    this.conflictListeners.add(fn);
    return () => this.conflictListeners.delete(fn);
  }

  private emit(s: EnterpriseSyncStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  private emitWsEvent(e: WsEvent) {
    this.wsEventListeners.forEach((fn) => fn(e));
  }

  private emitConflict(kind: ConflictKind, detail?: string) {
    this.conflictListeners.forEach((fn) => fn(kind, detail));
  }

  private async emitQueueCount() {
    try {
      const count = await actionQueueDB.getPendingCount();
      this.queueCountListeners.forEach((fn) => fn(count));
    } catch {}
  }

  private handleOnline() {
    this.emit("syncing");
    this.scheduleSyncWithDelay(500);
    if (this.currentStoreId) this.connectWebSocket(this.currentStoreId);
  }

  private handleOffline() {
    this.emit("offline");
    this.cancelSyncTimer();
    this.disconnectWs();
  }

  private cancelSyncTimer() {
    if (this.syncTimer) { clearTimeout(this.syncTimer); this.syncTimer = null; }
  }

  private scheduleSyncWithDelay(ms: number) {
    this.cancelSyncTimer();
    this.syncTimer = setTimeout(() => this.runBulkSync(), ms);
  }

  async initialize(storeId: number): Promise<void> {
    this.currentStoreId = storeId;
    this.connectWebSocket(storeId);

    const pendingBatch = await syncStateDB.getPendingBatch().catch(() => null);
    if (pendingBatch && pendingBatch.action_ids.length > 0) {
      const ageMs = Date.now() - pendingBatch.started_at;
      if (ageMs < 24 * 60 * 60 * 1000) {
        this.emitConflict(
          "batch_resumed",
          `Resuming ${pendingBatch.action_ids.length} unfinished action(s) from previous session`
        );
      } else {
        await syncStateDB.clearPendingBatch().catch(() => {});
      }
    }

    if (navigator.onLine) {
      await this.runBulkSync();
    }
  }

  async enqueueAction(
    type: ActionType,
    entityTempId: string,
    payload: Record<string, unknown>
  ): Promise<SyncAction> {
    const fingerprint = entityFingerprint(type, payload);
    const action = await actionQueueDB.add({
      type,
      entity_temp_id: entityTempId,
      payload: fingerprint ? { ...payload, _fingerprint: fingerprint } : payload,
      timestamp: Date.now(),
      idempotency_key: `${getDeviceId()}_${type}_${entityTempId}_${Date.now()}`,
    });

    await this.emitQueueCount();

    if (navigator.onLine && !this.isSyncing) {
      this.scheduleSyncWithDelay(200);
    }

    return action;
  }

  async runBulkSync(storeId?: number): Promise<void> {
    if (this.isSyncing || !navigator.onLine) return;

    const effectiveStoreId = storeId ?? this.currentStoreId;
    if (!effectiveStoreId) return;

    this.isSyncing = true;
    this.emit("syncing");

    try {
      const pending = await actionQueueDB.getPending();
      if (pending.length === 0) {
        this.emit("online");
        this.isSyncing = false;
        return;
      }

      const batchId = makeBatchId();
      const ids = pending.map((a) => a.id);
      await actionQueueDB.setStates(ids, "SYNCING");
      await syncStateDB.savePendingBatch(batchId, ids).catch(() => {});

      const { batchId: resumeBatchId, index: lastConfirmedIndex } =
        await syncStateDB.getLastConfirmedIndex().catch(() => ({ batchId: null, index: -1 }));

      const actionsToSend = pending.map((a, i) => ({
        id: a.id,
        type: a.type,
        entity_temp_id: a.entity_temp_id,
        payload: a.payload,
        timestamp: a.timestamp,
        idempotency_key: a.idempotency_key,
        device_id: a.device_id,
        sequence_index: a.sequence_index,
        order_index: i,
        entity_fingerprint: (a.payload as any)?._fingerprint ?? undefined,
      }));

      const res = await fetch("/api/sync/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": getDeviceId(),
        },
        body: JSON.stringify({
          storeId: effectiveStoreId,
          batch_id: batchId,
          sync_protocol_version: SYNC_PROTOCOL_VERSION,
          actions: actionsToSend,
        }),
        credentials: "include",
      });

      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as any;
        if (body?.version_mismatch) {
          console.warn("[enterprise-sync] Protocol version mismatch — clearing queue and re-initializing");
          await actionQueueDB.setStates(ids, "PENDING");
          await syncStateDB.clearPendingBatch().catch(() => {});
          this.emitConflict("generic", "Sync protocol mismatch — snapshot refreshed");
          this.scheduleSyncWithDelay(5_000);
        } else {
          await actionQueueDB.setStates(ids, "PENDING");
          this.scheduleSyncWithDelay(backoffDelay(1));
        }
        return;
      }

      if (!res.ok) {
        await actionQueueDB.setStates(ids, "PENDING");
        for (const id of ids) await actionQueueDB.incrementAttempts(id);
        const allPending = await actionQueueDB.getPending();
        for (const a of allPending) {
          if (a.attempts >= MAX_ATTEMPTS) {
            await actionQueueDB.setState(a.id, "CONFLICT", { conflict: "Max retry attempts exceeded" });
            this.emitConflict("generic", `Action ${a.type} failed after ${MAX_ATTEMPTS} attempts`);
          }
        }
        this.scheduleSyncWithDelay(backoffDelay(1));
        return;
      }

      const body = await res.json() as {
        batch_id: string;
        last_successfully_processed_index: number;
        mappings: Record<string, number>;
        results: Array<{ actionId: string; type: string; status: string; conflict?: string; order_index?: number }>;
        conflicts: { actionId: string; type: string; detail: string }[];
      };

      const { mappings, results, last_successfully_processed_index } = body;

      await syncStateDB.saveConfirmedIndex(batchId, last_successfully_processed_index).catch(() => {});
      await syncStateDB.clearPendingBatch().catch(() => {});

      await actionQueueDB.applyMappings(mappings);

      for (const result of results ?? []) {
        if (result.status === "conflict") {
          await actionQueueDB.setState(result.actionId, "CONFLICT", { conflict: result.conflict });
          this.emitConflict(inferConflictKind(result.type), result.conflict);
        } else if (result.status === "duplicate") {
          if (result.conflict) {
            this.emitConflict(inferConflictKind(result.type), result.conflict);
          }
        }
      }

      await actionQueueDB.clearConfirmed();
      await this.emitQueueCount();
      this.emit("online");
    } catch {
      const allActions = await actionQueueDB.getAll();
      for (const a of allActions) {
        if (a.state === "SYNCING") {
          await actionQueueDB.setState(a.id, "PENDING");
          await actionQueueDB.incrementAttempts(a.id);
        }
      }
      this.scheduleSyncWithDelay(backoffDelay(1));
    } finally {
      this.isSyncing = false;
    }
  }

  connectWebSocket(storeId: number): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) return;

    try {
      const url = buildWsUrl(storeId);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.wsReconnectAttempts = 0;
        if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
        this.lastPongTs = Date.now();
        this.startHeartbeat(storeId);
      };

      this.ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data);
          if (event.type === "pong") {
            this.lastPongTs = Date.now();
            return;
          }
          this.emitWsEvent(event as WsEvent);
        } catch {}
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (navigator.onLine) this.scheduleWsReconnect(storeId);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {}
  }

  private startHeartbeat(storeId: number): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }
      if (Date.now() - this.lastPongTs > HEARTBEAT_TIMEOUT_MS) {
        console.warn("[enterprise-sync] WS heartbeat timeout — reconnecting");
        this.stopHeartbeat();
        this.ws.close();
        return;
      }
      try {
        this.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {}
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleWsReconnect(storeId: number) {
    if (this.wsReconnectTimer) return;
    const delay = Math.min(
      WS_RECONNECT_BASE_MS * Math.pow(1.5, this.wsReconnectAttempts),
      WS_RECONNECT_MAX_MS
    );
    this.wsReconnectAttempts++;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket(storeId);
    }, delay);
  }

  disconnectWs(): void {
    this.stopHeartbeat();
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  destroy(): void {
    this.cancelSyncTimer();
    this.disconnectWs();
  }
}

export const enterpriseSyncEngine = new EnterpriseSyncEngine();
