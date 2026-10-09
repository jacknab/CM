export const DAY_CLOSE_LOCK_MS = 12 * 60 * 60 * 1000;

/** Only a shortage of at least $2.00 triggers an owner notification. */
export function cashShortageCents(expected: number, counted: number): number {
  if (!Number.isFinite(expected) || !Number.isFinite(counted)) return 0;
  const shortage = Math.round(expected * 100) - Math.round(counted * 100);
  return shortage >= 200 ? shortage : 0;
}

/** Persisted session close time is the source of truth, across devices and server restarts. */
export function dayCloseLockedUntil(closedAt: Date | string | null | undefined, now = new Date()): string | null {
  if (!closedAt) return null;
  const closed = new Date(closedAt).getTime();
  if (!Number.isFinite(closed) || closed > now.getTime()) return null;
  const until = closed + DAY_CLOSE_LOCK_MS;
  return until > now.getTime() ? new Date(until).toISOString() : null;
}

/** Every bill and coin the drawer count screens offer — the same list for opening and closing counts. */
export const DENOMINATION_VALUES: Record<string, number> = {
  "100": 100, "50": 50, "20": 20, "10": 10, "5": 5, "2": 2, "1": 1,
  "0.25": 0.25, "0.10": 0.10, "0.05": 0.05, "0.01": 0.01,
};

/** Total of a JSON denomination count ({"20": 3, "1": 4}) as a "0.00" string, or null if it can't be read. */
export function denominationTotal(breakdown: string | null | undefined): string | null {
  if (!breakdown) return null;
  try {
    const counts = JSON.parse(breakdown) as Record<string, unknown>;
    if (!counts || typeof counts !== "object") return null;
    let cents = 0;
    for (const [k, c] of Object.entries(counts)) {
      const v = DENOMINATION_VALUES[k];
      if (v != null && typeof c === "number" && Number.isFinite(c) && c > 0) cents += Math.round(v * 100) * Math.floor(c);
    }
    return (cents / 100).toFixed(2);
  } catch {
    return null;
  }
}

/** A drawer amount typed by staff: a finite, non-negative dollar value under $1M, as "0.00" — else null. */
export function parseDrawerAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) return null;
  return n.toFixed(2);
}
