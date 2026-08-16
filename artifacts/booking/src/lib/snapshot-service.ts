import { snapshotDB, type BusinessSnapshot } from "./snapshot-db";
import { CURRENT_VERSIONS } from "./storage-version";
import { clientPhoneCacheDB } from "./client-phone-cache-db";

export type SnapshotLoadStatus = "idle" | "loading" | "cached" | "fresh" | "offline";

type StatusListener = (status: SnapshotLoadStatus) => void;
type DataListener = (snapshot: BusinessSnapshot | null) => void;

class SnapshotService {
  private currentSnapshot: BusinessSnapshot | null = null;
  private status: SnapshotLoadStatus = "idle";
  private statusListeners: Set<StatusListener> = new Set();
  private dataListeners: Set<DataListener> = new Set();

  getSnapshot(): BusinessSnapshot | null {
    return this.currentSnapshot;
  }

  getStatus(): SnapshotLoadStatus {
    return this.status;
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onDataChange(fn: DataListener): () => void {
    this.dataListeners.add(fn);
    return () => this.dataListeners.delete(fn);
  }

  private setStatus(s: SnapshotLoadStatus) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  private setSnapshot(snap: BusinessSnapshot | null) {
    this.currentSnapshot = snap;
    this.dataListeners.forEach((fn) => fn(snap));
  }

  private isSnapshotSchemaMismatch(snap: BusinessSnapshot): boolean {
    const snapSchemaVersion = (snap as any).schemaVersion;
    return snapSchemaVersion != null && snapSchemaVersion !== CURRENT_VERSIONS.SNAPSHOT;
  }

  async initialize(storeId: number): Promise<void> {
    this.setStatus("loading");

    const cached = await snapshotDB.load(storeId).catch(() => null);
    const cacheValid = cached && !this.isSnapshotSchemaMismatch(cached);

    if (!navigator.onLine) {
      if (cacheValid) {
        await clientPhoneCacheDB.putMany(storeId, cached.customers ?? []).catch(() => {});
        this.setSnapshot(cached);
        this.setStatus("offline");
      } else {
        this.setStatus("offline");
      }
      return;
    }

    if (cacheValid) {
      await clientPhoneCacheDB.putMany(storeId, cached.customers ?? []).catch(() => {});
      this.setSnapshot(cached);
      this.setStatus("cached");
    }

    try {
      const res = await fetch(
        `/api/offline/snapshot?storeId=${storeId}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        if (cacheValid) this.setStatus("cached");
        else this.setStatus("offline");
        return;
      }

      const fresh: BusinessSnapshot & { schemaVersion?: number } = await res.json();
      fresh.schemaVersion = CURRENT_VERSIONS.SNAPSHOT;

      if (!cacheValid || cached!.version !== fresh.version) {
        await snapshotDB.save(fresh).catch(() => {});
        await clientPhoneCacheDB.putMany(storeId, fresh.customers ?? []).catch(() => {});
        this.setSnapshot(fresh);
      }

      this.setStatus("fresh");
    } catch {
      if (cacheValid) {
        await clientPhoneCacheDB.putMany(storeId, cached.customers ?? []).catch(() => {});
        this.setSnapshot(cached);
        this.setStatus("cached");
      } else {
        this.setStatus("offline");
      }
    }
  }

  async refresh(storeId: number): Promise<void> {
    if (!navigator.onLine) return;
    await this.initialize(storeId);
  }

  clearCache(storeId: number): void {
    snapshotDB.save({ version: "", generatedAt: "", storeId, categories: [], services: [], addons: [], staff: [], customers: [] }).catch(() => {});
    this.setSnapshot(null);
    this.setStatus("idle");
  }
}

export const snapshotService = new SnapshotService();
