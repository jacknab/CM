import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { Store } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export function useStores() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [api.stores.list.path],
    queryFn: async () => {
      const res = await fetch(api.stores.list.path, { credentials: "include" });
      if (!res.ok) return [] as Store[];
      return res.json() as Promise<Store[]>;
    },
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
