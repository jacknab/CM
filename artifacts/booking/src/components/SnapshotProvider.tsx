import { useEffect, useRef } from "react";
import { SnapshotContext, useSnapshotState } from "@/hooks/use-snapshot";
import { snapshotService } from "@/lib/snapshot-service";
import { syncEngine } from "@/lib/sync-engine";
import { reconciliationManager } from "@/lib/reconciliation";
import { runHealthCheck } from "@/lib/storage-health";
import { offlineDB } from "@/lib/offline-db";
import { checkAndRunMigrations } from "@/lib/storage-version";
import { useSelectedStore } from "@/hooks/use-store";
import { enterpriseSyncEngine } from "@/lib/enterprise-sync-engine";
import { appointmentsCacheDB } from "@/lib/appointments-cache-db";
import { api } from "@shared/routes";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function prewarmAppointmentsCache(storeId: number): Promise<void> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  try {
    const params = new URLSearchParams({ storeId: String(storeId), from: yesterday, to: tomorrow });
    const res = await fetch(`${api.appointments.list.path}?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        await appointmentsCacheDB.cacheAppointments(storeId, yesterday, tomorrow, data);
      }
    }
  } catch {}

  await appointmentsCacheDB.cleanupSyncedLocalBookings().catch(() => {});
}

async function runFullSnapshot(storeId: number): Promise<void> {
  await Promise.all([
    snapshotService.initialize(storeId),
    prewarmAppointmentsCache(storeId),
  ]);
}

export function SnapshotProvider({ children }: { children: React.ReactNode }) {
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  const storeId = selectedStore?.id;
  const initialized = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const state = useSnapshotState();

  useEffect(() => {
    // Staff users don't own stores — the snapshot API only serves store owners.
    // Skip snapshot initialization entirely for staff to avoid 404 noise.
    if (!storeId || initialized.current === storeId || isStaff) return;
    initialized.current = storeId;

    syncEngine.setStoreId(storeId);

    const boot = async () => {
      try {
        const { queueResetRequired } = await checkAndRunMigrations();
        if (queueResetRequired) {
          await offlineDB.clearPendingOps().catch(() => {});
        }

        const health = await runHealthCheck(storeId);
        if (health.status === "stateless") {
          await snapshotService.initialize(storeId);
          enterpriseSyncEngine.initialize(storeId).catch(console.error);
          prewarmAppointmentsCache(storeId).catch(() => {});
          return;
        }
        if (health.snapshotCorrupted) {
          await snapshotService.clearCache(storeId);
        }
      } catch {}

      await snapshotService.initialize(storeId);
      enterpriseSyncEngine.initialize(storeId).catch(console.error);
      prewarmAppointmentsCache(storeId).catch(() => {});
    };

    boot();
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;

    const handleReconnect = async () => {
      await reconciliationManager.begin([
        () => syncEngine.runSync(storeId),
        () => snapshotService.refresh(storeId),
        () => enterpriseSyncEngine.runBulkSync(storeId),
        () => prewarmAppointmentsCache(storeId),
      ]);
    };

    const unregister = syncEngine.registerOnlineHandler(handleReconnect);
    return () => unregister();
  }, [storeId]);

  // ── Hourly auto-refresh: keep the 30-day booking cache current ─────────────
  useEffect(() => {
    if (!storeId) return;
    const HOUR_MS = 60 * 60 * 1000;

    const maybeRefresh = async () => {
      if (!navigator.onLine) return;
      const snap = snapshotService.getSnapshot();
      if (!snap?.generatedAt) {
        await runFullSnapshot(storeId).catch(() => {});
        return;
      }
      const ageMs = Date.now() - new Date(snap.generatedAt).getTime();
      if (ageMs >= HOUR_MS) {
        await runFullSnapshot(storeId).catch(() => {});
      }
    };

    const timer = setInterval(maybeRefresh, HOUR_MS);
    return () => clearInterval(timer);
  }, [storeId]);

  // ── Keyboard shortcut: Ctrl+Shift+S / Cmd+Shift+S ─────────────────────────
  useEffect(() => {
    if (!storeId) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const trigger = isMac
        ? e.metaKey && e.shiftKey && e.key.toLowerCase() === "s"
        : e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s";

      if (!trigger) return;

      e.preventDefault();
      e.stopPropagation();

      if (syncingRef.current) return;

      if (!navigator.onLine) {
        toast({
          title: "You're offline",
          description: "Connect to the internet first, then sync your offline data.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }

      syncingRef.current = true;

      const { dismiss, update } = toast({
        title: "Syncing offline data…",
        description: "Downloading snapshot: services, staff, clients, and today's bookings.",
        duration: 60000,
      });

      try {
        await runFullSnapshot(storeId);

        const snap = snapshotService.getSnapshot();
        const services = snap?.services?.length ?? 0;
        const staff = snap?.staff?.length ?? 0;
        const clients = snap?.customers?.length ?? 0;

        update({
          id: "",
          title: "Offline data ready ✓",
          description: `${services} service${services !== 1 ? "s" : ""} · ${staff} staff · ${clients} client${clients !== 1 ? "s" : ""} cached for offline use.`,
          duration: 5000,
        });
      } catch {
        update({
          id: "",
          title: "Snapshot failed",
          description: "Could not sync offline data — check your connection and try again.",
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        syncingRef.current = false;
        setTimeout(dismiss, 5500);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [storeId]);

  useEffect(() => {
    return () => { enterpriseSyncEngine.destroy(); };
  }, []);

  return (
    <SnapshotContext.Provider value={state}>
      {children}
    </SnapshotContext.Provider>
  );
}
