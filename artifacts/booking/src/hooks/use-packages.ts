import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { PackageWithItems } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";

export interface PackageItemInput {
  itemType: "service" | "addon";
  serviceId?: number | null;
  addonId?: number | null;
}

export interface PackageFormPayload {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  pricingMode: "sum" | "fixed";
  fixedPrice?: string | null;
  hiddenFromPublic?: boolean;
  items: PackageItemInput[];
}

export function usePackages() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useQuery({
    queryKey: [api.packages.list.path, storeId],
    queryFn: async () => {
      const res = await fetch(api.packages.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch packages");
      return res.json() as Promise<PackageWithItems[]>;
    },
    enabled: !!storeId,
  });
}

export function useCreatePackage() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async (data: PackageFormPayload) => {
      const res = await fetch(api.packages.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create package");
      return res.json() as Promise<PackageWithItems>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.packages.list.path, storeId] }),
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<PackageFormPayload>) => {
      const url = buildUrl(api.packages.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update package");
      return res.json() as Promise<PackageWithItems>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.packages.list.path, storeId] }),
  });
}

export function useDeletePackage() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.packages.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete package");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.packages.list.path, storeId] }),
  });
}

export function useReorderPackages() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async (orderedIds: number[]) => {
      if (!storeId) throw new Error("No store selected");
      const res = await fetch(api.packages.reorder.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds, storeId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reorder packages");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.packages.list.path, storeId] }),
  });
}
