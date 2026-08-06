import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Product, InsertProduct } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";

export function useProducts() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useQuery<Product[]>({
    queryKey: [api.products.list.path, storeId],
    queryFn: async () => {
      const url = storeId
        ? `${api.products.list.path}?storeId=${storeId}`
        : api.products.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json() as Promise<Product[]>;
    },
    enabled: !!storeId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: InsertProduct) => {
      const payload = { ...data, storeId: selectedStore?.id ?? null };
      const res = await fetch(api.products.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create product");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.products.list.path] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertProduct>) => {
      const url = buildUrl(api.products.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update product");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.products.list.path] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete product");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.products.list.path] }),
  });
}
