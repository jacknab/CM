import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertAppointment } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";
import { storeLocalToUtc } from "@/lib/timezone";
import { appointmentsCacheDB, type LocalBooking } from "@/lib/appointments-cache-db";
import { actionQueueDB } from "@/lib/action-queue-db";
import { useSnapshot } from "@/hooks/use-snapshot";
import { useToast } from "@/hooks/use-toast";

// Module-level lock: serialises concurrent offline saveLocally() calls so the
// read → conflict-check → write sequence is effectively atomic.  Without this,
// two rapid taps both pass the duplicate guard before either write reaches
// IndexedDB and end up creating identical local appointments.
let _offlineSaveLock: Promise<void> = Promise.resolve();

type AppointmentFilters = {
  from?: string;
  to?: string;
  staffId?: number;
};

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function localBookingToAppointment(b: LocalBooking): any {
  return {
    id: b._id,
    _isLocal: true,
    _tempId: b._tempId,
    storeId: b.storeId,
    date: b.date,
    duration: b.duration,
    serviceId: b.serviceId,
    staffId: b.staffId,
    customerId: b.customerId,
    customerName: b.customerName ?? "Walk-in",
    serviceName: b.serviceName ?? "",
    price: b.servicePrice ?? 0,
    service: b.serviceName ? { name: b.serviceName, price: b.servicePrice ?? 0 } : null,
    appointmentAddons: (b.addons ?? []).map((addon) => ({
      addon: { ...addon, price: addon.price ?? 0 },
    })),
    staffName: b.staffName ?? "",
    staffColor: b.staffColor ?? null,
    notes: b.notes ?? "",
    status: b.status ?? "pending",
    type: b.type ?? "booking",
    createdAt: b.createdAt,
    staff: b.staffName ? { name: b.staffName, color: b.staffColor ?? null } : null,
    customer: b.customerName ? { name: b.customerName } : null,
  };
}

export function useAppointments(filters?: AppointmentFilters) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  const fromDate = filters?.from ?? todayDateStr();
  const toDate = filters?.to ?? todayDateStr();

  const queryKey = [api.appointments.list.path, storeId, filters];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const localBookings = await appointmentsCacheDB
        .getLocalBookingsForRange(storeId!, fromDate, toDate)
        .catch(() => [] as LocalBooking[]);
      const localMapped = localBookings
        .filter((b) => !b._syncedRealId)
        .map(localBookingToAppointment);

      if (!navigator.onLine) {
        const cached = await appointmentsCacheDB
          .getCachedAppointments(storeId!, fromDate, toDate)
          .catch(() => []);
        const serverIds = new Set(cached.map((a: any) => a.id));
        const unseenLocal = localMapped.filter((b) => !serverIds.has(b.id));
        return [...cached, ...unseenLocal];
      }

      const params = new URLSearchParams();
      if (storeId) params.append("storeId", String(storeId));
      if (filters?.from) params.append("from", filters.from);
      if (filters?.to) params.append("to", filters.to);
      if (filters?.staffId) params.append("staffId", String(filters.staffId));
      const url = `${api.appointments.list.path}?${params.toString()}`;

      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("fetch failed");
        const raw = await res.json();
        const data = Array.isArray(raw) ? raw : [];

        await appointmentsCacheDB
          .cacheAppointments(storeId!, fromDate, toDate, data)
          .catch(() => {});

        const serverIds = new Set(data.map((a: any) => a.id));
        const unseenLocal = localMapped.filter((b) => !serverIds.has(b.id));
        return [...data, ...unseenLocal];
      } catch {
        const cached = await appointmentsCacheDB
          .getCachedAppointments(storeId!, fromDate, toDate)
          .catch(() => []);
        const serverIds = new Set(cached.map((a: any) => a.id));
        const unseenLocal = localMapped.filter((b) => !serverIds.has(b.id));
        return [...cached, ...unseenLocal];
      }
    },
    enabled: !!storeId,
    staleTime: 30 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    networkMode: "always",
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const { snapshot } = useSnapshot();

  return useMutation({
    mutationFn: async (
      data: Partial<InsertAppointment> & {
        date: string;
        serviceId: number;
        staffId: number;
        customerId: number | string;
        duration: number;
        _offlineCustomerName?: string;
        _offlineServiceName?: string;
        _offlineStaffName?: string;
        _offlineStaffColor?: string;
        _offlineServicePrice?: number;
        _offlineAddons?: Array<{ id: number; name: string; price: number; duration?: number }>;
      }
    ) => {
      let dateStr: string = String(data.date);
      if (!dateStr.endsWith("Z") && !dateStr.match(/[+-]\d{2}:\d{2}$/)) {
        const timezone = selectedStore?.timezone || "UTC";
        const utcDate = storeLocalToUtc(dateStr, timezone);
        dateStr = utcDate.toISOString();
      }

      const {
        date: _date,
        _offlineCustomerName,
        _offlineServiceName,
        _offlineStaffName,
        _offlineStaffColor,
        _offlineServicePrice,
        _offlineAddons,
        ...rest
      } = data;
      // Prefer the live store; fall back to snapshot storeId so offline bookings
      // are always associated with the correct store even before hydration.
      const storeId = selectedStore?.id ?? snapshot?.storeId ?? null;

      // Shared helper — saves booking locally and queues sync
      const saveLocally = async () => {
        // ── Acquire the module-level lock ────────────────────────────────────
        // Serialises concurrent offline saves so the read → conflict-check →
        // write sequence cannot interleave.  Without this, two rapid taps both
        // read IndexedDB before either write, both pass the duplicate guard,
        // and both persist, creating identical local appointments.
        let unlock!: () => void;
        const prevLock = _offlineSaveLock;
        _offlineSaveLock = new Promise<void>((res) => { unlock = res; });
        await prevLock;

        try {

        const tempId = `local_booking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const dateOnly = dateStr.slice(0, 10);

        // ── Offline duplicate guard ──────────────────────────────────────────
        // The server blocks double-booking, but offline writes bypass the API.
        // Check local + cached appointments before writing to IndexedDB.
        if (data.staffId && storeId) {
          const newStart = new Date(dateStr).getTime();
          const newEnd   = newStart + (data.duration ?? 30) * 60_000;

          const [localBookings, cachedApts] = await Promise.all([
            appointmentsCacheDB.getLocalBookings(storeId).catch(() => [] as any[]),
            appointmentsCacheDB.getCachedForAnyRange(storeId).catch(() => [] as any[]),
          ]);

          const allExisting = [
            ...localBookings.filter((b: any) => !b._syncedRealId),
            ...cachedApts,
          ];

          const conflict = allExisting.some((apt: any) => {
            if (Number(apt.staffId) !== Number(data.staffId)) return false;
            if (apt.status === "cancelled" || apt.status === "no_show") return false;
            const aptStart = new Date(apt.date).getTime();
            const aptEnd   = aptStart + (Number(apt.duration) || 30) * 60_000;
            return newStart < aptEnd && newEnd > aptStart;
          });

          if (conflict) {
            throw Object.assign(
              new Error("This staff member already has an appointment at that time"),
              { status: 409 }
            );
          }
        }
        // ────────────────────────────────────────────────────────────────────

        const serviceName = _offlineServiceName ??
          snapshot?.services.find((s) => s.id === data.serviceId)?.name ?? "";
        const staffMember = snapshot?.staff.find((s) => s.id === data.staffId);
        const staffName = _offlineStaffName ?? staffMember?.name ?? "";
        const staffColor = _offlineStaffColor ?? staffMember?.color ?? null;
        const customerName = _offlineCustomerName ??
          snapshot?.customers.find((c) => c.id === data.customerId)?.name ?? "Client";

        const localBooking: LocalBooking = {
          _id: tempId,
          _isLocal: true,
          _tempId: tempId,
          storeId: storeId!,
          date: dateStr,
          duration: data.duration,
          serviceId: data.serviceId,
          staffId: data.staffId,
          customerId: data.customerId,
          customerName,
          serviceName,
          servicePrice: Number(_offlineServicePrice ?? snapshot?.services.find((s) => s.id === data.serviceId)?.price ?? 0),
          addons: (_offlineAddons ?? []).map((addon) => ({
            id: addon.id,
            name: addon.name,
            price: Number(addon.price ?? 0),
            duration: Number(addon.duration ?? 0),
          })),
          staffName,
          staffColor: staffColor ?? undefined,
          notes: (rest as any).notes ?? "",
          status: (data.status as string) ?? "pending",
          type: (rest as any).type ?? "booking",
          createdAt: new Date().toISOString(),
        };

        await appointmentsCacheDB.addLocalBooking(localBooking).catch(() => {});

        await actionQueueDB.add({
          type: "CREATE_BOOKING",
          entity_temp_id: tempId,
          payload: {
            ...rest,
            storeId,
            date: dateStr,
            addonIds: (_offlineAddons ?? []).map((addon) => addon.id),
            tempId,
          },
          timestamp: Date.now(),
          idempotency_key: `${tempId}_CREATE_BOOKING`,
        });

        return localBookingToAppointment(localBooking);

        } finally {
          unlock();
        }
      };

      // Offline: skip network entirely
      if (!navigator.onLine) {
        return saveLocally();
      }

      // Online: try server.
      // Queue locally only for network/server failures so 4xx validation/auth
      // issues are surfaced instead of creating unsynced local-only bookings.
      try {
        const payload = {
          ...rest,
          storeId,
          date: dateStr,
        };

        const res = await fetch(api.appointments.create.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({} as any));
          const err: any = new Error(errBody?.message || `Create failed (${res.status})`);
          err.status = res.status;
          throw err;
        }
        const result = await res.json();

        await appointmentsCacheDB
          .cacheAppointments(storeId!, dateStr.slice(0, 10), dateStr.slice(0, 10), [])
          .catch(() => {});

        return result;
      } catch (err: any) {
        const status = err?.status;
        const isNetworkError = err?.name === "TypeError";
        if (isNetworkError || (typeof status === "number" && status >= 500)) {
          return saveLocally();
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [api.appointments.list.path],
        refetchType: "active",
      });
    },
    // Without this, TanStack Query's default networkMode:"online" pauses the
    // mutation BEFORE mutationFn ever runs while navigator.onLine is false —
    // meaning the offline saveLocally() branch above is unreachable and the
    // caller sees an eternally-pending mutation (isPending never resolves).
    networkMode: "always",
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number | string } & Partial<InsertAppointment>) => {
      const isNumericId = typeof id === "number" && Number.isFinite(id);
      const isLocalId = typeof id === "string" && id.startsWith("local_booking_");

      // Local-only booking: update IndexedDB record so calendar actions still work
      // while waiting for a server-mapped real ID.
      if (isLocalId) {
        const localUpdates: Partial<LocalBooking> = {};
        if (updates.date) localUpdates.date = String(updates.date);
        if (updates.duration != null) localUpdates.duration = Number(updates.duration);
        if (updates.serviceId !== undefined) localUpdates.serviceId = updates.serviceId as any;
        if (updates.staffId !== undefined) localUpdates.staffId = updates.staffId as any;
        if (updates.customerId !== undefined) localUpdates.customerId = updates.customerId as any;
        if (updates.notes !== undefined) localUpdates.notes = updates.notes as any;
        if (updates.status !== undefined) localUpdates.status = String(updates.status);
        await appointmentsCacheDB.updateLocalBooking(id, localUpdates).catch(() => {});
        return { id, ...updates };
      }

      if (!isNumericId) {
        throw new Error("Invalid appointment id");
      }

      const url = buildUrl(api.appointments.update.path, { id: id as number });
      const payload = { ...updates };
      if (payload.date) {
        const dateVal = String(payload.date);
        if (!dateVal.endsWith("Z") && !dateVal.match(/[+-]\d{2}:\d{2}$/)) {
          const timezone = selectedStore?.timezone || "UTC";
          const utcDate = storeLocalToUtc(dateVal, timezone);
          payload.date = utcDate.toISOString() as any;
        }
      }

      // Shared helper — queues update locally
      const queueLocally = async () => {
        const tempId = `local_update_${id}_${Date.now()}`;
        await actionQueueDB.add({
          type: "UPDATE_BOOKING",
          entity_temp_id: tempId,
          payload: { id, ...payload },
          timestamp: Date.now(),
          idempotency_key: `${tempId}_UPDATE_BOOKING`,
        });
        return { id, ...payload };
      };

      // Offline: skip network entirely
      if (!navigator.onLine) {
        return queueLocally();
      }

      // Online: attempt server update. Only queue when it's a network/server failure.
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({} as any));
          const err: any = new Error(errBody?.message || `Update failed (${res.status})`);
          err.status = res.status;
          throw err;
        }

        return res.json();
      } catch (err: any) {
        // Queue only for network errors or server errors (>=500). Surface 4xx to callers.
        const status = err?.status;
        const isNetworkError = err?.name === "TypeError"; // fetch throws TypeError on network issues
        if (isNetworkError || (typeof status === "number" && status >= 500)) {
          return queueLocally();
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [api.appointments.list.path],
        refetchType: "active",
      });
    },
    onError: (err: any) => {
      const status = err?.status;
      const message = err?.message || "Failed to update appointment";
      if (status === 403) {
        toast({
          title: "Permission denied",
          description: "Your role lacks calendar booking permissions (appointments.edit / appointments.cancel). Ask an admin to grant access.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Update failed",
          description: message,
          variant: "destructive",
        });
      }
    },
    // See useCreateAppointment's comment — without this the queueLocally()
    // branch above is unreachable while offline (mutationFn never runs).
    networkMode: "always",
  });
}
