import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";

export type NailVocabKind = "size" | "shape" | "application" | "effect";

export type NailVocabRow = {
  id: number;
  storeId: number;
  code: string | null;
  name: string;
  description: string | null;
  imageUrl?: string | null;
  swatchHex?: string | null;
  isQuote?: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type NailVocab = {
  sizes: NailVocabRow[];
  shapes: NailVocabRow[];
  applications: NailVocabRow[];
  effects: NailVocabRow[];
};

export type NailServiceSummary = {
  serviceId: number;
  name: string;
  price: string;
  duration: number;
  category: string;
  isEnabled: boolean;
  lengthRequired: boolean;
  shapeRequired: boolean;
  artRequired: boolean;
  enabledSizes: number;
  enabledShapes: number;
  enabledApplications: number;
  enabledEffects: number;
};

export type NailConfigJunction = {
  id: number;
  name: string;
  priceAdjustment: string;
  durationAdjustment: number;
  isEnabled: boolean;
  isDefault?: boolean;
  sortOrder: number;
  nailSizeId?: number;
  nailShapeId?: number;
  nailArtApplicationId?: number;
  nailArtEffectId?: number;
  isQuote?: boolean;
  imageUrl?: string | null;
  swatchHex?: string | null;
};

export type ServiceNailConfig = {
  config: {
    id: number;
    serviceId: number;
    isEnabled: boolean;
    lengthRequired: boolean;
    shapeRequired: boolean;
    artRequired: boolean;
  };
  sizes: NailConfigJunction[];
  shapes: NailConfigJunction[];
  applications: NailConfigJunction[];
  effects: NailConfigJunction[];
};

export type SaveNailConfigInput = {
  isEnabled?: boolean;
  lengthRequired?: boolean;
  shapeRequired?: boolean;
  artRequired?: boolean;
  sizes?: JunctionInput[];
  shapes?: JunctionInput[];
  applications?: JunctionInput[];
  effects?: JunctionInput[];
};
export type JunctionInput = {
  vocabId: number;
  priceAdjustment?: string | number;
  durationAdjustment?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function useNailVocab() {
  const { selectedStore } = useSelectedStore();
  return useQuery({
    queryKey: ["/api/nail-vocab", selectedStore?.id],
    queryFn: () => fetch("/api/nail-vocab", { credentials: "include" }).then((r) => json<NailVocab>(r)),
    enabled: !!selectedStore?.id,
  });
}

export function useNailServices() {
  const { selectedStore } = useSelectedStore();
  return useQuery({
    queryKey: ["/api/nail-services", selectedStore?.id],
    queryFn: () => fetch("/api/nail-services", { credentials: "include" }).then((r) => json<NailServiceSummary[]>(r)),
    enabled: !!selectedStore?.id,
  });
}

export function useServiceNailConfig(serviceId: number | null) {
  return useQuery({
    queryKey: ["/api/services", serviceId, "nail-config"],
    queryFn: () =>
      fetch(`/api/services/${serviceId}/nail-config`, { credentials: "include" }).then((r) => json<ServiceNailConfig | null>(r)),
    enabled: !!serviceId,
  });
}

export function useSaveServiceNailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, ...body }: { serviceId: number } & SaveNailConfigInput) =>
      fetch(`/api/services/${serviceId}/nail-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then((r) => json<ServiceNailConfig>(r)),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/services", vars.serviceId, "nail-config"] });
      qc.invalidateQueries({ queryKey: ["/api/nail-services"] });
    },
  });
}

export function useNailVocabMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/nail-vocab"] });
    qc.invalidateQueries({ queryKey: ["/api/nail-services"] });
  };
  const create = useMutation({
    mutationFn: ({ kind, ...body }: { kind: NailVocabKind } & Partial<NailVocabRow>) =>
      fetch(`/api/nail-vocab/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then((r) => json<NailVocabRow>(r)),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ kind, id, ...body }: { kind: NailVocabKind; id: number } & Partial<NailVocabRow>) =>
      fetch(`/api/nail-vocab/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then((r) => json<NailVocabRow>(r)),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: NailVocabKind; id: number }) =>
      fetch(`/api/nail-vocab/${kind}/${id}`, { method: "DELETE", credentials: "include" }).then((r) => json<NailVocabRow>(r)),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
