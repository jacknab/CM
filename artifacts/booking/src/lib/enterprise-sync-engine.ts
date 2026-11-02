import { actionQueueDB, type ActionType, type SyncAction } from "./action-queue-db";
import { syncStateDB } from "./sync-state-db";
import { getDeviceId } from "./device-id";
import { syncEngine } from "./sync-engine";
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

const WS_RECONNECT_BASE_MS = 2_000;
const WS_RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

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

class EnterpriseSyncEngine {
  private status: EnterpriseSyncStatus = navigator.onLine ? "online" : "offline";
  private statusListeners = new Set<StatusListener>();
  private wsEventListeners = new Set<WsEventListener>();
  private queueCountListeners = new Set<QueueCountListener>();
  private conflictListeners = new Set<ConflictListener>();

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
    // A batch record left by the bulk sender this engine used to run (see runBulkSync). Its actions were put back
    // in line or sent since; announcing it made every launch say "Resuming 1 unfinished action(s)" for a day.
    await syncStateDB.clearPendingBatch().catch(() => {});
    await this.runBulkSync(storeId);
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

    if (navigator.onLine) this.scheduleSyncWithDelay(200);

    return action;
  }

  /**
   * Sends the queued actions — through the main sync engine (lib/sync-engine.ts), the one sender for this queue.
   * This engine used to post them to /api/sync/queue as well, at the same time: that route only knows nine action
   * types, so a clock-in, turn adjustment, /nail booking or receipt text sent that way got no answer and was left
   * marked SYNCING, where neither engine would ever send it (2026-11-02).
   */
  async runBulkSync(storeId?: number): Promise<void> {
    const effectiveStoreId = storeId ?? this.currentStoreId;
    if (!effectiveStoreId || !navigator.onLine) return;
    this.emit("syncing");
    try {
      await syncEngine.runSync(effectiveStoreId);
    } finally {
      await this.emitQueueCount();
      this.emit(navigator.onLine ? "online" : "offline");
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
