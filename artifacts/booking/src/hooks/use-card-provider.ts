import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

/** "none": the salon takes no card payments — the CARD button is off. */
export type CardProvider = "stripe" | "own" | "none";
const KEY = "certxa.cardProvider";

const remembered = (): CardProvider | undefined => {
  try { const v = localStorage.getItem(KEY); return v === "own" || v === "stripe" || v === "none" ? v : undefined; } catch { return undefined; }
};

/**
 * Who processes card payments at checkout (Settings → Checkout): Certxa's Stripe reader, the salon's own
 * card terminal, or no cards at all. The last known answer is kept on the device so the POS shows the right CARD button with no
 * connection.
 */
export function useCardProvider(): CardProvider {
  const { data } = useQuery<{ provider: CardProvider }>({ queryKey: ["/api/card-provider"], staleTime: 60_000 });
  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(KEY, data.provider); } catch { /* storage unavailable */ }
  }, [data]);
  return data?.provider ?? remembered() ?? "stripe";
}
