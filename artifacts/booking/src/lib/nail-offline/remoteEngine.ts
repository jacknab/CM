/**
 * One offline POS for the whole salon (owner, 2026-10-28): while the internet is down, the main POS tablet stands in
 * for the server. Another POS station sends its offline work — clients, check-ins, tickets, starts, cancels, edits,
 * cash sales — over the salon hub (lib/local-hub.ts) to the main POS's engine instead of keeping it itself, and reads
 * the tickets from there. So every station shows the same tickets, and only the main POS sends them to the server
 * when the connection is back.
 *
 * If the main POS can't be reached (switched off, out of range), a station works on its own as before: the change
 * is kept on that station and sent from there. A record the station already holds itself is changed there.
 * Online nothing is forwarded — the server is the one place then.
 */
import { localHub } from "../local-hub";
import { NailOffline, type LocalRecord } from "./engine";

const CALL = "hub_engine_call";
const RESULT = "hub_engine_result";
const CHANGED = "hub_engine_changed";
const ANSWER_MS = 6_000;

/** Changes the main POS makes for a station. */
const FORWARDED = ["createClient", "checkIn", "createTicket", "assign", "start", "cancel", "editLocal", "changeServerTicket", "recordCash"] as const;
/** Changes whose first argument is a record id: a record this station holds itself is changed here. */
const BY_RECORD = new Set<string>(["assign", "start", "cancel", "editLocal"]);
/** What the main POS answers. */
const SERVED = new Set<string>([...FORWARDED, "records", "findClients"]);

class HubUnavailable extends Error {}

function ask(method: string, args: unknown[]): Promise<unknown> {
  const requestId = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); off(); fn(); };
    const off = localHub.onMessage((m: any) => {
      if (m?.type !== RESULT || m.requestId !== requestId) return;
      finish(() => (m.ok ? resolve(m.value ?? undefined) : reject(new Error(String(m.error || "The main POS could not do that")))));
    });
    const timer = setTimeout(() => finish(() => reject(new HubUnavailable())), ANSWER_MS);
    if (!localHub.send({ type: CALL, requestId, method, args })) finish(() => reject(new HubUnavailable()));
  });
}

/** On the main POS: do the stations' offline work with this tablet's engine, and tell them when anything changes. */
export function serveEngineOverHub(engine: NailOffline): () => void {
  const off = localHub.onMessage((m: any) => {
    if (m?.type !== CALL || typeof m.requestId !== "string") return;
    const reply = (answer: object) => localHub.send({ type: RESULT, requestId: m.requestId, ...answer });
    const method = String(m.method);
    if (!SERVED.has(method)) { reply({ ok: false, error: "Not something the main POS does for a station" }); return; }
    const fn = (NailOffline.prototype as any)[method] as (...a: unknown[]) => Promise<unknown>;
    void Promise.resolve()
      .then(() => fn.apply(engine, Array.isArray(m.args) ? m.args : []))
      .then((value) => reply({ ok: true, value: value ?? null }), (err) => reply({ ok: false, error: (err as Error)?.message ?? "Failed" }));
  });
  const offChange = engine.onChange(() => localHub.send({ type: CHANGED }));
  return () => { off(); offChange(); };
}

/**
 * On another POS station: forward the engine's offline work to the main POS while `active()` (offline, and linked
 * to it). Returns the function that puts the engine back as it was.
 */
export function forwardEngineOverHub(engine: NailOffline, opts: { active: () => boolean; storeId: () => number | null }): () => void {
  const own = (method: string, args: unknown[]) => ((NailOffline.prototype as any)[method] as (...a: unknown[]) => Promise<unknown>).apply(engine, args);
  const notify = () => (engine as any).changed?.();
  // The main POS's records, kept until it says something changed (or a change is sent from here).
  let cache: { storeId: number; at: number; records: LocalRecord[] } | null = null;
  const holdsHere = async (id: unknown) => {
    const storeId = opts.storeId();
    if (storeId == null || typeof id !== "number") return false;
    return (await engine.localRecords(storeId).catch(() => [])).some((r) => r.id === id);
  };
  const patched: Record<string, unknown> = {};
  for (const method of FORWARDED) {
    patched[method] = async (...args: unknown[]) => {
      if (!opts.active() || (BY_RECORD.has(method) && await holdsHere(args[0]))) return own(method, args);
      try {
        const value = await ask(method, args);
        cache = null;
        notify();
        return value;
      } catch (err) {
        if (err instanceof HubUnavailable) return own(method, args);
        throw err;
      }
    };
  }
  patched.records = async (storeId: number) => {
    const mine = await own("records", [storeId]) as LocalRecord[];
    if (!opts.active()) return mine;
    try {
      if (!cache || cache.storeId !== storeId || Date.now() - cache.at > 15_000) {
        cache = { storeId, at: Date.now(), records: (await ask("records", [storeId]) as LocalRecord[]) ?? [] };
      }
      const theirs = cache.records;
      const ids = new Set(theirs.map((r) => r.id));
      return [...theirs, ...mine.filter((r) => !ids.has(r.id))].sort((a, b) => b.id - a.id);
    } catch {
      return mine;
    }
  };
  patched.findClients = async (storeId: number, query: string) => {
    const mine = await own("findClients", [storeId, query]) as LocalRecord[];
    if (!opts.active()) return mine;
    try {
      const theirs = (await ask("findClients", [storeId, query]) as LocalRecord[]) ?? [];
      const ids = new Set(theirs.map((r) => r.id));
      return [...theirs, ...mine.filter((r) => !ids.has(r.id))];
    } catch {
      return mine;
    }
  };
  Object.assign(engine, patched);
  const off = localHub.onMessage((m: any) => { if (m?.type === CHANGED) { cache = null; if (opts.active()) notify(); } });
  return () => {
    off();
    for (const k of Object.keys(patched)) delete (engine as any)[k];
  };
}
