import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSelectedStore } from "@/hooks/use-store";
import { getDeviceId } from "@/lib/device-id";
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
 * Resolves which register this /calendar browser is acting as. The pre-
 * existing implicit/default station (registerId 0) is conceptually "POS #1"
 * — so as soon as a store has even ONE real register configured, there are
 * 2 possible stations and multi-station mode is active (a store with 0
 * registers configured never shows a picker, since there's only ever been
 * one station).
 *
 * Stations already claimed by a DIFFERENT device (another terminal that has
 * picked it and is actively heartbeating) are excluded from `registers` —
 * without this, two terminals could both pick "POS #1" and silently
 * recreate the checkout cross-talk bug this feature exists to prevent. A
 * claim goes stale after ~15 minutes with no heartbeat (see the api-server
 * route) and becomes available again — no manual "release" needed.
 */
export function useActiveRegisterId(storeId: number | undefined) {
  const queryClient = useQueryClient();
  const { data: registerList } = useRegisters(storeId);
  // Mirrors localStorage in component state so picking a register (which
  // writes to localStorage, an untracked side channel) actually triggers a
  // re-render — reading getLocalRegisterId() alone wouldn't.
  const [localId, setLocalId] = useState(getLocalRegisterId);
  const [hasChoice, setHasChoice] = useState(hasLocalRegisterChoice);

  const activeRegisters = (registerList ?? []).filter((r) => r.isActive);
  const isMultiStation = activeRegisters.length > 0;
  // Once a store has graduated to a real "POS #1" row (isDefault=true,
  // created the first time it added a second station — see the create
  // route), every station is a real row and the old synthetic id:0 entry is
  // retired. Stores that haven't yet added anything beyond the original
  // station still get the synthetic entry, matching pre-existing behavior.
  const hasRealDefault = activeRegisters.some((r) => r.isDefault);
  const allOptions: RegisterOption[] = isMultiStation
    ? (hasRealDefault
        ? activeRegisters.map((r) => ({ id: r.id, name: r.name }))
        : [{ id: 0, name: "POS #1" }, ...activeRegisters.map((r) => ({ id: r.id, name: r.name }))])
    : [];

  const { data: claims } = useRegisterClaims(storeId, isMultiStation);
  const deviceId = getDeviceId();
  const claimedByOther = new Set(
    (claims ?? []).filter((c) => c.deviceId !== deviceId).map((c) => c.registerId),
  );
  // What the picker should actually offer — this browser's own already-valid
  // pick stays visible even if (edge case) it also shows as self-claimed.
  const availableOptions = allOptions.filter((o) => !claimedByOther.has(o.id));

  // id:0 is only ever a valid pick in legacy/synthetic mode (no real default
  // row yet) — once a real default row exists, a stale "0" from before that
  // transition is no longer valid and forces a fresh pick using its real id.
  const localIsValid = hasChoice && (activeRegisters.some((r) => r.id === localId) || (localId === 0 && !hasRealDefault));
  const needsPicker = allOptions.length >= 2 && !localIsValid;
  // Fall back to the real default register's id (not the legacy 0) once one
  // exists — /api/public/kiosk/:slug/config resolves the bare /frontdesk/:slug
  // URL to that same real id, so this side must match it or the two ends of
  // the same physical station land in different WS buckets and every
  // calendar<->frontdesk event (check-in prompts, checkout events, etc.)
  // silently stops reaching its pair.
  const defaultRegister = activeRegisters.find((r) => r.isDefault);
  const registerId = localIsValid ? localId : (defaultRegister ? defaultRegister.id : 0);

  // Keep this device's claim alive while it holds a valid pick in multi-
  // station mode — /calendar is normally left open for hours, so this just
  // heartbeats quietly in the background the whole time.
  useEffect(() => {
    if (!isMultiStation || !localIsValid || !storeId) return;
    const beat = () => {
      apiRequest("POST", "/api/registers/claim", { registerId: localId, deviceId }).catch(() => {});
    };
    beat();
    const iv = setInterval(beat, CLAIM_HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [isMultiStation, localIsValid, localId, storeId, deviceId]);

  const selectRegister = useCallback(async (id: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await apiRequest("POST", "/api/registers/claim", { registerId: id, deviceId });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        queryClient.invalidateQueries({ queryKey: [`/api/registers/claims?storeId=${storeId}`] });
        return { ok: false, error: body.message || "This station is already in use on another device." };
      }
      setLocalRegisterId(id);
      setLocalId(id);
      setHasChoice(true);
      return { ok: true };
    } catch {
      return { ok: false, error: "Couldn't reach the server — check your connection and try again." };
    }
  }, [deviceId, queryClient, storeId]);

  // Forgets which station this device is paired to and immediately releases
  // its server-side claim (rather than leaving it to expire after 15 min),
  // so the picker re-appears and the freed station is instantly available to
  // whichever device claims it next. For "tablet got physically moved to a
  // different station" — the actual scenario this exists for — tap this
  // BEFORE moving it; if the tablet already ended up moved with a stale
  // pairing, this still fixes it, it just leaves the old slot occupied until
  // the existing 15-minute staleness window passes on its own.
  const resetRegister = useCallback(async () => {
    clearLocalRegisterId();
    setLocalId(0);
    setHasChoice(false);
    try {
      await apiRequest("POST", "/api/registers/unclaim", { deviceId });
    } catch {
      // Best-effort — the local reset above is what actually re-triggers the
      // picker; a failed unclaim just means the old slot frees up on its own
      // after 15 minutes instead of immediately.
    }
    queryClient.invalidateQueries({ queryKey: [`/api/registers/claims?storeId=${storeId}`] });
  }, [deviceId, queryClient, storeId]);

  return {
    registerId,
    needsPicker,
    // Only stations nobody else currently holds — this is what the picker renders.
    registers: availableOptions,
    // True once every station is claimed by someone else — the picker has
    // nothing left to offer.
    allStationsTaken: needsPicker && availableOptions.length === 0,
    selectRegister,
    isMultiStation,
    // Display name for whichever station this device currently is, e.g. "POS #2" — null outside multi-station mode.
    currentRegisterName: isMultiStation ? (allOptions.find((o) => o.id === registerId)?.name ?? null) : null,
    resetRegister,
  };
}
