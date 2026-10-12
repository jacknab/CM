/** How long a device may keep working with no answer from the server. */
export const OFFLINE_LIMIT_MS = 12 * 60 * 60 * 1000;

/** The rule behind the lock: has it been longer than the limit since the server last answered? */
export function offlineLimitReached(lastContactAt: number, now: number, limitMs: number = OFFLINE_LIMIT_MS): boolean {
  return now - lastContactAt > limitMs;
}
