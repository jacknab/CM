import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { Store } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { offlineSessionBootstrap } from "@/lib/offline-session-bootstrap";

export function useStores() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [api.stores.list.path],
    queryFn: async () => {
      try {
        const res = await fetch(api.stores.list.path, { credentials: "include" });
        if (res.status === 401 || res.status === 403) return [] as Store[];
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);

        const stores = await res.json() as Store[];
        offlineSessionBootstrap.setStores(stores);
        return stores;
      } catch (error) {
        const cachedStores = offlineSessionBootstrap.getStores();
        if (cachedStores.length > 0) return cachedStores;
        throw error;
      }
    },
    initialData: () => offlineSessionBootstrap.getStores(),
    // Without this, TanStack Query treats initialData as fetched "now" and
    // won't refetch until staleTime elapses AND a refetch trigger fires
    // (focus/reconnect/remount) — so a brand-new session, where the offline
    // cache is still an empty array, would silently show that empty array
    // as ground truth for a full minute with no loading indicator and no
    // real fetch ever happening. Marking it as already-stale (epoch 0)
    // makes the real fetch fire immediately on mount instead, while still
    // painting the cached value first for a fast initial render.
    initialDataUpdatedAt: 0,
    enabled: !!user,
    // A tab left open for hours (e.g. the calendar page) otherwise never
    // re-fetches this — nothing naturally triggers it (no interval, no focus
    // change if the tab is never blurred). That leaves `selectedStore` frozen
    // at whatever it was on initial mount for the whole session, which has
    // caused stale-data bugs elsewhere. Periodic + focus refetch keeps it live.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

interface StoreContextType {
  selectedStore: Store | null;
  setSelectedStoreId: (id: number) => void;
  stores: Store[];
  isLoading: boolean;
}

export const StoreContext = createContext<StoreContextType>({
  selectedStore: null,
  setSelectedStoreId: () => {},
  stores: [],
  isLoading: true,
});

export function useSelectedStore() {
  return useContext(StoreContext);
}
