import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSelectedStore } from "@/hooks/use-store";
import type { CashDrawer } from "@shared/schema";

const LOCAL_DRAWER_KEY = "certxa_drawer_id";

/** Which cash drawer this browser/terminal has been told it is. 0 = unset/default. */
export function getLocalDrawerId(): number {
  try {
    return Number(localStorage.getItem(LOCAL_DRAWER_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setLocalDrawerId(id: number): void {
  try {
    localStorage.setItem(LOCAL_DRAWER_KEY, String(id));
  } catch {}
}

/** Has this browser ever been told which drawer it is (picker answered)? */
function hasLocalDrawerChoice(): boolean {
  try {
    return localStorage.getItem(LOCAL_DRAWER_KEY) !== null;
  } catch {
    return false;
  }
}

export interface CashDrawerOption { id: number; name: string; }

export function useCashDrawers(storeId: number | undefined) {
  return useQuery<CashDrawer[]>({
    queryKey: [`/api/cash-drawers?storeId=${storeId}`],
    enabled: !!storeId,
    queryFn: async () => {
      const res = await fetch("/api/cash-drawers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cash drawers");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateCashDrawer() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async (data: { name: string; registerId?: number | null; targetFloat?: string | null }) => {
      const res = await apiRequest("POST", "/api/cash-drawers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${selectedStore?.id}`] });
    },
  });
}

export function useUpdateCashDrawer() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number; name?: string; registerId?: number | null; targetFloat?: string | null; isActive?: boolean; sortOrder?: number }) => {
      const res = await apiRequest("PUT", `/api/cash-drawers/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${selectedStore?.id}`] });
    },
  });
}

export function useDeleteCashDrawer() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cash-drawers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${selectedStore?.id}`] });
    },
  });
}

/**
 * Resolves which cash drawer this /calendar browser is acting as. The pre-
 * existing implicit/default drawer (drawerId 0) is a real, selectable
 * option — so as soon as a store has even ONE explicit drawer configured,
 * there are 2 possible drawers and `needsPicker` fires (a store with 0
 * drawers configured never shows a picker, since there's only ever been one).
 */
export function useActiveDrawerId(storeId: number | undefined) {
  const { data: drawerList } = useCashDrawers(storeId);
  const [localId, setLocalId] = useState(getLocalDrawerId);
  const [hasChoice, setHasChoice] = useState(hasLocalDrawerChoice);

  const activeDrawers = (drawerList ?? []).filter((d) => d.isActive);
  const options: CashDrawerOption[] = activeDrawers.length > 0
    ? [{ id: 0, name: "Default Drawer" }, ...activeDrawers.map((d) => ({ id: d.id, name: d.name }))]
    : [];

  const localIsValid = hasChoice && (localId === 0 || activeDrawers.some((d) => d.id === localId));
  const needsPicker = options.length >= 2 && !localIsValid;
  const drawerId = localIsValid ? localId : 0;

  const selectDrawer = useCallback((id: number) => {
    setLocalDrawerId(id);
    setLocalId(id);
    setHasChoice(true);
  }, []);

  return { drawerId, needsPicker, drawers: options, selectDrawer };
}
