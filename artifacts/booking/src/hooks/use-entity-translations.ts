import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "./use-language";

// Mirrors EntityType/LangCode in artifacts/api-server/src/lib/translationService.ts
export type TranslatableEntity = "category" | "service" | "addon" | "product";

interface TranslationRow {
  id: number;
  base_name: string;
  base_description?: string | null;
  language: string | null;
  translated_name: string | null;
  description: string | null;
}

interface StoreTranslations {
  categories: TranslationRow[];
  services: TranslationRow[];
  addons: TranslationRow[];
  products: TranslationRow[];
}

type NameMap = Map<number, Record<string, { name: string; description: string | null }>>;

function buildMap(rows: TranslationRow[]): NameMap {
  const map: NameMap = new Map();
  for (const r of rows) {
    if (!r.language || !r.translated_name) continue;
    if (!map.has(r.id)) map.set(r.id, {});
    map.get(r.id)![r.language] = { name: r.translated_name, description: r.description };
  }
  return map;
}

/**
 * Looks up AI/manually-generated translations (entity_translations table) for
 * service categories, services, add-ons and products, and exposes translate()
 * helpers that fall back to the original English name when the current
 * display language has no stored translation yet.
 */
export function useEntityTranslations() {
  const { language } = useLanguage();

  const { data } = useQuery<StoreTranslations>({
    queryKey: ["/api/translations/store"],
    queryFn: async () => {
      const res = await fetch("/api/translations/store", { credentials: "include" });
      if (!res.ok) return { categories: [], services: [], addons: [], products: [] };
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const maps = useMemo(() => ({
    category: buildMap(data?.categories ?? []),
    service: buildMap(data?.services ?? []),
    addon: buildMap(data?.addons ?? []),
    product: buildMap(data?.products ?? []),
  }), [data]);

  function translateName(type: TranslatableEntity, id: number | null | undefined, fallback: string): string {
    if (language === "en" || id == null) return fallback;
    const entry = maps[type].get(id)?.[language];
    return entry?.name || fallback;
  }

  function translateDescription(type: TranslatableEntity, id: number | null | undefined, fallback: string | null | undefined): string | null | undefined {
    if (language === "en" || id == null) return fallback;
    const entry = maps[type].get(id)?.[language];
    return entry?.description ?? fallback;
  }

  return { translateName, translateDescription };
}
