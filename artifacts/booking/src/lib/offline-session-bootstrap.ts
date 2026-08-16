import type { User } from "@shared/models/auth";
import type { Store } from "@shared/schema";

const USER_KEY = "certxa_offline_user";
const STORES_KEY = "certxa_offline_stores";

type CachedValue<T> = {
  savedAt: string;
  value: T;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCached<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<T>;
    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

function writeCached<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  try {
    const cached: CachedValue<T> = {
      savedAt: new Date().toISOString(),
      value,
    };
    window.localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage can be unavailable in private mode or under quota pressure.
  }
}

export const offlineSessionBootstrap = {
  getUser(): User | null {
    return readCached<User>(USER_KEY);
  },

  setUser(user: User | null): void {
    if (!user) return;
    writeCached(USER_KEY, user);
  },

  getStores(): Store[] {
    const stores = readCached<Store[]>(STORES_KEY);
    return Array.isArray(stores) ? stores : [];
  },

  setStores(stores: Store[]): void {
    if (!Array.isArray(stores) || stores.length === 0) return;
    writeCached(STORES_KEY, stores);
  },

  clear(): void {
    if (!canUseStorage()) return;
    try {
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(STORES_KEY);
    } catch {}
  },
};
