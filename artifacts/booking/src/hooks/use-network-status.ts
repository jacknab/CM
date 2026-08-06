import { useState, useEffect } from "react";
import { syncEngine, type SyncStatus } from "@/lib/sync-engine";

export function useNetworkStatus() {
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());

  useEffect(() => {
    return syncEngine.onStatusChange(setStatus);
  }, []);

  return status;
}
