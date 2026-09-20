import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { DealWithDetails } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";

export interface DealFormPayload {
  packageId: number;
  title: string;
  marketingDescription?: string | null;
  heroImage?: string | null;
  dealPrice: string;
  capacity: number;
  startsAt: string;
  endsAt: string;
  expiryDays?: number;
}

export function useDeals() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useQuery({
    queryKey: [api.deals.list.path, storeId],
    queryFn: async () => {
      const res = await fetch(api.deals.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json() as Promise<DealWithDetails[]>;
    },
    enabled: !!storeId,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async (data: DealFormPayload) => {
      const res = await fetch(api.deals.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Failed to create deal");
      return res.json() as Promise<DealWithDetails>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.deals.list.path, storeId] }),
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<Omit<DealFormPayload, "packageId">> & { status?: "active" | "paused" | "archived" }) => {
      const url = buildUrl(api.deals.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update deal");
      return res.json() as Promise<DealWithDetails>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.deals.list.path, storeId] }),
  });
}
