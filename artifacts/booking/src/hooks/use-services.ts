import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertService } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";
import { useSnapshot } from "@/hooks/use-snapshot";

export function useServices() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { snapshot } = useSnapshot();

  return useQuery({
    queryKey: [api.services.list.path, storeId],
    queryFn: async () => {
      const url = storeId
        ? `${api.services.list.path}?storeId=${storeId}`
        : api.services.list.path;
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch services");
        return res.json();
      } catch (error) {
        if (snapshot?.services) return snapshot.services;
        throw error;
      }
    },
    enabled: !!storeId,
    placeholderData: snapshot?.services ?? undefined,
    networkMode: "offlineFirst",
  });
}

export function useService(id: number) {
  return useQuery({
    queryKey: [api.services.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.services.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch service");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: InsertService & { options?: any[] }) => {
      const payload = { ...data, storeId: selectedStore?.id ?? null };
      const res = await fetch(api.services.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create service");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertService>) => {
      const url = buildUrl(api.services.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update service");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.services.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete service");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}

export function useCreateServiceOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, ...body }: {
      serviceId: number;
      name: string;
      description?: string | null;
      durationMinutes: number;
      price: number;
      isDefault?: boolean;
      displayOrder?: number;
      imageUrl?: string | null;
    }) => {
      const res = await fetch(`/api/services/${serviceId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create option");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}

export function useUpdateServiceOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: {
      id: number;
      name?: string;
      description?: string | null;
      durationMinutes?: number;
      price?: number;
      isDefault?: boolean;
      displayOrder?: number;
      imageUrl?: string | null;
    }) => {
      const res = await fetch(`/api/service-options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update option");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}

export function useDeleteServiceOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/service-options/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete option");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.services.list.path] }),
  });
}
