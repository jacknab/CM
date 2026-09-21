import { useQuery } from "@tanstack/react-query";

const BLANK = ["", "", ""];

/**
 * The salon's three Quick Area Codes (Settings → Checkout & Tax). Strings; "" = that button isn't set up.
 * Refetched with every other setting when a station saves a change (settings_changed), so all POS stations agree.
 */
export function useQuickAreaCodes(storeId: number): string[] {
  const { data } = useQuery({
    queryKey: ["/api/pos-settings", storeId, "quick-area-codes"],
    queryFn: async () => {
      const res = await fetch(`/api/pos-settings/${storeId}`, { credentials: "include" });
      if (!res.ok) return BLANK;
      const d = await res.json().catch(() => null);
      const list = Array.isArray(d?.quickAreaCodes) ? d.quickAreaCodes : BLANK;
      return Array.from({ length: 3 }, (_, i) => (typeof list[i] === "string" ? list[i] : ""));
    },
    staleTime: 60_000,
  });
  return data ?? BLANK;
}
