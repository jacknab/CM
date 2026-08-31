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
