import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@shared/apiPaths";
import { useSelectedStore } from "@/hooks/use-store";

/** An add-on group (routes/addonGroups.ts): add-ons in order, and the services that use it. */
export interface AddonGroup {
  id: number;
  name: string;
  sortOrder: number;
  addonIds: number[];
  serviceIds: number[];
}

const LIST = "/api/addon-groups";
const SERVICE_GROUPS = "service-addon-groups";

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.message).catch(() => null);
    throw new Error(msg || "Request failed");
  }
  return res.status === 204 ? null : res.json();
}

/** A group change changes which add-ons services offer: refresh those lists too. */
function refresh(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [LIST] });
  queryClient.invalidateQueries({ queryKey: [api.serviceAddons.forService.path] });
  queryClient.invalidateQueries({ queryKey: [api.serviceAddons.list.path] });
  queryClient.invalidateQueries({ queryKey: [SERVICE_GROUPS] });
}

export function useAddonGroups() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  return useQuery({
    queryKey: [LIST, storeId],
    queryFn: async () => (await send("GET", LIST)) as AddonGroup[],
    enabled: !!storeId,
  });
}

export function useCreateAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; addonIds: number[] }) => send("POST", LIST, data) as Promise<{ id: number }>,
    onSuccess: () => refresh(queryClient),
  });
}

export function useUpdateAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; addonIds?: number[] }) => send("PATCH", `${LIST}/${id}`, data),
    onSuccess: () => refresh(queryClient),
  });
}

export function useDeleteAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => send("DELETE", `${LIST}/${id}`),
    onSuccess: () => refresh(queryClient),
  });
}

export function useDuplicateAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => send("POST", `${LIST}/${id}/duplicate`, { name }) as Promise<{ id: number }>,
    onSuccess: () => refresh(queryClient),
  });
}

/** The groups a service has. */
export function useServiceAddonGroups(serviceId: number | null | undefined) {
  return useQuery({
    queryKey: [SERVICE_GROUPS, serviceId],
    queryFn: async () => ((await send("GET", `/api/services/${serviceId}/addon-groups`)) as { groupIds: number[] }).groupIds,
    enabled: !!serviceId,
  });
}

export function useSetServiceAddonGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, groupIds }: { serviceId: number; groupIds: number[] }) =>
      send("PUT", `/api/services/${serviceId}/addon-groups`, { groupIds }),
    onSuccess: () => refresh(queryClient),
  });
}
