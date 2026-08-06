import { useState, useEffect, useCallback } from "react";
import { enterpriseSyncEngine, type EnterpriseSyncStatus } from "@/lib/enterprise-sync-engine";
import type { ActionType } from "@/lib/action-queue-db";

export function useEnterpriseSyncStatus(): EnterpriseSyncStatus {
  const [status, setStatus] = useState<EnterpriseSyncStatus>(
    enterpriseSyncEngine.getStatus()
  );
  useEffect(() => enterpriseSyncEngine.onStatusChange(setStatus), []);
  return status;
}

export function usePendingActionCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => enterpriseSyncEngine.onQueueCountChange(setCount), []);
  return count;
}

export function useEnqueueAction() {
  return useCallback(
    (type: ActionType, entityTempId: string, payload: Record<string, unknown>) =>
      enterpriseSyncEngine.enqueueAction(type, entityTempId, payload),
    []
  );
}
