export type AuditStatus =
  | "applied"
  | "duplicate"
  | "conflict"
  | "skipped"
  | "error"
  | "reconciled"
  | "merged"
  | "rejected";

export type AuditEntry = {
  id: string;
  ts: number;
  storeId: number;
  deviceId: string;
  batchId?: string;
  actionId?: string;
  actionType: string;
  status: AuditStatus;
  resolution?: string;
  detail?: string;
  entityId?: number;
};

const MAX_ENTRIES_PER_STORE = 500;
const auditRing = new Map<number, AuditEntry[]>();

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function logAuditEntry(entry: Omit<AuditEntry, "id">): AuditEntry {
  const full: AuditEntry = { ...entry, id: makeId() };
  if (!auditRing.has(entry.storeId)) auditRing.set(entry.storeId, []);
  const ring = auditRing.get(entry.storeId)!;
  ring.unshift(full);
  if (ring.length > MAX_ENTRIES_PER_STORE) ring.length = MAX_ENTRIES_PER_STORE;
  return full;
}

export function getAuditLog(storeId: number, limit = 100): AuditEntry[] {
  return (auditRing.get(storeId) ?? []).slice(0, Math.min(limit, MAX_ENTRIES_PER_STORE));
}

export function getAuditStats(storeId: number): {
  total: number;
  applied: number;
  conflicts: number;
  duplicates: number;
  errors: number;
  reconciled: number;
} {
  const entries = auditRing.get(storeId) ?? [];
  return {
    total: entries.length,
    applied: entries.filter((e) => e.status === "applied").length,
    conflicts: entries.filter((e) => e.status === "conflict").length,
    duplicates: entries.filter((e) => e.status === "duplicate" || e.status === "merged").length,
    errors: entries.filter((e) => e.status === "error").length,
    reconciled: entries.filter((e) => e.status === "reconciled").length,
  };
}

export function clearAuditLog(storeId: number): void {
  auditRing.delete(storeId);
}
