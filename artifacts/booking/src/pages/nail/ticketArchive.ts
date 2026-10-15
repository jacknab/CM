/**
 * Every past ticket of the salon, kept on the tablet (the offline store: the app's encrypted SQLite database,
 * or IndexedDB in a browser) so a ticket # can still be looked up — and a paid ticket's receipt opened — with
 * no internet. Server: GET /api/nail/ticket-archive.
 *
 * The first time, the whole archive comes down a page at a time. After that each refresh takes the tickets
 * made since, plus everything made or closed in the last 7 days again (a ticket can be paid, cancelled or
 * refunded after it was made). One entry per ticket number, under `<storeId>:archive:<n>` in the cache, so a
 * sign-out removes it with the rest of what was read from the server.
 */
import { nailOffline } from "@/lib/nail-offline";

export interface ArchivedTicket {
  id: number;
  ticketNumber: number;
  status: string;
  date: string;
  clientName: string;
  service: string;
  staffName: string | null;
  isPaid: boolean;
  receipt: unknown | null;
}
interface Page { tickets: ArchivedTicket[]; lastId: number | null; more: boolean }
interface State { lastId: number; complete: boolean; refreshedAt: number }

const STATE = "archive-state";
const entry = (n: number) => `archive:${n}`;
const RECHECK_DAYS = 7;
const PAGE = 500;
/** Refreshed at most this often (the /nail screen asks on open and every few minutes). */
const MIN_GAP_MS = 10 * 60_000;

async function fetchPage(afterId: number, changedSince: string | null): Promise<Page> {
  const q = new URLSearchParams({ afterId: String(afterId), limit: String(PAGE), ...(changedSince ? { changedSince } : {}) });
  const res = await fetch(`/api/nail/ticket-archive?${q}`, { credentials: "include" });
  if (!res.ok) throw new Error(`ticket archive ${res.status}`);
  return res.json();
}

/** Pages from `afterId` on, each saved as it arrives. Returns the last id seen. */
async function pull(storeId: number, afterId: number, changedSince: string | null, onPage?: (lastId: number) => Promise<void>): Promise<number> {
  let cursor = afterId;
  for (;;) {
    const page = await fetchPage(cursor, changedSince);
    if (page.tickets.length) {
      await nailOffline.rememberMany(storeId, page.tickets.map((t) => ({ url: entry(t.ticketNumber), data: t })));
    }
    if (page.lastId != null) { cursor = page.lastId; await onPage?.(cursor); }
    if (!page.more || page.lastId == null) return cursor;
  }
}

let running: Promise<void> | null = null;

/** Brings this tablet's copy up to date. Never throws: an interrupted first copy carries on next time. */
export function refreshTicketArchive(storeId: number, force = false): Promise<void> {
  return (running ??= (async () => {
    try {
      const state = (await nailOffline.recall<State>(storeId, STATE).catch(() => undefined))?.data
        ?? { lastId: 0, complete: false, refreshedAt: 0 };
      if (!force && state.complete && Date.now() - state.refreshedAt < MIN_GAP_MS) return;
      const save = (s: State) => nailOffline.remember(storeId, STATE, s);
      // New tickets (or the rest of a first copy), saving the cursor after every page.
      const lastId = await pull(storeId, state.lastId, null, (id) => save({ ...state, lastId: id }));
      // The last days again, for tickets that changed after they were first copied.
      if (state.complete) await pull(storeId, 0, new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString());
      await save({ lastId, complete: true, refreshedAt: Date.now() });
    } catch {
      /* no connection or the server refused: kept as it is, tried again later */
    } finally {
      running = null;
    }
  })());
}

/** The ticket with this number from this tablet's copy, if it has it. */
export async function archivedTicket(storeId: number, ticketNumber: number): Promise<ArchivedTicket | null> {
  return (await nailOffline.recall<ArchivedTicket>(storeId, entry(ticketNumber)).catch(() => undefined))?.data ?? null;
}
