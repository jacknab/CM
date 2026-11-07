/**
 * A booking page's public, read-only data (GET /api/public/...). When the server answers "too many requests" (429 —
 * a busy page, or many clients on one shared address), it waits as long as the server asks (Retry-After, capped at
 * 30 seconds; without one 2, 4, then 8 seconds) and asks again, up to `retries` times, then throws BusyError so the
 * page can say so instead of looking empty. Any other answer is handled as before: the JSON when it is OK, else null.
 * Only for reads: booking and payments never come through here and are never retried.
 */
export class BusyError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("The server is busy");
  }
}

/** Retry-After in milliseconds: seconds ("12") or an HTTP date; null when absent or unreadable. */
export function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

const MAX_WAIT_MS = 30_000;

export async function getPublicJson<T>(
  url: string,
  { retries = 3, onWait, isLive = () => true }: { retries?: number; onWait?: (ms: number) => void; isLive?: () => boolean } = {},
): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429) return res.ok ? ((await res.json()) as T) : null;
    const wait = Math.min(retryAfterMs(res.headers.get("Retry-After")) ?? 2000 * 2 ** attempt, MAX_WAIT_MS);
    if (attempt >= retries) throw new BusyError(wait);
    onWait?.(wait);
    await new Promise((resolve) => setTimeout(resolve, wait));
    // The page moved on while waiting (another day, another business): stop asking.
    if (!isLive()) return null;
  }
}
