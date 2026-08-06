import { offlineDB } from "./offline-db";
import { snapshotDB } from "./snapshot-db";

export type HealthStatus = "healthy" | "degraded" | "stateless";

export type HealthReport = {
  status: HealthStatus;
  indexedDBAvailable: boolean;
  queueCorrupted: boolean;
  opsCorrupted: boolean;
  snapshotCorrupted: boolean;
};

function isValidQueueRecord(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const rec = r as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.customerName === "string" &&
    typeof rec.status === "string" &&
    typeof rec.synced === "boolean" &&
    typeof rec.createdAt === "string"
  );
}

function isValidPendingOp(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const op = o as Record<string, unknown>;
  return (
    typeof op.id === "string" &&
    typeof op.type === "string" &&
    typeof op.idempotencyKey === "string" &&
    typeof op.createdAt === "string"
  );
}

function isValidSnapshot(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const snap = s as Record<string, unknown>;
  return (
    typeof snap.version === "string" &&
    typeof snap.storeId === "number" &&
    Array.isArray(snap.services) &&
    Array.isArray(snap.categories) &&
    Array.isArray(snap.addons) &&
    Array.isArray(snap.staff)
  );
}

export async function runHealthCheck(storeId?: number): Promise<HealthReport> {
  let indexedDBAvailable = true;
  let queueCorrupted = false;
  let opsCorrupted = false;
  let snapshotCorrupted = false;

  try {
    await offlineDB.getAllPendingOps();
  } catch {
    return {
      status: "stateless",
      indexedDBAvailable: false,
      queueCorrupted: true,
      opsCorrupted: true,
      snapshotCorrupted: true,
    };
  }

  try {
    const queue = await offlineDB.getAllQueue();
    const corrupted = queue.filter((r) => !isValidQueueRecord(r));
    if (corrupted.length > 0) {
      queueCorrupted = true;
      const valid = queue.filter((r) => isValidQueueRecord(r));
      await offlineDB.clearQueue();
      for (const r of valid) await offlineDB.putQueue(r).catch(() => {});
    }
  } catch {
    queueCorrupted = true;
    try { await offlineDB.clearQueue(); } catch {}
  }

  try {
    const ops = await offlineDB.getAllPendingOps();
    const corrupted = ops.filter((o) => !isValidPendingOp(o));
    if (corrupted.length > 0) {
      opsCorrupted = true;
      const valid = ops.filter((o) => isValidPendingOp(o));
      await offlineDB.clearPendingOps();
      for (const o of valid) await offlineDB.addPendingOp(o).catch(() => {});
    }
  } catch {
    opsCorrupted = true;
    try { await offlineDB.clearPendingOps(); } catch {}
  }

  if (storeId != null) {
    try {
      const snapshot = await snapshotDB.load(storeId);
      if (snapshot !== null && !isValidSnapshot(snapshot)) {
        snapshotCorrupted = true;
      }
    } catch {
      snapshotCorrupted = true;
    }
  }

  const status: HealthStatus =
    !indexedDBAvailable
      ? "stateless"
      : queueCorrupted || opsCorrupted || snapshotCorrupted
      ? "degraded"
      : "healthy";

  return { status, indexedDBAvailable, queueCorrupted, opsCorrupted, snapshotCorrupted };
}
