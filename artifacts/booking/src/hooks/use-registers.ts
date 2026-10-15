import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSelectedStore } from "@/hooks/use-store";
import { getDeviceId } from "@/lib/device-id";
import { getStationDeviceId } from "@/lib/stationDevice";
import type { Register } from "@shared/schema";

const LOCAL_REGISTER_KEY = "certxa_register_id";
// Must match REGISTER_CLAIM_STALE_MS in the api-server route — how long a
// claim survives with no heartbeat before another device can take it over.
const CLAIM_HEARTBEAT_MS = 5 * 60_000;

/** Which register (checkout station) this browser/terminal has been told it is. 0 = unset/default. */
export function getLocalRegisterId(): number {
  try {
    return Number(localStorage.getItem(LOCAL_REGISTER_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setLocalRegisterId(id: number): void {
  try {
    localStorage.setItem(LOCAL_REGISTER_KEY, String(id));
  } catch {}
}

export function clearLocalRegisterId(): void {
  try {
    localStorage.removeItem(LOCAL_REGISTER_KEY);
  } catch {}
}

/** Has this browser ever been told which register it is (picker answered)? */
function hasLocalRegisterChoice(): boolean {
  try {
    return localStorage.getItem(LOCAL_REGISTER_KEY) !== null;
  } catch {
    return false;
  }
}

export interface RegisterOption { id: number; name: string; }
export interface RegisterClaimInfo { registerId: number; deviceId: string; claimedAt: string; }

export function useRegisters(storeId: number | undefined) {
  return useQuery<Register[]>({
    queryKey: [`/api/registers?storeId=${storeId}`],
    enabled: !!storeId,
    queryFn: async () => {
      const res = await fetch("/api/registers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load registers");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

// Which device currently "owns" each station. Only polled while a store is
// actually in multi-station mode (2+ possible stations) — see `enabled`.
// Exported so the Settings → POS Stations page can show live claim status
// per station (Registers.tsx), separately from the /calendar picker's use.
export function useRegisterClaims(storeId: number | undefined, enabled = true) {
  return useQuery<RegisterClaimInfo[]>({
    queryKey: [`/api/registers/claims?storeId=${storeId}`],
    enabled: enabled && !!storeId,
    queryFn: async () => {
      const res = await fetch("/api/registers/claims", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load register claims");
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: enabled ? 10_000 : false,
  });
}

// Owner/staff-facing force-release for a stuck station — frees it
// immediately regardless of which device holds the claim, instead of
// waiting up to 15 minutes for staleness. Used by Registers.tsx.
export function useReleaseRegisterClaim() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async (registerId: number) => {
      await apiRequest("POST", `/api/registers/${registerId}/release`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/registers/claims?storeId=${selectedStore?.id}`] });
    },
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  // Name is auto-assigned server-side ("POS #2", "POS #3", …) — not a param
  // here, so the owner can't set/override it (see the POST /api/registers route).
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/registers", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/registers?storeId=${selectedStore?.id}`] });
    },
  });
}

export function useUpdateRegister() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number; name?: string; isActive?: boolean; sortOrder?: number }) => {
      const res = await apiRequest("PUT", `/api/registers/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/registers?storeId=${selectedStore?.id}`] });
    },
  });
}

export function useDeleteRegister() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/registers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/registers?storeId=${selectedStore?.id}`] });
    },
  });
}

/**
 * Which checkout station (register) this POS tablet is.
 *
 * A tablet no longer picks its station: the server gives it a free one the first time and it keeps it
 * (POST /api/registers/my-station, routes/stationPairing.ts — also the heartbeat that keeps it held).
 * Staff used to pick from a list they could reset or "take over", and wrong picks sent checkouts to
 * the wrong customer screen. The customer screen is paired to this tablet with a code instead
 * (components/pos/PairCustomerScreen.tsx). A salon with one station gets registerId 0, as before.
 *
 * The return shape is the old one so the screens using it keep working: there is never a picker, and
 * select/reset do nothing.
 */
export function useActiveRegisterId(storeId: number | undefined) {
  const { data: registerList } = useRegisters(storeId);
  const activeRegisters = (registerList ?? []).filter((r) => r.isActive);
  const isMultiStation = activeRegisters.length > 0;
  const deviceId = getStationDeviceId();

  const { data: station } = useQuery<{ registerId: number | null; name: string | null; multiStation: boolean; allTaken?: boolean }>({
    queryKey: ["/api/registers/my-station", storeId, deviceId, activeRegisters.map((r) => r.id).join(",")],
    // Asked for a one-station salon too: the server remembers which tablet that station is on, so
    // it stays POS #1 when a second station is added.
    enabled: !!storeId,
    queryFn: async () => {
      // legacyDeviceId: the old fingerprint id, so a tablet that already held a station keeps it.
      const res = await apiRequest("POST", "/api/registers/my-station", { deviceId, legacyDeviceId: getDeviceId() });
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: CLAIM_HEARTBEAT_MS,
  });

  // Nothing resolved yet, or every station is taken: 0, which no paired screen listens on once a
  // salon has real stations, so this tablet's checkouts never reach another station's screen.
  const registerId = isMultiStation ? (station?.registerId ?? 0) : 0;

  // Other code still reads the station from local storage (getLocalRegisterId) — keep it current.
  useEffect(() => {
    if (isMultiStation && station?.registerId != null) setLocalRegisterId(station.registerId);
  }, [isMultiStation, station?.registerId]);

  const selectRegister = useCallback(async (_id?: number, _opts?: { takeover?: boolean }): Promise<{ ok: boolean; error?: string }> => (
    { ok: false, error: "Stations are assigned automatically." }
  ), []);
  const resetRegister = useCallback(async () => {}, []);

  return {
    registerId,
    needsPicker: false,
    registers: [] as RegisterOption[],
    takenRegisters: [] as RegisterOption[],
    selectRegister,
    isMultiStation,
    // e.g. "POS #2" — shown on the station button, which now opens "Pair a customer screen".
    currentRegisterName: isMultiStation && station?.multiStation ? (station?.name ?? null) : null,
    resetRegister,
    /** Every station belongs to another tablet: this one is not linked to a customer screen. */
    stationsFull: isMultiStation && station?.allTaken === true,
    /**
     * This tablet is POS #1 (the salon's only station, or its default one) — the one that runs the salon's
     * local hub; other stations connect to it. Null until the server has said (offline, the caller uses what
     * it saved last time).
     */
    isMainStation: registerList === undefined ? null
      : !isMultiStation ? true
      : station?.registerId == null ? null
      : activeRegisters.find((r) => r.id === station.registerId)?.isDefault === true,
  };
}
