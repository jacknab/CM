import { useEffect, useState } from "react";
import { setNailCatalogNames } from "./nailDomTranslate";

/**
 * The salon's service, add-on and category names in the other languages (entity_translations, the same list the
 * booking page uses — GET /api/translations/store), for the /nail screen translator. Kept on the tablet so it still
 * works offline. Returns a number that changes when the names arrive (for useNailDomTranslation).
 */
type Row = { base_name: string; language: string | null; translated_name: string | null };
type Lang3 = "vi" | "es" | "fr";
const KEY = (storeId: number) => `certxa.nail.catalogNames.${storeId}`;

function build(data: Record<string, Row[]> | null): Map<string, Partial<Record<Lang3, string>>> {
  const out = new Map<string, Partial<Record<Lang3, string>>>();
  for (const rows of Object.values(data ?? {})) {
    for (const r of rows ?? []) {
      const lang = r.language as Lang3;
      const name = r.base_name?.trim();
      const translated = r.translated_name?.trim();
      if (!name || !translated || !(lang === "vi" || lang === "es" || lang === "fr")) continue;
      // A translation that is the name itself changes nothing; skip it.
      if (translated === name) continue;
      const entry = out.get(name) ?? {};
      entry[lang] = translated;
      out.set(name, entry);
    }
  }
  return out;
}

export function useNailCatalogNames(storeId: number | null | undefined): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!storeId) return;
    let stale = false;
    const apply = (data: Record<string, Row[]> | null) => { if (stale) return; setNailCatalogNames(build(data)); setVersion((v) => v + 1); };
    try { const kept = localStorage.getItem(KEY(storeId)); if (kept) apply(JSON.parse(kept)); } catch { /* none kept */ }
    fetch("/api/translations/store", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        try { localStorage.setItem(KEY(storeId), JSON.stringify(data)); } catch { /* storage full: still used this time */ }
        apply(data);
      })
      .catch(() => { /* offline: the kept copy (if any) stays in use */ });
    return () => { stale = true; };
  }, [storeId]);
  return version;
}
