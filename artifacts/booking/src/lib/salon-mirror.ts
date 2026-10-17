/**
 * The salon's account on this tablet, kept in sync (plans/salon-local-database.md).
 *
 * Inside the Certxa Android app (database bridge version 2+) every table the salon uses is copied into the app's
 * encrypted database: first a full copy, table by table (progress is saved after every page, so an interrupted
 * copy carries on), then the server's changes after the last one applied — every minute while online and the
 * moment the connection comes back. Offline, screens read the salon's data from here (`mirror*` below).
 * Server: /api/offline/mirror (artifacts/api-server/src/lib/storeMirror.ts). Rows are as the server stores them
 * (snake_case columns), minus the columns that never leave it.
 */
import { hasNativeMirror, sharedNativeSend } from "./nail-offline/nativeKV";
import { syncEngine } from "./sync-engine";

interface Child { table: string; parent: string; fk: string }
interface State {
  /** The first copy is finished. */
  complete: boolean;
  /** Changes after this number have not been applied yet. */
  cursor: number;
  /** First copy: the table it is on, and the last id copied from it. */
  table: number;
  afterId: number;
  tables: string[];
  children: Child[];
  syncedAt: string | null;
}
type Row = Record<string, any> & { id: number | string };
type Changes = { changes: { table: string; id: string; row: Row | null }[]; last: number; more: boolean; resync: boolean };

const send = (request: Record<string, unknown>) => sharedNativeSend()(request);

async function readState(storeId: number): Promise<State | null> {
  const text = await send({ op: "mirrorState", store: storeId });
  try { return typeof text === "string" ? (JSON.parse(text) as State) : null; } catch { return null; }
}

async function apply(storeId: number, p: { upserts?: { tbl: string; row: Row }[]; deletes?: { tbl: string; id: string }[];
  deleteWhere?: { tbl: string; field: string; value: number }[]; state?: State; clear?: boolean }): Promise<void> {
  await send({
    op: "mirrorApply", store: storeId, clear: p.clear ?? false,
    upserts: (p.upserts ?? []).map((u) => ({ tbl: u.tbl, id: String(u.row.id), data: JSON.stringify(u.row) })),
    deletes: p.deletes ?? [], deleteWhere: p.deleteWhere ?? [],
    ...(p.state ? { state: JSON.stringify(p.state) } : {}),
  });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

const running = new Map<number, Promise<void>>();

/** Brings this tablet's copy of the salon up to date. Never throws; does nothing outside the app or offline. */
export function syncSalonMirror(storeId: number): Promise<void> {
  if (!hasNativeMirror() || syncEngine.isOffline()) return Promise.resolve();
  const existing = running.get(storeId);
  if (existing) return existing;
  const run = syncOnce(storeId).catch((err) => console.warn("[salon-mirror] sync stopped:", err?.message ?? err))
    .finally(() => running.delete(storeId));
  running.set(storeId, run);
  return run;
}

async function syncOnce(storeId: number, again = true): Promise<void> {
  let st = await readState(storeId);
  if (!st || !st.complete) {
    if (!st) {
      // A fresh start: note where the server's change log is now, then copy everything.
      const info = await getJson<{ head: number; tables: string[]; children: Child[] }>("/api/offline/mirror/tables");
      st = { complete: false, cursor: info.head, table: 0, afterId: 0, tables: info.tables, children: info.children ?? [], syncedAt: null };
      await apply(storeId, { clear: true, state: st });
    }
    while (st.table < st.tables.length) {
      const tbl = st.tables[st.table];
      const page = await getJson<{ rows: Row[]; lastId: number | null; more: boolean }>(
        `/api/offline/mirror/rows?table=${encodeURIComponent(tbl)}&afterId=${st.afterId}&limit=1000`);
      const next: State = page.more && page.lastId != null ? { ...st, afterId: page.lastId } : { ...st, table: st.table + 1, afterId: 0 };
      await apply(storeId, { upserts: page.rows.map((row) => ({ tbl, row })), state: next });
      st = next;
    }
    st = { ...st, complete: true, syncedAt: new Date().toISOString() };
    await apply(storeId, { state: st });
  }
  // Everything that changed since (rows changed during the first copy are applied again, which is harmless).
  for (;;) {
    const c: Changes = await getJson<Changes>(`/api/offline/mirror/changes?after=${st.cursor}&limit=500`);
    if (c.resync) {
      // Too far behind the server's log: start the copy again.
      await apply(storeId, { clear: true });
      if (again) await syncOnce(storeId, false);
      return;
    }
    const deletes = c.changes.filter((x) => !x.row).map((x) => ({ tbl: x.table, id: String(x.id) }));
    const deleteWhere = deletes.flatMap((d) => st!.children.filter((ch) => ch.parent === d.tbl)
      .map((ch) => ({ tbl: ch.table, field: ch.fk, value: Number(d.id) })));
    st = { ...st, cursor: c.last, syncedAt: new Date().toISOString() };
    await apply(storeId, { upserts: c.changes.filter((x) => x.row).map((x) => ({ tbl: x.table, row: x.row! })), deletes, deleteWhere, state: st });
    if (!c.more) return;
  }
}

/** Keeps the copy in sync while this screen is open: now, every minute, and when the connection comes back. */
export function startSalonMirror(storeId: number): () => void {
  if (!hasNativeMirror()) return () => {};
  void syncSalonMirror(storeId);
  const timer = setInterval(() => void syncSalonMirror(storeId), 60_000);
  const off = syncEngine.registerOnlineHandler(() => syncSalonMirror(storeId));
  return () => { clearInterval(timer); off(); };
}

// ── Reading the copy ──────────────────────────────────────────────────────────────────────────────────────────

const parseAll = (v: unknown): Row[] => (Array.isArray(v) ? v.map((t) => JSON.parse(String(t)) as Row) : []);

/** True when this tablet holds a complete copy of the salon. */
export async function hasSalonMirror(storeId: number): Promise<boolean> {
  if (!hasNativeMirror()) return false;
  return (await readState(storeId).catch(() => null))?.complete === true;
}
export async function mirrorGet(storeId: number, tbl: string, id: number | string): Promise<Row | null> {
  const text = await send({ op: "mirrorGet", store: storeId, tbl, id: String(id) });
  return typeof text === "string" ? (JSON.parse(text) as Row) : null;
}
/** Rows whose `field` equals `value` (fast on customer_id, client_id, appointment_id, staff_id, service_id). */
export async function mirrorFind(storeId: number, tbl: string, field: string, value: string | number, limit = 500): Promise<Row[]> {
  return parseAll(await send({ op: "mirrorFind", store: storeId, tbl, field, value, limit }));
}
export async function mirrorAll(storeId: number, tbl: string): Promise<Row[]> {
  return parseAll(await send({ op: "mirrorAll", store: storeId, tbl }));
}
/** Rows per table, and when the copy last caught up with the server. */
export async function salonMirrorStatus(storeId: number): Promise<{ rows: Record<string, number>; syncedAt: string | null; complete: boolean } | null> {
  if (!hasNativeMirror()) return null;
  const [rows, st] = await Promise.all([send({ op: "mirrorCount", store: storeId }), readState(storeId)]);
  return { rows: (rows as Record<string, number>) ?? {}, syncedAt: st?.syncedAt ?? null, complete: st?.complete === true };
}
