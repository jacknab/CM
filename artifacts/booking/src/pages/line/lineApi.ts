/**
 * The Online Check-In Line's public API (barbershops and haircut studios; server lib/onlineLineService.ts,
 * plans/online-checkin-line.md). No sign-in: the shop's line by its slug, a client's own spot by its secret token.
 */
export interface PublicLine {
  store: { name: string; slug: string; phone: string | null; address: string | null };
  open: boolean;
  closedReason: string | null;
  acceptingUntil: string | null;
  paused: { reason: string | null; until: string | null } | null;
  waitMin: number | null;
  waitText: string;
  /** "10:40 AM": when someone joining now would likely be called. */
  estimatedAt: string | null;
  ahead: number;
  barbersWorking: number;
  barberChoice: boolean;
  barbers: { id: number; name: string; waitMin: number | null; waitText: string; estimatedAt: string | null }[];
  line: { name: string; ticketNumber: number | null; here: boolean; waitMin: number | null }[];
  inChair: { name: string; barber: string }[];
}

export interface Spot {
  store: { name: string; slug: string; phone: string | null; address: string | null };
  name: string;
  ticketNumber: number | null;
  status: "waiting" | "held" | "up" | "served" | "removed" | "expired";
  removedReason: string | null;
  here: boolean;
  online: boolean;
  position: number | null;
  ahead: number | null;
  waitMin: number | null;
  waitText: string | null;
  estimatedAt: string | null;
  /** The wait promised when they joined: the progress bar runs from it to their turn. */
  promisedMin: number | null;
  heldUntil: string | null;
  barber: string | null;
  party: { name: string; ticketNumber: number | null }[];
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any)?.error || "Something went wrong. Please try again."), { status: res.status });
  return data as T;
}

export const fetchLine = (slug: string) => fetch(`/api/public/line/${encodeURIComponent(slug)}`).then((r) => json<PublicLine>(r));
export const joinLine = (slug: string, body: { names: string[]; phone: string; preferredStaffId: number | null }) =>
  fetch(`/api/public/line/${encodeURIComponent(slug)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => json<{ token: string; tokens: string[] }>(r));
export const fetchSpot = (token: string) => fetch(`/api/public/line/spot/${encodeURIComponent(token)}`).then((r) => json<Spot>(r));
export const imHere = (token: string) => fetch(`/api/public/line/spot/${encodeURIComponent(token)}/here`, { method: "POST" }).then((r) => json<{ ok: boolean }>(r));
export const leaveLine = (token: string) => fetch(`/api/public/line/spot/${encodeURIComponent(token)}/leave`, { method: "POST" }).then((r) => json<{ ok: boolean }>(r));

/** The spot this phone holds at this shop, so coming back to the shop's page shows it. */
const spotKey = (slug: string) => `certxa.line.spot.${slug}`;
export function savedSpot(slug: string): string | null {
  try { return localStorage.getItem(spotKey(slug)); } catch { return null; }
}
export function saveSpot(slug: string, token: string | null): void {
  try { if (token) localStorage.setItem(spotKey(slug), token); else localStorage.removeItem(spotKey(slug)); } catch { /* private window */ }
}

/**
 * Remember me (owner, 2026-11-11; as Great Clips' saved profile, without an account): the name, mobile number and
 * family members from the last check-in on this phone, to fill the form next time. Only on this device.
 */
export type SavedPerson = { names: string[]; phone: string };
const meKey = "certxa.line.me";
export function savedPerson(): SavedPerson | null {
  try { const v = JSON.parse(localStorage.getItem(meKey) ?? "null"); return v && Array.isArray(v.names) ? v : null; } catch { return null; }
}
export function savePerson(p: SavedPerson | null): void {
  try { if (p) localStorage.setItem(meKey, JSON.stringify(p)); else localStorage.removeItem(meKey); } catch { /* private window */ }
}
/** "(303) 860-0900". */
export const prettyPhone = (raw: string) => { const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; };
