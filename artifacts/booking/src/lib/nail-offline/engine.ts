/**
 * The /nail screen's offline engine: what staff do while the server cannot be reached is saved on the
 * device first, shown on the board from there, and sent when the connection is back.
 *
 * Three rules it never breaks:
 *  1. Nothing is reported as saved until the device has it. Every action writes its record AND its queued
 *     operation in one `batch`, so the two cannot disagree after a crash.
 *  2. Every queued operation has one idempotency key for life. The server keeps the first answer against
 *     that key (api-server lib/idempotency.ts), so sending it again — after a lost reply, an app restart or
 *     a server restart — never makes a second client, check-in or ticket.
 *  3. Nothing is thrown away by itself. An operation the server refuses stays in the queue marked
 *     "attention" with the reason, until a person retries or discards it. No reply, a server error and an
 *     expired sign-in are not refusals: the operation simply waits.
 *
 * Money is out of scope here on purpose: a ticket can be made, given to a technician and started offline,
 * but it is paid for only once it has reached the server.
 */
import type { KV, Write } from "./store";

// ── What is kept ──────────────────────────────────────────────────────────────
/** A client or check-in the server already knows (a real id) or one made on this device (a local id, negative). */
export const isLocalId = (id: number | null | undefined): id is number => typeof id === "number" && id < 0;

export interface ClientRecord { kind: "client"; id: number; storeId: number; name: string; phone: string; realId?: number; createdAt: string }
export interface WalkinRecord {
  kind: "walkin"; id: number; storeId: number; clientId: number; clientName: string; phone: string | null;
  status: "waiting" | "ticketed"; realId?: number | null; synced?: boolean; createdAt: string;
  /** The number given on this device; the server keeps it when it is still free. */
  ticketNumber?: number | null;
  /** When the server confirmed it. From then on the server's board decides whether it is still waiting. */
  syncedAt?: string;
}
export interface TicketLine { id: number; name: string; price: number; duration: number }
export interface TicketRecord {
  kind: "ticket"; id: number; storeId: number;
  clientId: number; clientName: string; phone: string | null; walkinId: number | null;
  service: { id: number; name: string; price: number; duration: number };
  addons: TicketLine[];
  /** The nail choice as the server takes it, plus what to show for it. */
  nail: Record<string, number | null> | null; nailLines: { label: string; price: number }[]; nailPriceAdjustment: number;
  customLines: { label: string; price: number; isRetail?: boolean; serviceId?: number; duration?: number }[];
  staff: { id: number; name: string; color: string | null } | null;
  status: "confirmed" | "started";
  startedAt: string | null;
  total: number; duration: number;
  realId?: number; ticketNumber?: number | null; createdAt: string;
  /** When the server confirmed it. From then on the server's board decides whether it is still open. */
  syncedAt?: string;
  /** The technician was picked on this device from the last known turn line, not by the server. */
  assignedOffline?: boolean;
  /** Cash taken for it on this device (see `recordCash`). `synced` only once the server has confirmed the sale. */
  paid?: CashPayment;
}

/** A cash sale closed on this device. The full checkout request is kept, to be sent unchanged under its own key. */
export interface CashPayment { at: string; totalPaid: number; cash: number; tip: number; synced?: boolean; request: Record<string, unknown> }

/**
 * Changes made on this device to a ticket the SERVER already has (it came down on the board), while the
 * server could not be reached: started, given to someone else, edited, cancelled, or paid in cash.
 */
export interface PatchRecord {
  kind: "patch"; id: number; storeId: number; ticketId: number;
  clientName: string;
  /** What the server's ticket looked like to this device when it first changed it. Sent with each change, so
   *  the server can refuse it if another device has moved the ticket on since (lib: STATUS_CONFLICT, reassign 409). */
  seen?: { status?: string; staffId?: number | null };
  status?: "started" | "cancelled"; startedAt?: string | null;
  staff?: TicketRecord["staff"];
  /** The edited contents as shown, and as sent. */
  edit?: { view: Record<string, unknown>; body: Record<string, unknown> };
  paid?: CashPayment;
  createdAt: string;
}
export type LocalRecord = ClientRecord | WalkinRecord | TicketRecord | PatchRecord;

export type OpType = "client.create" | "walkin.create" | "ticket.create" | "ticket.start"
  | "ticket.update" | "ticket.reassign" | "ticket.cancel" | "ticket.checkout";
export interface Op {
  id: string; seq: number; storeId: number; type: OpType;
  /** The record this operation is about. */
  recordId: number;
  idempotencyKey: string;
  state: "pending" | "attention" | "done";
  attempts: number; lastError?: string; createdAt: string; doneAt?: string;
  /** For an operation refused because the server's copy had changed meanwhile (another device got there first). */
  conflict?: boolean;
}

/** What the queue holds, for the status indicator. `cash`: cash taken on this device that the server has not confirmed. */
export interface QueueCounts { pending: number; attention: number; cash: { count: number; amount: number } }

// ── Talking to the server ─────────────────────────────────────────────────────
export interface Reply { status: number; body: any }
/** Throws `Unreachable` when there was no answer at all (no network, DNS, timeout). */
export interface Transport { send(method: "GET" | "POST" | "PATCH" | "PUT", url: string, body?: unknown, idempotencyKey?: string): Promise<Reply> }
export class Unreachable extends Error { constructor(detail = "The server could not be reached") { super(detail); this.name = "Unreachable"; } }

export interface SyncResult {
  /** Operations confirmed by the server in this pass. */
  synced: number;
  /** Why the pass stopped early, if it did. Everything not sent is still queued. */
  stopped: null | "unreachable" | "sign-in" | "server";
  pending: number; attention: number;
}

export const newIdempotencyKey = (type: string) => `nail-${type}-${rid()}`;
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
const recKey = (id: number) => `r:${id}`;

/** Why the device could not save: its storage is full, or it cannot be opened at all. */
export interface StorageProblem { kind: "full" | "unavailable"; detail: string; at: string }
const storageProblemOf = (err: unknown, at: string): StorageProblem => {
  const name = (err as any)?.name ?? "";
  const detail = String((err as any)?.message ?? err ?? "unknown error");
  return { kind: name === "QuotaExceededError" || /quota|full|space/i.test(detail) ? "full" : "unavailable", detail, at };
};

export class NailOffline {
  private listeners = new Set<() => void>();
  private syncing: Promise<SyncResult> | null = null;
  private problem: StorageProblem | null = null;

  /**
   * Set when the device refused to save something. The action that was being saved FAILED and said so — it
   * was never reported as saved — and nothing already on the device was touched. Nothing is ever cleared to
   * "fix" this: what is stored stays until it has been sent.
   */
  storageProblem(): StorageProblem | null { return this.problem; }

  /** Can this device save and read back right now? Writes a tiny marker, reads it, removes it. */
  async health(): Promise<{ ok: true } | { ok: false; problem: StorageProblem }> {
    const stamp = this.now().toISOString();
    try {
      await this.kv.batch([{ store: "meta", key: "health", value: stamp }]);
      const back = await this.kv.get<string>("meta", "health");
      if (back !== stamp) throw new Error("What was saved could not be read back");
      await this.kv.batch([{ store: "meta", key: "health", value: undefined }]);
      if (this.problem) { this.problem = null; this.changed(); }
      return { ok: true };
    } catch (err) {
      this.problem = storageProblemOf(err, stamp);
      this.changed();
      return { ok: false, problem: this.problem };
    }
  }
  constructor(private kv: KV, private deviceNow: () => Date = () => new Date()) {}

  /** How far the server's clock is from this device's, as last measured while online. Times recorded here
   *  are written in the server's time, so a timer started offline reads the same as one started online. */
  private clockOffsetMs = 0;
  setClockOffset(ms: number): void { if (Number.isFinite(ms)) this.clockOffsetMs = ms; }
  private now = (): Date => new Date(this.deviceNow().getTime() + this.clockOffsetMs);

  /**
   * The highest ticket number the server is known to have used for a salon. Told to the device whenever
   * a live board arrives, so numbering can carry on from there while offline.
   */
  async noteTicketNumbers(storeId: number, highestUsed: number): Promise<void> {
    if (!Number.isInteger(highestUsed) || highestUsed < 0) return;
    const key = `ticketNumber:${storeId}`;
    const known = (await this.kv.get<number>("meta", key)) ?? 0;
    if (highestUsed > known) await this.kv.batch([{ store: "meta", key, value: highestUsed }]);
  }
  /**
   * Ticket numbers given while the internet is down are printed on the client's slip and receipt, so each one
   * must be the ticket's number for good: unique across the salon's tablets, and never one the server gives
   * out meanwhile (online bookings keep taking numbers during an outage).
   *  - One tablet gives them out: the main POS (the hub). Other POS stations ask it over the salon's Wi-Fi
   *    (`setTicketNumberSource`); with no answer a ticket gets no number until it is sent.
   *  - They start OFFLINE_NUMBER_GAP above the last number the server was seen to use, leaving room for that
   *    many online bookings during the outage; the server keeps the number it is sent (claimTicketNumber).
   */
  static readonly OFFLINE_NUMBER_GAP = 50;
  private numberSource: ((storeId: number) => Promise<number | null>) | null = null;
  private numberLock: Promise<unknown> = Promise.resolve();
  /** A POS station that is not the main one: its offline numbers come from the main POS. Null: this tablet gives them out. */
  setTicketNumberSource(source: ((storeId: number) => Promise<number | null>) | null): void { this.numberSource = source; }
  /**
   * The main POS: the next offline ticket number, for this tablet or one asking over the hub. Null when the
   * salon's numbering has never been seen here. One at a time, saved at once, so two requests never share one.
   */
  issueTicketNumber(storeId: number): Promise<number | null> {
    const run = this.numberLock.then(async () => {
      const known = await this.kv.get<number>("meta", `ticketNumber:${storeId}`);
      if (known == null) return null;
      const lastKey = `ticketNumberOffline:${storeId}`;
      const last = (await this.kv.get<number>("meta", lastKey)) ?? 0;
      const n = Math.max(last + 1, known + NailOffline.OFFLINE_NUMBER_GAP);
      await this.kv.batch([{ store: "meta", key: lastKey, value: n }]);
      return n;
    });
    this.numberLock = run.catch(() => undefined);
    return run;
  }
  /** The next ticket number for a client served on this device while offline (see above). */
  private async takeTicketNumber(storeId: number, _writes: Write[]): Promise<number | null> {
    if (this.numberSource) return this.numberSource(storeId).catch(() => null);
    return this.issueTicketNumber(storeId);
  }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.listeners.forEach((fn) => { try { fn(); } catch { /* a listener must not break saving */ } }); }

  // ── Reads kept from the last time the server answered ──
  async remember(storeId: number, url: string, data: unknown): Promise<void> {
    await this.kv.batch([{ store: "cache", key: `${storeId}:${url}`, value: { data, at: this.now().toISOString() } }]);
  }
  /** Several reads kept in one write (the ticket archive comes down a page at a time). */
  async rememberMany(storeId: number, entries: ReadonlyArray<{ url: string; data: unknown }>): Promise<void> {
    const at = this.now().toISOString();
    await this.kv.batch(entries.map((e) => ({ store: "cache" as const, key: `${storeId}:${e.url}`, value: { data: e.data, at } })));
  }
  async recall<T>(storeId: number, url: string): Promise<{ data: T; at: string } | undefined> {
    return this.kv.get(`cache` as const, `${storeId}:${url}`);
  }

  // ── What staff do offline ──
  private async next(writes: Write[]): Promise<{ id: number; seq: number }> {
    const n = ((await this.kv.get<number>("meta", "counter")) ?? 0) + 1;
    writes.push({ store: "meta", key: "counter", value: n });
    return { id: -n, seq: n };
  }
  /** `key`: when the same request was already tried online and got no answer, its key is reused here, so
   *  the server still sees one request however it finally arrives. */
  private op(seq: number, storeId: number, type: OpType, recordId: number, key?: string): Op {
    return { id: rid(), seq, storeId, type, recordId, idempotencyKey: key ?? newIdempotencyKey(type), state: "pending", attempts: 0, createdAt: this.now().toISOString() };
  }
  private async commit(writes: Write[]): Promise<void> {
    try {
      await this.kv.batch(writes);
    } catch (err) {
      // The whole batch failed together, so nothing is half-saved. Say why, and let the caller's action fail.
      this.problem = storageProblemOf(err, this.now().toISOString());
      this.changed();
      throw new Error(this.problem.kind === "full"
        ? "This tablet's storage is full, so this was NOT saved. Nothing already saved was lost."
        : "This tablet could not save this. Nothing already saved was lost.");
    }
    this.changed();
  }

  async createClient(storeId: number, name: string, phone: string, key?: string): Promise<ClientRecord> {
    const writes: Write[] = [];
    const { id, seq } = await this.next(writes);
    const rec: ClientRecord = { kind: "client", id, storeId, name: name.trim(), phone: phone.replace(/\D/g, "").slice(-10), createdAt: this.now().toISOString() };
    const op = this.op(seq, storeId, "client.create", id, key);
    writes.push({ store: "records", key: recKey(id), value: rec }, { store: "ops", key: op.id, value: op });
    await this.commit(writes);
    return rec;
  }

  /** A walk-in: the client is here and waiting. One open walk-in per client. */
  async checkIn(storeId: number, client: { id: number; name: string; phone: string | null }, key?: string): Promise<{ walkin: WalkinRecord; already: boolean }> {
    const open = (await this.records(storeId)).find((r): r is WalkinRecord => r.kind === "walkin" && r.clientId === client.id && r.status === "waiting" && !r.synced);
    if (open) return { walkin: open, already: true };
    const writes: Write[] = [];
    const { id, seq } = await this.next(writes);
    const rec: WalkinRecord = { kind: "walkin", id, storeId, clientId: client.id, clientName: client.name, phone: client.phone, status: "waiting", createdAt: this.now().toISOString(),
      ticketNumber: await this.takeTicketNumber(storeId, writes) };
    const op = this.op(seq, storeId, "walkin.create", id, key);
    writes.push({ store: "records", key: recKey(id), value: rec }, { store: "ops", key: op.id, value: op });
    await this.commit(writes);
    return { walkin: rec, already: false };
  }

  async createTicket(input: Omit<TicketRecord, "kind" | "id" | "status" | "startedAt" | "createdAt" | "realId" | "ticketNumber"> & { ticketNumber?: number | null }, key?: string): Promise<TicketRecord> {
    const writes: Write[] = [];
    const { id, seq } = await this.next(writes);
    // A client who checked in keeps the number from their check-in; anyone else takes the next one.
    let ticketNumber: number | null = input.ticketNumber ?? null;
    if (ticketNumber == null && input.walkinId != null && isLocalId(input.walkinId)) {
      const w = await this.kv.get<WalkinRecord>("records", recKey(input.walkinId));
      if (w?.kind === "walkin") ticketNumber = w.ticketNumber ?? null;
    }
    if (ticketNumber == null) ticketNumber = await this.takeTicketNumber(input.storeId, writes);
    const rec: TicketRecord = { ...input, kind: "ticket", id, status: "confirmed", startedAt: null, createdAt: this.now().toISOString(), ticketNumber };
    const op = this.op(seq, input.storeId, "ticket.create", id, key);
    writes.push({ store: "records", key: recKey(id), value: rec }, { store: "ops", key: op.id, value: op });
    // The walk-in it came from (made here, or still only on this device) is now this ticket.
    if (input.walkinId != null && isLocalId(input.walkinId)) {
      const w = await this.kv.get<WalkinRecord>("records", recKey(input.walkinId));
      if (w?.kind === "walkin") writes.push({ store: "records", key: recKey(w.id), value: { ...w, status: "ticketed" } });
    }
    await this.commit(writes);
    return rec;
  }

  private async localTicket(id: number): Promise<TicketRecord> {
    const t = await this.kv.get<LocalRecord>("records", recKey(id));
    if (!t || t.kind !== "ticket") throw new Error("That ticket is not on this device");
    return t;
  }

  /** Give a ticket made on this device to a technician (or back to "whoever is next" with null). */
  async assign(ticketId: number, staff: TicketRecord["staff"]): Promise<TicketRecord> {
    const t = await this.localTicket(ticketId);
    if (t.realId) throw new Error("This ticket has already been sent — change its technician once the connection is back");
    const next = { ...t, staff };
    await this.commit([{ store: "records", key: recKey(t.id), value: next }]);
    return next;
  }

  async start(ticketId: number): Promise<TicketRecord> {
    const t = await this.localTicket(ticketId);
    if (t.status === "started") return t;
    const writes: Write[] = [];
    const { seq } = await this.next(writes);
    const next: TicketRecord = { ...t, status: "started", startedAt: this.now().toISOString() };
    const op = this.op(seq, t.storeId, "ticket.start", t.id);
    writes.push({ store: "records", key: recKey(t.id), value: next }, { store: "ops", key: op.id, value: op });
    await this.commit(writes);
    return next;
  }

  /** Take back something made on this device that the server has not been told about yet. */
  async cancel(recordId: number): Promise<void> {
    const rec = await this.kv.get<LocalRecord>("records", recKey(recordId));
    if (!rec) return;
    const ops = await this.ops(rec.storeId);
    const mine = ops.filter((o) => o.recordId === recordId);
    if (mine.some((o) => o.state === "done" && o.type !== "ticket.start")) throw new Error("This has already been sent — cancel it once the connection is back");
    if ((rec.kind === "ticket" || rec.kind === "patch") && rec.paid) throw new Error("This ticket has been paid in cash and cannot be cancelled here");
    const writes: Write[] = [{ store: "records", key: recKey(recordId), value: undefined }, ...mine.map((o) => ({ store: "ops" as const, key: o.id, value: undefined }))];
    // A cancelled ticket gives its walk-in back to the waiting list.
    if (rec.kind === "ticket" && rec.walkinId != null && isLocalId(rec.walkinId)) {
      const w = await this.kv.get<WalkinRecord>("records", recKey(rec.walkinId));
      if (w?.kind === "walkin") writes.push({ store: "records", key: recKey(w.id), value: { ...w, status: "waiting" } });
    }
    await this.commit(writes);
  }

  /** Change what is on a ticket that only exists on this device (line items, prices, total). */
  async editLocal(ticketId: number, changes: Partial<Pick<TicketRecord, "service" | "addons" | "nail" | "nailLines" | "nailPriceAdjustment" | "customLines" | "total" | "duration">>): Promise<TicketRecord> {
    const t = await this.localTicket(ticketId);
    if (t.realId) throw new Error("This ticket has already been sent");
    if (t.paid) throw new Error("This ticket has already been paid");
    const next = { ...t, ...changes };
    await this.commit([{ store: "records", key: recKey(t.id), value: next }]);
    return next;
  }

  private async patchFor(storeId: number, ticketId: number, clientName: string, writes: Write[]): Promise<PatchRecord> {
    const existing = (await this.records(storeId)).find((r): r is PatchRecord => r.kind === "patch" && r.ticketId === ticketId);
    if (existing) return existing;
    const { id } = await this.next(writes);
    return { kind: "patch", id, storeId, ticketId, clientName, createdAt: this.now().toISOString() };
  }

  /**
   * A change to a ticket the server already has, made while it could not be reached. Kept on the device, shown
   * on the board from there, and sent in order. If the server's copy changed meanwhile, the server refuses it
   * and it is held for staff attention — it is never merged over someone else's change.
   */
  async changeServerTicket(storeId: number, ticket: { id: number; clientName: string; status?: string; staffId?: number | null }, change:
    | { type: "start" }
    | { type: "cancel" }
    | { type: "reassign"; staff: NonNullable<TicketRecord["staff"]> }
    | { type: "update"; view: Record<string, unknown>; body: Record<string, unknown> }): Promise<PatchRecord> {
    const writes: Write[] = [];
    const first = await this.patchFor(storeId, ticket.id, ticket.clientName, writes);
    if (first.paid) throw new Error("This ticket has already been paid");
    // Remembered once, from the first change: later changes on this device build on that same starting point.
    const base: PatchRecord = first.seen || (ticket.status === undefined && ticket.staffId === undefined) ? first
      : { ...first, seen: { ...(ticket.status !== undefined ? { status: ticket.status } : {}), ...(ticket.staffId !== undefined ? { staffId: ticket.staffId } : {}) } };
    const { seq } = await this.next(writes);
    const next: PatchRecord =
      change.type === "start" ? { ...base, status: "started", startedAt: this.now().toISOString() }
      : change.type === "cancel" ? { ...base, status: "cancelled" }
      : change.type === "reassign" ? { ...base, staff: change.staff }
      : { ...base, edit: { view: change.view, body: change.body } };
    const op = this.op(seq, storeId, change.type === "start" ? "ticket.start" : change.type === "cancel" ? "ticket.cancel" : change.type === "reassign" ? "ticket.reassign" : "ticket.update", base.id);
    // Only the latest edit of a ticket needs sending: an earlier unsent one is replaced, not sent twice.
    const stale = change.type === "update" || change.type === "reassign"
      ? (await this.ops(storeId)).filter((o) => o.recordId === base.id && o.type === op.type && o.state === "pending") : [];
    writes.push({ store: "records", key: recKey(base.id), value: next }, { store: "ops", key: op.id, value: op },
      ...stale.map((o) => ({ store: "ops" as const, key: o.id, value: undefined })));
    await this.commit(writes);
    return next;
  }

  /**
   * Cash taken while the server cannot be reached. The whole checkout request is saved with its own
   * idempotency key and sent unchanged later, so the sale closes on the server exactly once however many
   * times it is retried. Until the server confirms it, it counts as cash awaiting reconciliation.
   * `target`: a ticket made on this device (negative id) or one the server already has.
   */
  async recordCash(storeId: number, target: { id: number; clientName: string }, payment: { totalPaid: number; cash: number; tip: number; request: Record<string, unknown>; idempotencyKey: string }): Promise<CashPayment> {
    const writes: Write[] = [];
    const rec: TicketRecord | PatchRecord = isLocalId(target.id) ? await this.localTicket(target.id) : await this.patchFor(storeId, target.id, target.clientName, writes);
    // Paid once: a second tap, or the same request arriving again, changes nothing.
    if (rec.paid) return rec.paid;
    if (rec.kind === "patch" && rec.status === "cancelled") throw new Error("This ticket was cancelled");
    const { seq } = await this.next(writes);
    const paid: CashPayment = { at: this.now().toISOString(), totalPaid: payment.totalPaid, cash: payment.cash, tip: payment.tip, request: payment.request };
    const op = this.op(seq, storeId, "ticket.checkout", rec.id, payment.idempotencyKey);
    writes.push({ store: "records", key: recKey(rec.id), value: { ...rec, paid } }, { store: "ops", key: op.id, value: op });
    await this.commit(writes);
    return paid;
  }

  /** A refused ticket whose technician was the problem: send it again and let the turn line decide. */
  async sendWithoutTechnician(opId: string): Promise<void> {
    const op = await this.kv.get<Op>("ops", opId);
    if (!op || op.type !== "ticket.create") return;
    const t = await this.kv.get<LocalRecord>("records", recKey(op.recordId));
    if (!t || t.kind !== "ticket") return;
    await this.commit([
      { store: "records", key: recKey(t.id), value: { ...t, staff: null, assignedOffline: false } },
      { store: "ops", key: op.id, value: { ...op, state: "pending", lastError: undefined, conflict: false } },
    ]);
  }

  // ── Looking at what is on the device ──
  async records(storeId: number): Promise<LocalRecord[]> {
    return (await this.kv.getAll<LocalRecord>("records")).filter((r) => r.storeId === storeId).sort((a, b) => b.id - a.id);
  }
  async ops(storeId?: number): Promise<Op[]> {
    return (await this.kv.getAll<Op>("ops")).filter((o) => storeId == null || o.storeId === storeId).sort((a, b) => a.seq - b.seq);
  }
  async counts(storeId?: number): Promise<QueueCounts> {
    const ops = await this.ops(storeId);
    const open = ops.filter((o) => o.state !== "done");
    const cashOps = open.filter((o) => o.type === "ticket.checkout");
    let amount = 0;
    for (const o of cashOps) {
      const r = await this.kv.get<LocalRecord>("records", recKey(o.recordId));
      if (r && (r.kind === "ticket" || r.kind === "patch")) amount += r.paid?.cash ?? 0;
    }
    return { pending: open.filter((o) => o.state === "pending").length, attention: open.filter((o) => o.state === "attention").length,
      cash: { count: cashOps.length, amount: Math.round(amount * 100) / 100 } };
  }
  /** Clients made or seen on this device, by name or phone digits. */
  async findClients(storeId: number, query: string): Promise<ClientRecord[]> {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!q) return [];
    return (await this.records(storeId)).filter((r): r is ClientRecord => r.kind === "client" &&
      (r.name.toLowerCase().includes(q) || (digits.length >= 3 && r.phone.includes(digits))));
  }

  // ── A refused operation: try again, or give it up ──
  async retry(opId: string): Promise<void> {
    const op = await this.kv.get<Op>("ops", opId);
    if (!op || op.state !== "attention") return;
    await this.commit([{ store: "ops", key: op.id, value: { ...op, state: "pending", lastError: undefined } }]);
  }
  /** Give up on a refused operation: it, its record and anything that was waiting on that record go. */
  async discard(opId: string): Promise<void> {
    const op = await this.kv.get<Op>("ops", opId);
    if (!op) return;
    const all = await this.ops(op.storeId);
    const recs = await this.records(op.storeId);
    const gone = new Set<number>([op.recordId]);
    // Tickets and walk-ins of a client that will never exist, tickets of a walk-in that won't.
    for (let grew = true; grew;) {
      grew = false;
      for (const r of recs) {
        if (gone.has(r.id) || r.kind === "patch" || r.realId) continue;
        const dependsOn = r.kind === "walkin" || r.kind === "ticket" ? [r.clientId] : [];
        if (dependsOn.some((d) => gone.has(d))) { gone.add(r.id); grew = true; }
      }
    }
    await this.commit([
      ...[...gone].map((id) => ({ store: "records" as const, key: recKey(id), value: undefined })),
      ...all.filter((o) => gone.has(o.recordId)).map((o) => ({ store: "ops" as const, key: o.id, value: undefined })),
    ]);
  }

  // ── Sending it ──
  /**
   * One pass over the queue, oldest first. Safe to call as often as you like; overlapping calls share one pass.
   * `storeId`: the salon the device is signed in to. Only that salon's changes are sent — work saved for
   * another salon stays on the device, untouched, until that salon is signed in again. It is never sent
   * under someone else's sign-in.
   */
  sync(transport: Transport, storeId?: number): Promise<SyncResult> {
    this.syncing ??= this.pass(transport, storeId).finally(() => { this.syncing = null; });
    return this.syncing;
  }

  /** When this salon's queue last went through to the server with nothing left waiting on a refusal of sign-in or network. */
  async lastSyncAt(storeId: number): Promise<string | null> { return (await this.kv.get<string>("meta", `lastSync:${storeId}`)) ?? null; }

  /** Changes saved on this device for a salon other than the one signed in. */
  async heldForOtherSalons(storeId: number): Promise<number> {
    return (await this.ops()).filter((o) => o.storeId !== storeId && o.state !== "done").length;
  }

  /**
   * Signing out (or handing the tablet to another salon). What was read from the server — the board, client
   * names, the turn line — is removed from the device. Work not yet sent is KEPT: it is the only copy.
   * A salon with nothing left to send has its local records removed as well.
   */
  async onSignOut(storeId?: number): Promise<void> {
    const cacheKeys = await this.kv.keys("cache");
    const writes: Write[] = cacheKeys.filter((k) => storeId == null || k.startsWith(`${storeId}:`)).map((k) => ({ store: "cache" as const, key: k, value: undefined }));
    const ops = await this.ops();
    const stillOwed = new Set(ops.filter((o) => o.state !== "done").map((o) => o.storeId));
    for (const r of await this.kv.getAll<LocalRecord>("records")) {
      if ((storeId == null || r.storeId === storeId) && !stillOwed.has(r.storeId)) writes.push({ store: "records", key: recKey(r.id), value: undefined });
    }
    for (const o of ops) if ((storeId == null || o.storeId === storeId) && !stillOwed.has(o.storeId)) writes.push({ store: "ops", key: o.id, value: undefined });
    if (writes.length) await this.commit(writes);
  }

  private async pass(transport: Transport, storeId?: number): Promise<SyncResult> {
    let synced = 0;
    let stopped: SyncResult["stopped"] = null;
    const realOf = async (id: number): Promise<number | undefined> => {
      if (!isLocalId(id)) return id;
      const r = await this.kv.get<LocalRecord>("records", recKey(id));
      return r && r.kind !== "patch" ? r.realId ?? undefined : undefined;
    };

    for (const queued of await this.ops(storeId)) {
      if (queued.state !== "pending") continue;
      const op = queued;
      const rec = await this.kv.get<LocalRecord>("records", recKey(op.recordId));
      if (!rec) { await this.kv.batch([{ store: "ops", key: op.id, value: undefined }]); continue; }

      try {
        // What it depends on must have reached the server first; otherwise it waits its turn (not a failure).
        let reply: Reply;
        let patch: Partial<LocalRecord> = {};
        if (op.type === "client.create" && rec.kind === "client") {
          reply = await transport.send("POST", "/api/customers", { name: rec.name, phone: rec.phone, storeId: rec.storeId }, op.idempotencyKey);
          if (reply.status === 409 && reply.body?.code === "PHONE_DUPLICATE") {
            // The number already belongs to a client (made on another tablet meanwhile): that is this client.
            const found = await transport.send("GET", `/api/customers/search?phone=${encodeURIComponent(rec.phone)}&storeId=${rec.storeId}`);
            const hit = Array.isArray(found.body) ? found.body[0] : found.body;
            if (found.status === 200 && hit?.id) reply = { status: 200, body: { id: hit.id } };
          }
          if (reply.status < 300) patch = { realId: Number(reply.body.id) };
        } else if (op.type === "walkin.create" && rec.kind === "walkin") {
          const clientId = await realOf(rec.clientId);
          if (!clientId) continue;
          reply = await transport.send("POST", "/api/nail/checkin", { clientId, ...(rec.ticketNumber ? { ticketNumber: rec.ticketNumber } : {}) }, op.idempotencyKey);
          // "already" / "appointment": the server has them checked in another way — just as good.
          if (reply.status < 300) patch = { realId: reply.body?.checkin?.id ?? null, synced: true, syncedAt: this.now().toISOString(),
            ticketNumber: reply.body?.checkin?.ticketNumber ?? rec.ticketNumber ?? null } as Partial<WalkinRecord>;
        } else if (op.type === "ticket.create" && rec.kind === "ticket") {
          const clientId = await realOf(rec.clientId);
          if (!clientId) continue;
          let checkinId: number | null = null;
          if (rec.walkinId != null) {
            if (!isLocalId(rec.walkinId)) checkinId = rec.walkinId;
            else {
              const w = await this.kv.get<WalkinRecord>("records", recKey(rec.walkinId));
              if (w && !w.synced) continue; // its walk-in goes first
              checkinId = w?.realId ?? null;
            }
          }
          const body = (cid: number | null) => ({
            clientId, serviceId: rec.service.id, addonIds: rec.addons.map((a) => a.id), nail: rec.nail, customLines: rec.customLines,
            staffId: rec.staff?.id ?? null, autoAssign: rec.staff == null, leaveUnassigned: false, checkinId: cid,
            // The number given on this device: the server keeps it when no other tablet has used it.
            ...(rec.ticketNumber ? { ticketNumber: rec.ticketNumber } : {}),
          });
          reply = await transport.send("POST", "/api/nail/tickets", body(checkinId), op.idempotencyKey);
          // The check-in was turned into a ticket some other way meanwhile: the ticket still stands on its own.
          if (reply.status === 409 && checkinId != null && /check-in was already used/i.test(String(reply.body?.message ?? ""))) {
            reply = await transport.send("POST", "/api/nail/tickets", body(null), op.idempotencyKey);
          }
          if (reply.status < 300) patch = { realId: Number(reply.body.appointmentId), syncedAt: this.now().toISOString(), ticketNumber: reply.body.ticketNumber ?? null,
            staff: reply.body.staffId ? { id: reply.body.staffId, name: reply.body.staffName ?? rec.staff?.name ?? "", color: rec.staff?.color ?? null } : null } as Partial<TicketRecord>;
        } else if (rec.kind === "ticket" || rec.kind === "patch") {
          // Everything else acts on a ticket the server must already have: one made here waits for its own create.
          const ticketId = rec.kind === "patch" ? rec.ticketId : rec.realId;
          if (!ticketId) continue;
          // What this device believed the server's ticket to be when it made the change. A ticket made here
          // was "waiting" when it reached the server; one already there is as this device first saw it.
          const seenStatus = rec.kind === "patch" ? rec.seen?.status : "confirmed";
          if (op.type === "ticket.start") {
            reply = await transport.send("PATCH", `/api/appointments/${ticketId}`, { status: "started", ...(seenStatus ? { expectedStatus: seenStatus } : {}) });
            if (reply.status < 300 && rec.kind === "patch") patch = { seen: { ...rec.seen, status: "started" } } as Partial<PatchRecord>;
          } else if (op.type === "ticket.cancel") {
            // If this device started it first, the server's copy is "started" by the time the cancel arrives.
            const expected = rec.startedAt ? "started" : seenStatus;
            reply = await transport.send("PATCH", `/api/appointments/${ticketId}`, { status: "cancelled", cancellationReason: "Cancelled at check-in", calendarHidden: true, ...(expected ? { expectedStatus: expected } : {}) });
          } else if (op.type === "ticket.reassign" && rec.kind === "patch" && rec.staff) {
            const knows = rec.seen && "staffId" in rec.seen;
            reply = await transport.send("POST", `/api/nail/tickets/${ticketId}/reassign`, { staffId: rec.staff.id, ...(knows ? { expectedStaffId: rec.seen!.staffId ?? null } : {}) });
            // From here on, the server's copy is with the technician this device chose.
            if (reply.status < 300) patch = { seen: { ...rec.seen, staffId: rec.staff.id } } as Partial<PatchRecord>;
          } else if (op.type === "ticket.update" && rec.kind === "patch" && rec.edit) {
            reply = await transport.send("PUT", `/api/nail/tickets/${ticketId}`, rec.edit.body);
          } else if (op.type === "ticket.checkout" && rec.paid) {
            // `collectedAt`: when the cash was actually taken, so the sale lands in the drawer shift it belongs to.
            reply = await transport.send("POST", "/api/nail/checkout", { ...rec.paid.request, appointmentId: ticketId, collectedAt: rec.paid.at }, op.idempotencyKey);
            if (reply.status < 300) patch = { paid: { ...rec.paid, synced: true } } as Partial<TicketRecord>;
          } else {
            reply = { status: 400, body: { message: "This saved change no longer matches anything on the device" } };
          }
        } else {
          reply = { status: 400, body: { message: "This saved change no longer matches anything on the device" } };
        }

        if (reply.status >= 200 && reply.status < 300) {
          await this.kv.batch([
            { store: "records", key: recKey(rec.id), value: { ...rec, ...patch } },
            { store: "ops", key: op.id, value: { ...op, state: "done", attempts: op.attempts + 1, lastError: undefined, doneAt: this.now().toISOString() } },
          ]);
          synced += 1;
          this.changed();
          continue;
        }
        // Signed out: nothing is wrong with the work. Keep it all and stop until someone is signed in again.
        if (reply.status === 401) { stopped = "sign-in"; break; }
        // The server is busy, restarting or still answering an earlier copy of this request: wait and resend.
        if (reply.status >= 500 || reply.status === 429 || (reply.status === 409 && reply.body?.code === "REQUEST_IN_PROGRESS")) {
          await this.kv.batch([{ store: "ops", key: op.id, value: { ...op, attempts: op.attempts + 1, lastError: `Server answered ${reply.status}` } }]);
          stopped = "server";
          break;
        }
        // A real refusal: a person has to look at it. It stays in the queue until they retry or discard it.
        // 404 / 409 here mean the server's copy is not what this device last saw: someone else changed it.
        // The local change and its record both stay exactly as they are; the server's state is untouched.
        await this.kv.batch([{ store: "ops", key: op.id, value: { ...op, state: "attention", attempts: op.attempts + 1,
          conflict: reply.status === 409 || reply.status === 404,
          lastError: String(reply.body?.message || reply.body?.error || `The server refused this (${reply.status})`) } }]);
        this.changed();
      } catch (err) {
        if (err instanceof Unreachable) { stopped = "unreachable"; break; }
        // A fault in this code or the device: keep the operation and try again later rather than lose it.
        await this.kv.batch([{ store: "ops", key: op.id, value: { ...op, attempts: op.attempts + 1, lastError: (err as Error)?.message ?? "Unknown error" } }]).catch(() => {});
        stopped = "server";
        break;
      }
    }
    const { pending, attention } = await this.counts(storeId);
    // Reached the server and it accepted this sign-in: that is a successful synchronisation, even if some
    // changes are held for attention.
    if (!stopped && storeId != null) await this.kv.batch([{ store: "meta", key: `lastSync:${storeId}`, value: this.now().toISOString() }]).catch(() => {});
    return { synced, stopped, pending, attention };
  }

  /** Forget what the server has had for a while and now shows itself. Never touches anything still to be sent. */
  async prune(olderThanMs = 30 * 60_000): Promise<void> {
    const cutoff = this.now().getTime() - olderThanMs;
    const ops = await this.ops();
    const open = new Set(ops.filter((o) => o.state !== "done").map((o) => o.recordId));
    const recs = await this.kv.getAll<LocalRecord>("records");
    // A client record is kept while any walk-in or ticket on this device still points at it.
    const needed = new Set(recs.filter((r): r is WalkinRecord | TicketRecord => (r.kind === "walkin" || r.kind === "ticket") && open.has(r.id)).map((r) => r.clientId));
    const writes: Write[] = [];
    for (const o of ops) if (o.state === "done" && Date.parse(o.doneAt ?? o.createdAt) < cutoff && !open.has(o.recordId)) writes.push({ store: "ops", key: o.id, value: undefined });
    const dropping = new Set(writes.map((w) => w.key));
    for (const r of recs) {
      const mine = ops.filter((o) => o.recordId === r.id);
      const allGone = mine.length > 0 && mine.every((o) => dropping.has(o.id));
      if (allGone && !needed.has(r.id)) writes.push({ store: "records", key: recKey(r.id), value: undefined });
    }
    if (writes.length) await this.commit(writes);
  }
}
