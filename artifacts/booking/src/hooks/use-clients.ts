import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useSnapshot } from "@/hooks/use-snapshot";
import { actionQueueDB } from "@/lib/action-queue-db";
import { clientPhoneCacheDB } from "@/lib/client-phone-cache-db";

const BASE = "/api/clients";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientTag {
  id: number;
  tagName: string;
  tagColor: string;
  count?: number;
}

export interface ClientListItem {
  id: number;
  storeId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  preferredName: string | null;
  clientStatus: string;
  source: string | null;
  totalVisits: number;
  totalSpentCents: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
  createdAt: string;
  updatedAt: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  tags: ClientTag[];
  loyaltyPoints: number | null;
}

export interface ClientListResponse {
  clients: ClientListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ClientNote {
  id: number;
  clientId: number;
  storeId: number;
  noteType: string;
  visibility: string;
  noteContent: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPhone {
  id: number;
  clientId: number;
  phoneNumberE164: string;
  displayPhone: string;
  phoneType: string;
  smsOptIn: boolean;
  isPrimary: boolean;
}

export interface ClientEmail {
  id: number;
  clientId: number;
  emailAddress: string;
  isPrimary: boolean;
  marketingOptIn: boolean;
}

export interface ClientAddress {
  id: number;
  clientId: number;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  addressType: string;
}

export interface ClientMarketingPreferences {
  smsMarketingOptIn: boolean;
  emailMarketingOptIn: boolean;
  promotionalNotifications: boolean;
  appointmentReminders: boolean;
  reviewRequests: boolean;
}

export interface ClientDetail extends Omit<ClientListItem, "tags"> {
  dateOfBirth: string | null;
  gender: string | null;
  referralSource: string | null;
  avatarUrl: string | null;
  emails: ClientEmail[];
  phones: ClientPhone[];
  addresses: ClientAddress[];
  notes: ClientNote[];
  tags: Array<{ tagId: number; tag: ClientTag }>;
  marketingPreferences: ClientMarketingPreferences | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

const QK = {
  list: (storeId: number, params?: object) => [BASE, "list", storeId, params],
  detail: (id: number) => [BASE, "detail", id],
  tags: (storeId: number) => [BASE, "tags", storeId],
  notes: (clientId: number) => [BASE, "notes", clientId],
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useClients(params?: {
  search?: string;
  tag?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { snapshot } = useSnapshot();

  return useQuery<ClientListResponse>({
    queryKey: QK.list(storeId!, params),
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) {
        const all = (snapshot?.customers ?? []) as Array<{
          id: number; name: string; phone?: string | null;
          email?: string | null; notes?: string | null;
          loyaltyPoints?: number | null; storeId?: number | null;
        }>;
        const searchLower = (params?.search ?? "").toLowerCase();
        const filtered = searchLower
          ? all.filter((c) => (c.name ?? "").toLowerCase().includes(searchLower) ||
              (c.phone ?? "").includes(searchLower) ||
              (c.email ?? "").toLowerCase().includes(searchLower))
          : all;
        const clients = filtered.map((c) => {
          const parts = (c.name ?? "").split(" ");
          return {
            id: c.id,
            storeId: c.storeId ?? storeId!,
            firstName: parts[0] ?? "",
            lastName: parts.slice(1).join(" ") ?? "",
            fullName: c.name ?? "",
            preferredName: null,
            clientStatus: "active",
            source: null,
            totalVisits: 0,
            totalSpentCents: 0,
            lastVisitAt: null,
            nextAppointmentAt: null,
            createdAt: "",
            updatedAt: "",
            primaryEmail: c.email ?? null,
            primaryPhone: c.phone ?? null,
            tags: [],
          };
        });
        return { clients, total: clients.length, page: 1, limit: clients.length };
      }

      const qs = new URLSearchParams({ storeId: String(storeId) });
      if (params?.search) qs.set("search", params.search);
      if (params?.tag) qs.set("tag", params.tag);
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.sort) qs.set("sort", params.sort);
      if (params?.order) qs.set("order", params.order);
      const res = await fetch(`${BASE}?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!storeId,
  });
}

export function useClientDetail(clientId: number | null) {
  const { snapshot } = useSnapshot();

  return useQuery<ClientDetail>({
    queryKey: QK.detail(clientId!),
    queryFn: async () => {
      if (!navigator.onLine) {
        const snapshotMatch = snapshot?.customers?.find((c: any) => c.id === clientId);
        if (snapshotMatch) {
          return {
            ...snapshotMatch,
            firstName: (snapshotMatch.name ?? "").split(" ")[0] ?? "",
            lastName: (snapshotMatch.name ?? "").split(" ").slice(1).join(" ") ?? "",
            fullName: snapshotMatch.name ?? "",
            preferredName: null,
            clientStatus: "active",
            source: null,
            totalVisits: 0,
            totalSpentCents: 0,
            lastVisitAt: null,
            nextAppointmentAt: null,
            dateOfBirth: null,
            gender: null,
            referralSource: null,
            avatarUrl: null,
            emails: snapshotMatch.email
              ? [{ id: 0, clientId: clientId!, emailAddress: snapshotMatch.email, isPrimary: true, marketingOptIn: false }]
              : [],
            phones: snapshotMatch.phone
              ? [{ id: 0, clientId: clientId!, phoneNumberE164: snapshotMatch.phone, displayPhone: snapshotMatch.phone, phoneType: "mobile", smsOptIn: false, isPrimary: true }]
              : [],
            addresses: [],
            notes: snapshotMatch.notes ? [{ id: 0, clientId: clientId!, storeId: snapshotMatch.storeId, noteType: "general", visibility: "staff", noteContent: snapshotMatch.notes, pinned: false, createdAt: "", updatedAt: "" }] : [],
            tags: [],
            marketingPreferences: null,
            createdAt: "",
            updatedAt: "",
          } as unknown as ClientDetail;
        }
        throw new Error("Client not available offline");
      }
      try {
        const res = await fetch(`${BASE}/${clientId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch client");
        return res.json();
      } catch (err) {
        const snapshotMatch = snapshot?.customers?.find((c: any) => c.id === clientId);
        if (snapshotMatch) {
          return {
            ...snapshotMatch,
            firstName: (snapshotMatch.name ?? "").split(" ")[0] ?? "",
            lastName: (snapshotMatch.name ?? "").split(" ").slice(1).join(" ") ?? "",
            fullName: snapshotMatch.name ?? "",
            preferredName: null,
            clientStatus: "active",
            source: null,
            totalVisits: 0,
            totalSpentCents: 0,
            lastVisitAt: null,
            nextAppointmentAt: null,
            dateOfBirth: null,
            gender: null,
            referralSource: null,
            avatarUrl: null,
            emails: snapshotMatch.email
              ? [{ id: 0, clientId: clientId!, emailAddress: snapshotMatch.email, isPrimary: true, marketingOptIn: false }]
              : [],
            phones: snapshotMatch.phone
              ? [{ id: 0, clientId: clientId!, phoneNumberE164: snapshotMatch.phone, displayPhone: snapshotMatch.phone, phoneType: "mobile", smsOptIn: false, isPrimary: true }]
              : [],
            addresses: [],
            notes: snapshotMatch.notes ? [{ id: 0, clientId: clientId!, storeId: snapshotMatch.storeId, noteType: "general", visibility: "staff", noteContent: snapshotMatch.notes, pinned: false, createdAt: "", updatedAt: "" }] : [],
            tags: [],
            marketingPreferences: null,
            createdAt: "",
            updatedAt: "",
          } as unknown as ClientDetail;
        }
        throw err;
      }
    },
    enabled: !!clientId,
    networkMode: "always",
  });
}

export function useClientTags() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  return useQuery<ClientTag[]>({
    queryKey: QK.tags(storeId!),
    queryFn: async () => {
      const res = await fetch(`${BASE}/tags/list?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
    enabled: !!storeId,
  });
}

export function useClientNotes(clientId: number | null) {
  return useQuery<ClientNote[]>({
    queryKey: QK.notes(clientId!),
    queryFn: async () => {
      const res = await fetch(`${BASE}/${clientId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!clientId,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: any) => {
      const storeId = selectedStore?.id;

      if (!navigator.onLine) {
        const tempId = `local_client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await actionQueueDB.add({
          type: "CREATE_CLIENT",
          entity_temp_id: tempId,
          payload: { ...data, storeId, tempId },
          timestamp: Date.now(),
          idempotency_key: `${tempId}_CREATE_CLIENT`,
        });
        const firstName = data.firstName ?? data.first_name ?? "";
        const lastName = data.lastName ?? data.last_name ?? "";
        return {
          id: tempId,
          _isLocal: true,
          _tempId: tempId,
          storeId,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          preferredName: null,
          clientStatus: "active",
          ...data,
        };
      }

      const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, storeId }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create client");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BASE] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [k: string]: any }) => {
      const res = await fetch(`${BASE}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.message || "Failed to update client");
        err.code = body.code;
        throw err;
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: QK.detail(vars.id) });
    },
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: number) => {
      const res = await fetch(`${BASE}/${clientId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to archive client");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BASE] }),
  });
}

export function useCreateClientNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, ...data }: { clientId: number; storeId: number; noteContent: string; noteType?: string; pinned?: boolean }) => {
      const res = await fetch(`${BASE}/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create note");
      return res.json();
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: QK.notes(vars.clientId) }),
  });
}

export function useDeleteClientNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, noteId }: { clientId: number; noteId: number }) => {
      const res = await fetch(`${BASE}/${clientId}/notes/${noteId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete note");
      return res.json();
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: QK.notes(vars.clientId) }),
  });
}

export function useCreateClientTag() {
  const qc = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: { tagName: string; tagColor?: string }) => {
      const res = await fetch(`${BASE}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, storeId: selectedStore?.id }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create tag");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BASE, "tags"] }),
  });
}

export function useAddTagToClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, tagId }: { clientId: number; tagId: number }) => {
      const res = await fetch(`${BASE}/${clientId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add tag");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: QK.detail(vars.clientId) });
    },
  });
}

export function useRemoveTagFromClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, tagId }: { clientId: number; tagId: number }) => {
      const res = await fetch(`${BASE}/${clientId}/tags/${tagId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to remove tag");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: QK.detail(vars.clientId) });
    },
  });
}

// ─── Booking-form compatible hook ─────────────────────────────────────────────
// Returns clients shaped like the old Customer type so NewBooking.tsx can use
// the clients table without a deep refactor of every consumer.
export type BookingClient = {
  id: number | string;
  name: string;
  phone: string | null;
  email: string | null;
  storeId: number | null;
  loyaltyPoints: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  allergies: string | null;
  marketingOptIn: boolean | null;
  birthday: string | null;
  _isLocal?: boolean;
  _tempId?: string;
};

function toBookingClient(c: any, storeId: number): BookingClient {
  return {
    id: c.id,
    name: c.name ?? "",
    phone: c.phone ?? null,
    email: c.email ?? null,
    storeId: c.storeId ?? storeId,
    loyaltyPoints: c.loyaltyPoints ?? 0,
    notes: c.notes ?? null,
    createdAt: c.createdAt ?? "",
    updatedAt: c.updatedAt ?? "",
    allergies: c.allergies ?? null,
    marketingOptIn: c.marketingOptIn ?? null,
    birthday: c.birthday ?? null,
    _isLocal: c._isLocal,
    _tempId: c._tempId,
  };
}

async function loadCachedBookingClients(storeId: number, snapshotCustomers: any[] = []): Promise<BookingClient[]> {
  const cached = await clientPhoneCacheDB.getAll(storeId).catch(() => [] as Awaited<ReturnType<typeof clientPhoneCacheDB.getAll>>);
  if (cached.length > 0) return cached.filter((c) => !c._syncedRealId).map((c) => toBookingClient(c, storeId));
  await clientPhoneCacheDB.putMany(storeId, snapshotCustomers).catch(() => {});
  return snapshotCustomers.map((c) => toBookingClient(c, storeId));
}

export function useClientsForBooking() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { snapshot } = useSnapshot();

  return useQuery<BookingClient[]>({
    queryKey: [BASE, "booking-picker", storeId],
    networkMode: "always",
    queryFn: async () => {
      const snapshotCustomers = snapshot?.customers ?? [];
      if (!navigator.onLine) {
        return loadCachedBookingClients(storeId!, snapshotCustomers);
      }

      try {
        const qs = new URLSearchParams({ storeId: String(storeId), limit: "500", sort: "fullName", order: "asc" });
        const res = await fetch(`${BASE}?${qs}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch clients");
        const data: ClientListResponse = await res.json();
        const clients = data.clients.map((c) => ({
          id: c.id,
          name: c.fullName || `${c.firstName} ${c.lastName}`.trim(),
          phone: c.primaryPhone ?? null,
          email: c.primaryEmail ?? null,
          storeId: c.storeId,
          loyaltyPoints: c.loyaltyPoints ?? 0,
          notes: null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          allergies: null,
          marketingOptIn: null,
          birthday: null,
        }));
        await clientPhoneCacheDB.putMany(storeId!, clients).catch(() => {});
        return clients;
      } catch (error) {
        const cached = await loadCachedBookingClients(storeId!, snapshotCustomers);
        if (cached.length > 0) return cached;
        throw error;
      }
    },
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });
}

// Wraps useCreateClient so the booking form can call mutate({ name, phone })
// in the same shape as the old useCreateCustomer did.
export function useCreateClientForBooking() {
  const qc = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async (data: { name?: string; phone?: string }) => {
      const storeId = selectedStore?.id;
      if (!storeId) throw new Error("No store selected");

      const parts = (data.name ?? "").trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") ?? "";

      const saveLocal = async () => {
        const tempId = `local_client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
        await actionQueueDB.add({
          type: "CREATE_CLIENT",
          entity_temp_id: tempId,
          payload: { firstName, lastName, phone: data.phone ?? undefined, storeId, tempId },
          timestamp: Date.now(),
          idempotency_key: `${tempId}_CREATE_CLIENT`,
        });
        const client = await clientPhoneCacheDB.putLocal(storeId, {
          id: tempId,
          _isLocal: true,
          _tempId: tempId,
          storeId,
          name: fullName,
          phone: data.phone ?? null,
          email: null,
          loyaltyPoints: 0,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return toBookingClient(client, storeId);
      };

      if (!navigator.onLine) return saveLocal();

      try {
        const res = await fetch(BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, phone: data.phone ?? undefined, storeId }),
          credentials: "include",
        });
        if (!res.ok) {
          const err: any = new Error("Failed to create client");
          err.status = res.status;
          throw err;
        }
        const client = await res.json();
        const bookingClient = {
          id: client.id,
          name: client.fullName || `${client.firstName} ${client.lastName}`.trim(),
          phone: data.phone ?? null,
          email: null,
          storeId: client.storeId,
          loyaltyPoints: 0,
          notes: null,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
          allergies: null,
          marketingOptIn: null,
          birthday: null,
        };
        await clientPhoneCacheDB.putMany(storeId, [bookingClient]).catch(() => {});
        return bookingClient;
      } catch (error: any) {
        if (error?.name === "TypeError" || error?.status >= 500) return saveLocal();
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
    },
  });
}

// ─── Duplicate types ──────────────────────────────────────────────────────────

export interface DuplicateClient {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  totalVisits: number;
  totalSpentCents: number;
  lastVisitAt: string | null;
  createdAt: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
}

export interface DuplicateGroup {
  key: string;
  reason: "phone" | "email" | "name";
  matchValue: string;
  clients: DuplicateClient[];
}

// ─── useFindAllDuplicates ─────────────────────────────────────────────────────

export function useFindAllDuplicates(enabled = false) {
  const { selectedStore } = useSelectedStore();
  return useQuery({
    queryKey: [BASE, "find-all-duplicates", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return { groups: [] as DuplicateGroup[] };
      const res = await fetch(`${BASE}/find-all-duplicates?storeId=${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to find duplicates");
      return res.json() as Promise<{ groups: DuplicateGroup[] }>;
    },
    enabled: !!selectedStore?.id && enabled,
    staleTime: 30_000,
  });
}

// ─── useMergeClients ──────────────────────────────────────────────────────────

export function useMergeClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      winnerId,
      loserIds,
    }: {
      storeId: number;
      winnerId: number;
      loserIds: number[];
    }) => {
      const res = await fetch(`${BASE}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, winnerId, loserIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Merge failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
    },
  });
}

export function useMigrateFromCustomers() {
  const qc = useQueryClient();
  const { selectedStore } = useSelectedStore();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/migrate-from-customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore?.id }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Migration failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BASE] }),
  });
}
