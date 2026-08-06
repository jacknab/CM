export type GbpReminderStage = "day_7" | "day_10" | null;

export interface GbpReminderCandidate {
  status: string | null;
  postcardSentAt: Date | null;
  firstSentAt: Date | null;
  secondSentAt: Date | null;
  isConnected: boolean | null;
  abandonedAt: Date | null;
}

function businessDaysElapsed(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setUTCHours(0, 0, 0, 0);
  while (cursor < limit) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function getGbpPostcardReminderStage(
  candidate: GbpReminderCandidate,
  now = new Date(),
): GbpReminderStage {
  if (candidate.isConnected || candidate.abandonedAt || !candidate.postcardSentAt) return null;
  if (candidate.status !== "postcard_sent" && candidate.status !== "verification_pending") return null;

  const ageDays = businessDaysElapsed(candidate.postcardSentAt, now);
  if (ageDays >= 10 && !candidate.secondSentAt) return "day_10";
  if (ageDays >= 7 && !candidate.firstSentAt) return "day_7";
  return null;
}
