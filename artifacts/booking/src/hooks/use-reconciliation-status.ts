import { useState, useEffect } from "react";
import { reconciliationManager, type ReconciliationStatus } from "@/lib/reconciliation";
import { syncEngine, type SyncStatus } from "@/lib/sync-engine";
import { snapshotService, type SnapshotLoadStatus } from "@/lib/snapshot-service";

export type OfflineBannerState =
  | "reconciling"
  | "syncing"
  | "offline_cached"
  | "offline_uncached"
  | "online";

export function useReconciliationStatus(): {
  bannerState: OfflineBannerState;
  reconciliationStatus: ReconciliationStatus;
  syncStatus: SyncStatus;
  snapshotStatus: SnapshotLoadStatus;
} {
  const [reconciliationStatus, setReconciliationStatus] =
    useState<ReconciliationStatus>(reconciliationManager.getStatus());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    syncEngine.getStatus()
  );
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotLoadStatus>(
    snapshotService.getStatus()
  );

  useEffect(() => {
    const unsub1 = reconciliationManager.onStatusChange(setReconciliationStatus);
    const unsub2 = syncEngine.onStatusChange(setSyncStatus);
    const unsub3 = snapshotService.onStatusChange(setSnapshotStatus);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  let bannerState: OfflineBannerState = "online";

  if (reconciliationStatus === "reconciling") {
    bannerState = "reconciling";
  } else if (syncStatus === "syncing") {
    bannerState = "syncing";
  } else if (syncStatus === "offline") {
    const hasCache =
      snapshotStatus === "cached" ||
      snapshotStatus === "offline" ||
      snapshotStatus === "fresh";
    bannerState = hasCache ? "offline_cached" : "offline_uncached";
  }

  return { bannerState, reconciliationStatus, syncStatus, snapshotStatus };
}
