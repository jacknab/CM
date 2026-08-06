import { createContext, useContext, useState, useEffect } from "react";
import { snapshotService, type SnapshotLoadStatus } from "@/lib/snapshot-service";
import type { BusinessSnapshot } from "@/lib/snapshot-db";

type SnapshotContextValue = {
  snapshot: BusinessSnapshot | null;
  status: SnapshotLoadStatus;
};

export const SnapshotContext = createContext<SnapshotContextValue>({
  snapshot: null,
  status: "idle",
});

export function useSnapshot() {
  return useContext(SnapshotContext);
}

export function useSnapshotState(): SnapshotContextValue {
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(
    snapshotService.getSnapshot()
  );
  const [status, setStatus] = useState<SnapshotLoadStatus>(
    snapshotService.getStatus()
  );

  useEffect(() => {
    const unsubData = snapshotService.onDataChange(setSnapshot);
    const unsubStatus = snapshotService.onStatusChange(setStatus);
    return () => {
      unsubData();
      unsubStatus();
    };
  }, []);

  return { snapshot, status };
}
