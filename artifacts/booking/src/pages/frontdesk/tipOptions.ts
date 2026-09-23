/**
 * The tip choices offered on customer-facing screens: the full-screen "Add a Tip?" page (shown while collecting a card
 * payment) and the floating TipPanel (the cart screen's right panel, shown in place of RewardsPanel when the client
 * can't redeem anything). One shared list + calculation so both stay in sync.
 */
export interface TipOption { label: string; pct: number }

export const TIP_OPTIONS: readonly TipOption[] = [
  { label: "No Tip", pct: 0 },
  { label: "15%", pct: 15 },
  { label: "18%", pct: 18 },
  { label: "20%", pct: 20 },
  { label: "25%", pct: 25 },
];

/** Whole cents, rounded — `total` is the sale total the tip is calculated on. */
export const calcTipAmount = (total: number, pct: number): number => Math.round(total * pct) / 100;
