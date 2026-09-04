import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { Customer, InsertCustomer } from "@shared/schema";
import { useSelectedStore } from "@/hooks/use-store";
import { useSnapshot } from "@/hooks/use-snapshot";
import { localClientsDB, type LocalClient } from "@/lib/local-clients-db";
import { actionQueueDB } from "@/lib/action-queue-db";

function localClientToCustomer(c: LocalClient): Customer {
  return {
    id: c._id as any,
    storeId: c.storeId,
    name: c.name,
    phone: c.phone ?? null,
    loyaltyPoints: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as any;
}

export function useCustomers() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { snapshot } = useSnapshot();

  return useQuery<Customer[]>({
    queryKey: [api.customers.list.path, storeId],
    queryFn: async () => {
      const localClients = storeId
        ? await localClientsDB.getAll(storeId).catch(() => [] as LocalClient[])
        : [];
      const localMapped = localClients.map(localClientToCustomer);

      if (!navigator.onLine) {
        const snapshotCustomers = (snapshot?.customers ?? []) as Customer[];
        const localIds = new Set(localMapped.map((c) => String(c.id)));
        return [
          ...localMapped,
          ...snapshotCustomers.filter((c) => !localIds.has(String(c.id))),
        ];
      }

      const url = storeId
        ? `${api.customers.list.path}?storeId=${storeId}`
        : api.customers.list.path;

      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch customers");
        const serverData: Customer[] = await res.json();
        const serverIds = new Set(serverData.map((c) => String(c.id)));
        const unseenLocal = localMapped.filter((c) => !serverIds.has(String(c.id)));
        return [...serverData, ...unseenLocal];
      } catch {
        const snapshotCustomers = (snapshot?.customers ?? []) as Customer[];
        const localIds = new Set(localMapped.map((c) => String(c.id)));
        return [
          ...localMapped,
          ...snapshotCustomers.filter((c) => !localIds.has(String(c.id))),
        ];
      }
    },
    enabled: !!storeId,
    placeholderData: (snapshot?.customers as Customer[] | undefined) ?? undefined,
    networkMode: "always",
    staleTime: 60 * 1000,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: InsertCustomer) => {
      const storeId = selectedStore?.id ?? null;

      // Shared helper — saves client locally and queues sync for when server is back
      const saveLocally = async (): Promise<Customer> => {
        const tempId = `local_client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const localClient: LocalClient = {
          _id: tempId,
          _isLocal: true,
          _tempId: tempId,
          storeId: storeId!,
          name: data.name ?? "Unknown",
          phone: (data as any).phone ?? null,
        };
        await localClientsDB.add(localClient).catch(() => {});
        await actionQueueDB.add({
          type: "CREATE_CLIENT",
          entity_temp_id: tempId,
          payload: {
            name: data.name ?? "Unknown",
            phone: (data as any).phone ?? null,
            storeId,
            tempId,
          },
          timestamp: Date.now(),
          idempotency_key: `${tempId}_CREATE_CLIENT`,
        });
        return localClientToCustomer(localClient);
      };

      // Offline: skip network entirely
      if (!navigator.onLine) {
        return saveLocally();
      }

      // Online: try server; if server is unreachable/errored, fall through to
      // local queue so the salon is never blocked by a temporary outage.
      try {
        const payload = { ...data, storeId };
        const res = await fetch(api.customers.create.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) throw new Error("server_error");
        return res.json();
      } catch {
        return saveLocally();
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.customers.list.path] }),
    // Without this, TanStack Query's default networkMode:"online" pauses the
    // mutation before mutationFn runs while offline, so saveLocally() above is
    // never reached.
    networkMode: "always",
  });
}
