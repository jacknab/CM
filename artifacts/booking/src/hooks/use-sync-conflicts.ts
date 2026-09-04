import { useState, useEffect } from "react";
import { enterpriseSyncEngine } from "@/lib/enterprise-sync-engine";
import { syncEngine } from "@/lib/sync-engine";

export type ConflictKind =
  | "booking_updated"
  | "walkin_merged"
  | "staff_changed"
  | "batch_resumed"
  | "action_rejected"
  | "generic"
  | "turn_changed";

export type ConflictEntry = {
  id: string;
  kind: ConflictKind;
  detail?: string;
  ts: number;
};

let _conflicts: ConflictEntry[] = [];
const _listeners = new Set<(c: ConflictEntry[]) => void>();

function notify() {
  _listeners.forEach((fn) => fn([..._conflicts]));
}

export function addConflict(entry: Omit<ConflictEntry, "id" | "ts">): void {
  const full: ConflictEntry = {
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
  };
  _conflicts = [full, ..._conflicts].slice(0, 8);
  notify();
}

export function dismissConflict(id: string): void {
  _conflicts = _conflicts.filter((c) => c.id !== id);
  notify();
}

export function clearConflicts(): void {
  _conflicts = [];
  notify();
}

export function useSyncConflicts(): ConflictEntry[] {
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([..._conflicts]);

  useEffect(() => {
    _listeners.add(setConflicts);
    return () => { _listeners.delete(setConflicts); };
  }, []);

  // Enterprise sync engine (bulk /api/sync/queue path)
  useEffect(() => {
    return enterpriseSyncEngine.onConflict((kind, detail) => {
      addConflict({ kind: kind as ConflictKind, detail });
    });
  }, []);

  // Simple sync engine (per-action path — offline queue)
  useEffect(() => {
    return syncEngine.onConflict((kind, detail) => {
      addConflict({ kind: kind as ConflictKind, detail });
    });
  }, []);

  return conflicts;
}
