import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertStaff, Staff, StaffService, StaffAvailability } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";
import { useSnapshot } from "@/hooks/use-snapshot";
import { useAuth } from "@/hooks/use-auth";

export function useStaffList() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { snapshot } = useSnapshot();
  const { user } = useAuth();

  // Staff portal users don't own a store so selectedStore is always null for them.
  // The server resolves their storeId from the session (via resolveSessionStoreId),
  // so we can fire the request without a storeId query param when acting as staff.
  const isStaffUser = !!(user as any)?.staffId;
  const canFetch = !!storeId || isStaffUser;

  return useQuery<Staff[]>({
    queryKey: [api.staff.list.path, storeId ?? "staff-session"],
    queryFn: async () => {
      const url = storeId
        ? `${api.staff.list.path}?storeId=${storeId}`
        : api.staff.list.path;
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch staff");
        return res.json();
      } catch (error) {
        if (snapshot?.staff) return snapshot.staff as Staff[];
        throw error;
      }
    },
    enabled: canFetch,
    placeholderData: (snapshot?.staff as Staff[] | undefined) ?? undefined,
    networkMode: "offlineFirst",
  });
}

export function useStaffMember(id: number) {
  return useQuery<Staff>({
    queryKey: [api.staff.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.staff.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff member");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: InsertStaff) => {
      const payload = { ...data, storeId: selectedStore?.id ?? null };
      const res = await fetch(api.staff.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.message ?? "Failed to create staff member");
        err.upgradeRequired = !!(body.upgradeRequired);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.staff.list.path] }),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertStaff>) => {
      const url = buildUrl(api.staff.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update staff member");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.staff.get.path, variables.id] });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.staff.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete staff member");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.staff.list.path] }),
  });
}

export function useStaffServices(staffId: number) {
  return useQuery<StaffService[]>({
    queryKey: [api.staffServices.list.path, staffId],
    queryFn: async () => {
      const res = await fetch(`${api.staffServices.list.path}?staffId=${staffId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff services");
      return res.json();
    },
    enabled: !!staffId,
  });
}

export function useSetStaffServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, serviceIds }: { staffId: number; serviceIds: number[] }) => {
      const url = buildUrl(api.staffServices.set.path, { id: staffId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update staff services");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staffServices.list.path, variables.staffId] });
    },
  });
}

export function useAllStaffAvailability(storeId?: number) {
  return useQuery<StaffAvailability[]>({
    queryKey: ["/api/store-staff-availability", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/store-staff-availability?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff availability");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStaffAvailability(staffId: number) {
  return useQuery<StaffAvailability[]>({
    queryKey: [api.staffAvailability.get.path, staffId],
    queryFn: async () => {
      const url = buildUrl(api.staffAvailability.get.path, { id: staffId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff availability");
      return res.json();
    },
    enabled: !!staffId,
  });
}

export function useSetStaffAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, rules }: { staffId: number; rules: { dayOfWeek: number; startTime: string; endTime: string }[] }) => {
      const url = buildUrl(api.staffAvailability.set.path, { id: staffId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update staff availability");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staffAvailability.get.path, variables.staffId] });
      queryClient.invalidateQueries({ queryKey: ["/api/store-staff-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/availability/slots"] });
    },
  });
}

export function useDeleteStaffAvailabilityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: number; staffId: number }) => {
      const url = buildUrl(api.staffAvailability.deleteRule.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete availability rule");
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staffAvailability.get.path, variables.staffId] });
      queryClient.invalidateQueries({ queryKey: ["/api/store-staff-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/availability/slots"] });
    },
  });
}
