import { useQuery } from "@tanstack/react-query";
import { DEFAULT_TIP_PRESETS, sanitizeTipPresets } from "@shared/tipPresets";

/** The salon's tip percentages (POS Settings → Tip presets); the defaults while loading or signed out. */
export function useTipPresets(): number[] {
  const { data } = useQuery<{ presets: number[] }>({ queryKey: ["/api/tip-presets"], staleTime: 60_000 });
  return data ? sanitizeTipPresets(data.presets) : [...DEFAULT_TIP_PRESETS];
}
