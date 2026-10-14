import { useQuery } from "@tanstack/react-query";

const BLANK = ["", "", ""];

/**
 * The salon's three Quick Area Codes (Settings → Checkout & Tax). Strings; "" = that button isn't set up.
 * Refetched with every other setting when a station saves a change (settings_changed), so all POS stations agree.
 */
export function useQuickAreaCodes(storeId: number): string[] {
  // The last codes the server sent are kept on the tablet, so the buttons are still there with no connection.
  const key = `certxa.nail.quickAreaCodes.${storeId}`;
  const kept = (): string[] | undefined => {
    try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return Array.isArray(v) && v.length === 3 ? v : undefined; } catch { return undefined; }
  };
  const { data } = useQuery({
    queryKey: ["/api/pos-settings", storeId, "quick-area-codes"],
    queryFn: async () => {
      let res: Response;
      try { res = await fetch(`/api/pos-settings/${storeId}`, { credentials: "include" }); }
      catch { return kept() ?? BLANK; }
      if (!res.ok) return kept() ?? BLANK;
      const d = await res.json().catch(() => null);
      const list = Array.isArray(d?.quickAreaCodes) ? d.quickAreaCodes : BLANK;
      const codes = Array.from({ length: 3 }, (_, i) => (typeof list[i] === "string" ? list[i] : ""));
      try { localStorage.setItem(key, JSON.stringify(codes)); } catch { /* storage unavailable */ }
      return codes;
    },
    initialData: kept,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  return data ?? BLANK;
}
