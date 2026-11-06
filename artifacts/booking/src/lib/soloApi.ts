/**
 * Requests from the Solo dashboard (/solo, owner 2026-11-06; plans/solo-web-dashboard.md). The X-Certxa-Solo header
 * makes the server answer them the way it answers the Certxa Pro app (routes/certxaPro.ts): the same data and the
 * same rules (only the owner's own calendar, paid bookings locked).
 */
export class SoloApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export async function soloApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: { "X-Certxa-Solo": "1", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SoloApiError(data?.error || data?.message || "Something went wrong. Please try again.", res.status, data?.code);
  return data as T;
}
