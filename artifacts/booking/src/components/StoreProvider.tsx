import { useState, useEffect, type ReactNode } from "react";
import { StoreContext, useStores } from "@/hooks/use-store";
import type { Store } from "@shared/schema";

const STORE_KEY = "certxa_selected_store_id";

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data: stores, isLoading } = useStores();
  const [selectedStoreId, setSelectedStoreIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    if (stores && stores.length > 0 && selectedStoreId === null) {
      setSelectedStoreIdState(stores[0].id);
      localStorage.setItem(STORE_KEY, String(stores[0].id));
    }
  }, [stores, selectedStoreId]);

  const setSelectedStoreId = (id: number) => {
    setSelectedStoreIdState(id);
    localStorage.setItem(STORE_KEY, String(id));
  };

  const selectedStore: Store | null =
    stores?.find((s) => s.id === selectedStoreId) ?? stores?.[0] ?? null;

  return (
    <StoreContext.Provider
      value={{ selectedStore, setSelectedStoreId, stores: stores ?? [], isLoading }}
    >
      {children}
    </StoreContext.Provider>
  );
}
