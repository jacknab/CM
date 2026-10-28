import { useCallback, useEffect, useRef } from "react";
import { useActiveRegisterId } from "@/hooks/use-registers";
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
    mutationFn: async (data: { name: string; registerId?: number | null; mainStation?: boolean; targetFloat: string }) => {
      const res = await apiRequest("POST", "/api/cash-drawers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${selectedStore?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] });
    },
  });
}

export function useUpdateCashDrawer() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number; name?: string; registerId?: number | null; mainStation?: boolean; targetFloat?: string | null; isActive?: boolean; sortOrder?: number }) => {
      const res = await apiRequest("PUT", `/api/cash-drawers/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${selectedStore?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] });
    },
  });
}

/**
 * This POS station's cash drawer (owner, 2026-10-29). Each drawer is assigned to one station in Settings › Cash
 * Drawers, and a station without one can't take cash (`cashAllowed` false; the server refuses it too).
 *
 * The drawer's starting cash is set once on the drawer, so there is no morning count: the drawer is opened for the
 * day with that amount by itself, and counted at Day Close.
 *
 * `drawerId` is the station's drawer, or 0 when it has none. `needsPicker`, `drawers` and `selectDrawer` remain for
 * the screens that used to ask "which drawer is this?" — a station's drawer is never picked on the tablet now.
 */
export function useActiveDrawerId(storeId: number | undefined) {
  const queryClient = useQueryClient();
  const { registerId } = useActiveRegisterId(storeId);
  const { data: station, isSuccess } = useQuery<{ drawer: CashDrawer | null }>({
    queryKey: ["/api/cash-drawers/station", storeId, registerId],
    enabled: !!storeId,
    queryFn: async () => {
      const res = await fetch(`/api/cash-drawers/station?registerId=${registerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to find this station's cash drawer");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const drawer = station?.drawer ?? null;
  const drawerId = drawer?.id ?? 0;
  // Only a definite "no drawer" from the server blocks cash. Not known yet, or no connection (offline sales are cash):
  // allowed — the server checks again when the sale reaches it.
  const cashAllowed = !(isSuccess && !drawer);

  const openKey = [`/api/cash-drawer/open?storeId=${storeId}&drawerId=${drawerId}`];
  const { data: openSession } = useQuery({ queryKey: openKey, enabled: !!storeId && drawerId > 0, staleTime: 60_000 });
  const opening = useRef(false);
  useEffect(() => {
    if (!drawerId || openSession !== null || opening.current) return;
    opening.current = true;
    void apiRequest("POST", `/api/cash-drawers/${drawerId}/open-session`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: openKey }))
      .catch(() => { /* tried again when the session is next looked at */ })
      .finally(() => { opening.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerId, openSession]);

  const selectDrawer = useCallback((_id: number) => {}, []);
  return { drawerId, drawer, cashAllowed, registerId, needsPicker: false, drawers: [] as CashDrawerOption[], selectDrawer };
}
