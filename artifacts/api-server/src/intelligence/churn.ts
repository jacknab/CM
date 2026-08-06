import { ClientCadenceData } from "./cadence";
import { ClientLtvData } from "./ltv";

export interface ChurnRiskData {
  customerId: number;
  churnRiskScore: number;
  churnRiskLabel: "low" | "medium" | "high" | "critical";
  isAtRisk: boolean;
  riskFactors: string[];
}

export function computeChurnRisk(
  cadence: ClientCadenceData,
  ltv: ClientLtvData,
  noShowRate: number
): ChurnRiskData {
  let score = 0;
  const factors: string[] = [];

  // Factor 1: Days overdue relative to cadence
  if (cadence.daysOverduePct !== null) {
    if (cadence.daysOverduePct >= 100) {
      score += 40;
      factors.push("2x past their usual visit cycle");
    } else if (cadence.daysOverduePct >= 50) {
      score += 30;
      factors.push("50%+ overdue on their visit cycle");
    } else if (cadence.daysOverduePct >= 20) {
      score += 15;
      factors.push("Slightly past their usual cadence");
    }
  } else if (cadence.daysSinceLast !== null) {
    // No cadence established — use raw days since last visit
    if (cadence.daysSinceLast > 180) {
      score += 35;
      factors.push("No visit in over 6 months");
    } else if (cadence.daysSinceLast > 90) {
      score += 20;
      factors.push("No visit in over 3 months");
    } else if (cadence.daysSinceLast > 60) {
      score += 10;
      factors.push("No visit in over 60 days");
    }
  } else {
    // Never visited (no data)
    score += 20;
    factors.push("No visit history");
  }

  // Factor 2: LTV weight — high-LTV clients at risk are more urgent
  // (doesn't increase risk, used for label priority only)

  // Factor 3: Only 1 visit total = high churn probability
  if (ltv.totalVisits === 1) {
    score += 20;
    factors.push("Only one visit on record");
  } else if (ltv.totalVisits === 2) {
    score += 10;
    factors.push("Only two visits on record");
  }

  // Factor 4: High no-show rate
  if (noShowRate >= 0.5) {
    score += 20;
    factors.push("High no-show rate (50%+)");
  } else if (noShowRate >= 0.25) {
    score += 10;
    factors.push("Elevated no-show rate");
  }

  // Factor 5: Long gap even with established cadence
  if (
    cadence.avgCadenceDays !== null &&
    cadence.daysSinceLast !== null &&
    cadence.daysSinceLast > cadence.avgCadenceDays * 1.5
  ) {
    score += 10;
    factors.push("Longest gap in recent history");
  }

  score = Math.min(score, 100);

  let label: "low" | "medium" | "high" | "critical";
  if (score >= 75) label = "critical";
  else if (score >= 50) label = "high";
  else if (score >= 25) label = "medium";
  else label = "low";

  const isAtRisk = score >= 50;

  return {
    customerId: cadence.customerId,
    churnRiskScore: score,
    churnRiskLabel: label,
    isAtRisk,
    riskFactors: factors,
  };
}
