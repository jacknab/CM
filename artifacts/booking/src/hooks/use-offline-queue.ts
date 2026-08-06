import { useState, useEffect, useCallback, useRef } from "react";
import { offlineDB, type QueueRecord } from "@/lib/offline-db";
import { syncEngine } from "@/lib/sync-engine";

function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateIdempotencyKey(): string {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useOfflineQueue(storeId: number | undefined) {
  const [entries, setEntries] = useState<QueueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  const reload = useCallback(async () => {
    if (!storeIdRef.current) return;
    try {
      const records = await offlineDB.getTodayQueue(storeIdRef.current);
      records.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setEntries(records);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setIsLoading(true);

    const isOnline = navigator.onLine;

    if (isOnline) {
      fetch("/api/waitlist?scope=today", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(async (data: Array<{ id: number; customerName: string; customerPhone?: string; status: string; notes?: string; partySize?: number; createdAt: string }>) => {
          const today = new Date().toDateString();
          const todayEntries = data.filter(
            (e) => new Date(e.createdAt).toDateString() === today
          );
          await offlineDB.mergeServerQueue(todayEntries, storeId);
          await reload();
        })
        .catch(() => reload())
        .finally(() => setIsLoading(false));
    } else {
      reload().finally(() => setIsLoading(false));
    }
  }, [storeId, reload]);

  useEffect(() => {
    return syncEngine.onQueueChange(() => reload());
  }, [reload]);

  useEffect(() => {
    if (!storeId) return;
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        await syncEngine.fetchAndMergeServerState(storeId);
        await reload();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [storeId, reload]);

  const addWalkIn = useCallback(
    async (data: { customerName: string; customerPhone?: string; notes?: string; partySize?: number }) => {
      if (!storeIdRef.current) return;
      const tempId = generateTempId();
      const now = new Date().toISOString();

      const record: QueueRecord = {
        id: tempId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        status: "waiting",
        type: "walkin",
        storeId: storeIdRef.current,
        notes: data.notes,
        partySize: data.partySize ?? 1,
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      await offlineDB.putQueue(record);
      await reload();

      await offlineDB.addPendingOp({
        type: "create_queue",
        payload: {
          tempId,
          customerName: data.customerName,
          customerPhone: data.customerPhone ?? null,
          notes: data.notes ?? null,
          partySize: data.partySize ?? 1,
          storeId: storeIdRef.current,
          status: "waiting",
        },
        idempotencyKey: generateIdempotencyKey(),
      });

      if (navigator.onLine) {
        syncEngine.runSync(storeIdRef.current);
      }

      return tempId;
    },
    [reload]
  );

  const removeEntry = useCallback(
    async (record: QueueRecord) => {
      const tempStatus = "cancelled" as const;
      await offlineDB.updateQueueRecord(record.id, { status: tempStatus });
      await reload();

      if (record.serverId) {
        await offlineDB.addPendingOp({
          type: "delete_queue",
          payload: { serverId: record.serverId },
          idempotencyKey: generateIdempotencyKey(),
        });
        if (navigator.onLine) {
          syncEngine.runSync(storeIdRef.current);
        }
      } else {
        await offlineDB.deleteQueue(record.id);
        await reload();
      }
    },
    [reload]
  );

  const advanceQueue = useCallback(async () => {
    const serving = entries.filter((e) =>
      ["called", "serving"].includes(e.status)
    );
    const waiting = entries.filter((e) => e.status === "waiting");

    for (const s of serving) {
      await offlineDB.updateQueueRecord(s.id, { status: "completed" });
    }
    if (waiting.length > 0) {
      await offlineDB.updateQueueRecord(waiting[0].id, { status: "serving" });
    }
    await reload();

    await offlineDB.addPendingOp({
      type: "queue_next",
      payload: { storeId: storeIdRef.current },
      idempotencyKey: generateIdempotencyKey(),
    });

    if (navigator.onLine) {
      syncEngine.runSync(storeIdRef.current);
    }
  }, [entries, reload]);

  const today = entries.filter((e) => e.status !== "cancelled");
  const serving = today.filter((e) => ["called", "serving"].includes(e.status));
  const waiting = today.filter((e) => e.status === "waiting");
  const served = today.filter((e) => e.status === "completed");

  return {
    entries: today,
    serving,
    waiting,
    served,
    isLoading,
    reload,
    addWalkIn,
    removeEntry,
    advanceQueue,
  };
}
