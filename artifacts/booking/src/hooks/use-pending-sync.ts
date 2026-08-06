import { useState, useEffect } from "react";
import { actionQueueDB } from "@/lib/action-queue-db";
import { syncEngine } from "@/lib/sync-engine";

export type SyncState = "pending" | "syncing" | "conflict" | "confirmed";

/** Map keyed by entity_temp_id (local) OR "real:<id>" (server ID for updates) */
type SyncMap = Map<string, SyncState>;
/** Map of the same keys → human-readable conflict reason (only present when state is "conflict") */
type ConflictMap = Map<string, string>;

export type PendingSyncResult = {
  syncMap: SyncMap;
  conflictMap: ConflictMap;
};

function worstState(a: SyncState | undefined, b: SyncState): SyncState {
  if (a === "conflict" || b === "conflict") return "conflict";
  if (a === "pending"  || b === "pending")  return "pending";
  return "syncing";
}

async function buildSyncMap(): Promise<PendingSyncResult> {
  const all = await actionQueueDB.getAll().catch(() => []);
  const syncMap: SyncMap = new Map();
  const conflictMap: ConflictMap = new Map();

  for (const action of all) {
    if (!action.entity_temp_id) continue;
    const s = action.state;

    // Only track non-confirmed states
    if (s !== "CONFLICT" && s !== "PENDING" && s !== "SYNCING") continue;

    const mapped: SyncState =
      s === "CONFLICT" ? "conflict" : s === "PENDING" ? "pending" : "syncing";

    // --- index by temp ID (locally created entities) ---
    const tempKey = action.entity_temp_id;
    const curTemp = syncMap.get(tempKey);
    const newTemp = worstState(curTemp, mapped);
    syncMap.set(tempKey, newTemp);
    if (mapped === "conflict" && action.conflict) {
      conflictMap.set(tempKey, action.conflict);
    }

    // --- also index by real server ID (for UPDATE_BOOKING, CHECKIN, etc.) ---
    // payload.id is the appointment's real DB id for update-type actions
    const realId =
      (typeof (action.payload?.id) === "number" ? action.payload.id : null) ??
      (typeof action.entity_real_id === "number" ? action.entity_real_id : null);

    if (realId) {
      const realKey = `real:${realId}`;
      const curReal = syncMap.get(realKey);
      syncMap.set(realKey, worstState(curReal, mapped));
      if (mapped === "conflict" && action.conflict) {
        conflictMap.set(realKey, action.conflict);
      }
    }
  }

  return { syncMap, conflictMap };
}

/**
 * Returns a map of entity_temp_id / "real:<id>" → sync state for all queued
 * actions, plus a matching map of conflict detail strings.
 *
 * Usage on a calendar card:
 *   const syncState = syncMap.get(apt._tempId) ?? syncMap.get(`real:${apt.id}`);
 *   const detail    = conflictMap.get(apt._tempId) ?? conflictMap.get(`real:${apt.id}`);
 */
export function usePendingSyncMap(): PendingSyncResult {
  const [result, setResult] = useState<PendingSyncResult>({
    syncMap: new Map(),
    conflictMap: new Map(),
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      buildSyncMap().then((r) => {
        if (!cancelled) setResult(r);
      });
    };

    refresh();

    const unsub  = syncEngine.onQueueChange(refresh);
    const unsub2 = syncEngine.onStatusChange(refresh);

    return () => {
      cancelled = true;
      unsub();
      unsub2();
    };
  }, []);

  return result;
}
