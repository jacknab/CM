/**
 * What may be settled while the server cannot be reached: cash, cards the M2 took offline (`offlineRef`, kept by the
 * Certxa app and sent to Stripe later) and cards taken on the salon's own terminal (`card`: only recorded, the CARD
 * button set to Own Provider), on one ticket, with nothing redeemed.
 * Everything else moves money or balances that only the server (or the card reader with the server) can
 * confirm, so it waits for a connection.
 */
export interface SaleShape {
  tenders: { method: string; amount: number; offlineRef?: string }[];
  giftCards?: unknown[];
  redemption?: unknown;
  groupTickets?: unknown[];
}

/** Why this sale cannot be closed offline, or null when it can. */
export function offlineSaleProblem(data: SaleShape): string | null {
  if (!data.tenders.length || data.tenders.some((t) => t.method !== "cash" && t.method !== "card" && !(t.method === "m2" && t.offlineRef)))
    return "Only cash, a card on the M2 reader, or a card on your own terminal can be taken while the tablet is offline. Gift cards and Tap to Pay need a connection.";
  if (data.giftCards?.length) return "Gift cards need a connection.";
  if (data.redemption) return "Rewards can be redeemed once the tablet is back online.";
  if (data.groupTickets?.length) return "Group Pay needs a connection. Pay each ticket on its own, or wait until the tablet is back online.";
  return null;
}
