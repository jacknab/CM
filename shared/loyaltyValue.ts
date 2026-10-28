/**
 * Loyalty in dollars (owner, 2026-10-29: "what really matters is the money — how much was given away in loyalty
 * discounts and how much is still owed to clients"). Rewards are "N points = $X off" (loyalty_rewards), so a point is
 * worth what the salon's best active reward pays for it: the most the points clients hold could be turned into.
 */
export function valuePerPoint(rewards: { pointsCost: number | string; dollarValue: number | string; isActive?: boolean | null }[]): number {
  let best = 0;
  for (const r of rewards) {
    if (r.isActive === false) continue;
    const pts = Number(r.pointsCost), usd = Number(r.dollarValue);
    if (pts > 0 && usd > 0) best = Math.max(best, usd / pts);
  }
  return best;
}

/** The dollars a redemption took off the bill (its description says "$10 off …"). */
export function redeemedDollars(description: string | null | undefined): number {
  const m = /\$([\d.]+)\s*off/i.exec(description || "");
  return m ? Number(m[1]) || 0 : 0;
}

export const pointsInDollars = (points: number, perPoint: number) => Math.round(points * perPoint * 100) / 100;
