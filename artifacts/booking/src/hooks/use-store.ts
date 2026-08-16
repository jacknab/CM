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
