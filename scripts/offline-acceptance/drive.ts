import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { NailOffline, Unreachable, type Reply, type Transport } from "/apps/CM/artifacts/booking/src/lib/nail-offline/engine";
import { memoryKV } from "/apps/CM/artifacts/booking/src/lib/nail-offline/store";

const S = "/tmp/claude-0/-apps-CM/ca730288-4e83-4f29-a3a4-75c70e0853f0/scratchpad/e2e";
const B = "http://127.0.0.1:9291";
const cookie = readFileSync(`${S}/cookie`, "utf8").trim();
const STORE = 1;
const results: [string, string, string][] = [];
const mark = (name: string, ok: boolean, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One tablet's connection to the REAL test server. `online=false` is the outage; `loseReply` swallows the next n answers after the server has acted. */
function tablet(name: string) {
  const net = { online: false, loseReply: 0, sent: [] as string[] };
  const transport: Transport = {
    async send(method, url, body, key): Promise<Reply> {
      if (!net.online) throw new Unreachable("no network");
      net.sent.push(`${method} ${url.split("?")[0]}`);
      let res: Response;
      try {
        res = await fetch(B + url, { method, headers: { Cookie: cookie, "X-Forwarded-Proto": "https", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { "X-Idempotency-Key": key } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined });
      } catch (e: any) { throw new Unreachable(e?.message); }
      const reply = { status: res.status, body: await res.json().catch(() => null) };
      if (net.loseReply > 0 && method !== "GET" && reply.status < 300) { net.loseReply -= 1; throw new Unreachable("reply lost"); }
      return reply;
    },
  };
  const kv = memoryKV();
  return { name, net, transport, kv, engine: new NailOffline(kv) };
}
const api = async (method: string, url: string, body?: unknown, key?: string) => {
  const res = await fetch(B + url, { method, headers: { Cookie: cookie, "X-Forwarded-Proto": "https", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { "X-Idempotency-Key": key } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) as any };
};
const sql = (q: string) => execSync(`psql "$(cat ${S}/testurl)" -At -F'|' -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const restartServer = async () => {
  execSync(`PID=$(ss -ltnp | grep ':9291 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2); [ -n "$PID" ] && kill $PID; sleep 2; ${S}/start.sh`, { shell: "/bin/bash" });
  for (let i = 0; i < 60; i++) { await sleep(3000); try { if ((await fetch(B + "/api/sync/heartbeat")).ok) return true; } catch { /* still starting */ } }
  return false;
};
const cash = (total: number, key: string) => ({ totalPaid: total, cash: total, tip: 0, idempotencyKey: key,
  request: { idempotencyKey: key, tenders: [{ method: "cash", amount: total }], paymentMethod: "cash", tip: 0, discount: 0, tax: 0, totalPaid: total, serviceRevenue: total, productRevenue: 0 } });
const ticket = (clientId: number, name: string, walkinId: number | null, svc: { id: number; name: string; price: number; duration: number }, staff: any = null) => ({
  storeId: STORE, clientId, clientName: name, phone: null, walkinId, service: svc, addons: [], nail: null, nailLines: [], nailPriceAdjustment: 0, customLines: [], staff, total: svc.price, duration: svc.duration });

(async () => {
  const svc1 = { id: 1, name: "Basic Manicure", price: 25, duration: 30 }; const svc2 = { id: 2, name: "Spa Manicure", price: 40, duration: 50 };
  const lan = { id: 1, name: "Lan Test", color: null }; const kim = { id: 2, name: "Kim Test", color: null };

  // ── Before the outage (online): a client and two tickets already on the server ──
  const ana = await api("POST", "/api/customers", { name: "Ana Test", phone: "6025550111", storeId: STORE });
  const cy = await api("POST", "/api/customers", { name: "Cy Test", phone: "6025550112", storeId: STORE });
  const t1 = await api("POST", "/api/nail/tickets", { clientId: ana.body.id, serviceId: 1, addonIds: [], nail: null, customLines: [], leaveUnassigned: true }, "setup-ticket-ana-000000000001");
  const t2 = await api("POST", "/api/nail/tickets", { clientId: cy.body.id, serviceId: 1, addonIds: [], nail: null, customLines: [], leaveUnassigned: true }, "setup-ticket-cy-0000000000001");
  mark("F: online client and ticket creation on the real server", ana.status === 201 && t1.status === 201 && t2.status === 201, `tickets ${t1.body?.appointmentId}, ${t2.body?.appointmentId} (${t1.body?.message ?? ""})`);
  const T1 = t1.body.appointmentId as number, T2 = t2.body.appointmentId as number;
  const dup = await api("POST", "/api/nail/tickets", { clientId: ana.body.id, serviceId: 1, addonIds: [], nail: null, customLines: [], leaveUnassigned: true }, "setup-ticket-ana-000000000001");
  mark("D: same request sent twice online returns the same ticket", dup.body?.appointmentId === T1 && dup.body?.alreadyProcessed === true, `second answer: ticket ${dup.body?.appointmentId}`);
  const reused = await api("POST", "/api/nail/tickets", { clientId: cy.body.id, serviceId: 2, addonIds: [], nail: null, customLines: [], leaveUnassigned: true }, "setup-ticket-ana-000000000001");
  mark("D: a used key with different contents is refused", reused.status === 422 && reused.body?.code === "IDEMPOTENCY_KEY_REUSED", `status ${reused.status}`);
  const [c1, c2] = await Promise.all([1, 2].map(() => api("POST", "/api/customers", { name: "Dee Test", phone: "6025550113", storeId: STORE }, "concurrent-client-000000000001")));
  mark("D: two identical requests at the same moment make one client", Number(sql("select count(*) from clients c join client_phones p on p.client_id=c.id where p.phone_number_e164 like '%6025550113'")) === 1, `statuses ${c1.status}/${c2.status}`);

  // ── Scenario A + C: the outage. Two tablets, both offline. ──
  const A = tablet("A"), Bt = tablet("B");
  const mai = await A.engine.createClient(STORE, "Mai Test", "6025550101");
  const { walkin } = await A.engine.checkIn(STORE, { id: mai.id, name: mai.name, phone: mai.phone });
  const tk = await A.engine.createTicket(ticket(mai.id, "Mai Test", walkin.id, svc1, lan));
  await A.engine.start(tk.id);
  await A.engine.recordCash(STORE, { id: tk.id, clientName: "Mai Test" }, cash(25, "offline-cash-mai-0000000001"));
  await A.engine.changeServerTicket(STORE, { id: T1, clientName: "Ana Test", status: "confirmed", staffId: null }, { type: "reassign", staff: lan });
  await A.engine.changeServerTicket(STORE, { id: T1, clientName: "Ana Test" }, { type: "start" });
  await A.engine.changeServerTicket(STORE, { id: T2, clientName: "Cy Test", status: "confirmed", staffId: null }, { type: "reassign", staff: kim });
  await A.engine.recordCash(STORE, { id: T2, clientName: "Cy Test" }, cash(25, "offline-cash-cy-00000000001"));
  // Tablet B, also offline: the same new client, another new client with a ticket, and changes to the same server tickets.
  const mai2 = await Bt.engine.createClient(STORE, "Mai Test", "6025550101");
  await Bt.engine.checkIn(STORE, { id: mai2.id, name: mai2.name, phone: mai2.phone });
  const bo = await Bt.engine.createClient(STORE, "Bo Test", "6025550102");
  const { walkin: wBo } = await Bt.engine.checkIn(STORE, { id: bo.id, name: bo.name, phone: bo.phone });
  await Bt.engine.createTicket(ticket(bo.id, "Bo Test", wBo.id, svc2, null));
  await Bt.engine.changeServerTicket(STORE, { id: T1, clientName: "Ana Test", status: "confirmed", staffId: null }, { type: "reassign", staff: kim });
  await Bt.engine.changeServerTicket(STORE, { id: T2, clientName: "Cy Test", status: "confirmed", staffId: null }, { type: "cancel" });
  const a0 = await A.engine.counts(STORE), b0 = await Bt.engine.counts(STORE);
  mark("A: offline work saved on tablet A with nothing sent", a0.pending === 9 && A.net.sent.length === 0, `${a0.pending} changes waiting, cash not sent $${a0.cash.amount}`);
  mark("E: offline cash is shown as not sent, not as settled", a0.cash.count === 2 && a0.cash.amount === 50 && Number(sql("select count(*) from appointments where status='completed'")) === 0, "server has 0 completed sales");
  mark("A: a sync attempt during the outage sends nothing and loses nothing", (await A.engine.sync(A.transport, STORE)).stopped === "unreachable" && (await A.engine.counts(STORE)).pending === 9);

  // ── Scenario B: the app is closed and reopened while still offline (same storage, new engine) ──
  const A2 = new NailOffline(memoryKV(A.kv.data));
  const afterRestart = await A2.counts(STORE);
  mark("B: after an app restart offline, the same queue and cash are there (engine over the same storage)", afterRestart.pending === 9 && afterRestart.cash.amount === 50 && (await A2.records(STORE)).length === 5);

  // ── Scenario D: reconnect tablet A. Replies are lost twice, and the server is restarted part-way. ──
  A.net.online = true; A.net.loseReply = 2;
  const p1 = await A2.sync(A.transport, STORE);
  const restarted = await restartServer();
  mark("D: test server restarted in the middle of tablet A's sync", restarted, `first pass sent ${p1.synced}, stopped: ${p1.stopped}`);
  let last = p1;
  for (let i = 0; i < 6 && (last.pending > 0 || last.stopped); i++) last = await A2.sync(A.transport, STORE);
  const stuckA = (await A2.ops(STORE)).filter((o) => o.state === "attention").map((o) => `${o.type}: ${o.lastError}`).join(" | ");
  mark("D: tablet A finished sending after lost replies and a server restart", last.pending === 0 && last.attention === 0, `pending ${last.pending}, needing attention ${last.attention} ${stuckA}`);
  const maiCount = Number(sql("select count(*) from clients c join client_phones p on p.client_id=c.id where p.phone_number_e164 like '%6025550101'"));
  const maiTickets = sql("select a.id||':'||a.status||':'||coalesce(a.staff_id::text,'-')||':'||coalesce(a.total_paid::text,'-') from appointments a join clients c on c.id=a.customer_id where c.full_name='Mai Test'");
  mark("D: exactly one client and one ticket for the offline walk-in, paid once", maiCount === 1 && maiTickets.split("\n").length === 1 && /:completed:1:25/.test(maiTickets), `server: ${maiTickets}`);
  const ops = sql(`select count(*) from nail_checkout_operations`);
  mark("E: each offline cash sale closed on the server exactly once", Number(ops) === 2 && Number(sql("select count(*) from appointments where status='completed'")) === 2, `${ops} settlements, T2=${sql(`select status from appointments where id=${T2}`)}`);
  mark("A/D: the ticket moved and started offline is with that technician and in service", sql(`select status||':'||staff_id from appointments where id=${T1}`) === "started:1");
  // The cash was recorded before the server restart; the sales were only sent after it. Dated when taken, they are older than the restart.
  const collected = sql("select count(*) from appointments where status='completed' and completed_at < now() - interval '12 seconds'");
  mark("E: the sale is dated when the cash was taken, not when it was sent", Number(collected) === 2, `${collected} of 2 dated before the restart`);

  // ── Scenario C: reconnect tablet B second ──
  Bt.net.online = true;
  let rb = await Bt.engine.sync(Bt.transport, STORE);
  for (let i = 0; i < 4 && rb.pending > 0 && !rb.stopped; i++) rb = await Bt.engine.sync(Bt.transport, STORE);
  const held = (await Bt.engine.ops(STORE)).filter((o) => o.state === "attention");
  mark("C: tablet B's conflicting changes are held, not applied", held.length === 2 && held.every((o) => o.conflict), held.map((o) => `${o.type}: ${o.lastError}`).join(" | "));
  mark("C: the server kept tablet A's technician and the paid ticket stayed paid", sql(`select staff_id from appointments where id=${T1}`) === "1" && sql(`select status from appointments where id=${T2}`) === "completed");
  mark("C: the client both tablets created exists once; tablet B's record points at it", maiCount === 1 && ((await Bt.engine.records(STORE)).find((r: any) => r.kind === "client" && r.name === "Mai Test") as any)?.realId === Number(sql("select c.id from clients c where c.full_name='Mai Test'")));
  const boT = sql("select count(*)||':'||max(a.status) from appointments a join clients c on c.id=a.customer_id where c.full_name='Bo Test'");
  mark("C: tablet B's own walk-in became one ticket", boT.startsWith("1:"), `server: ${boT}`);
  mark("D: unresolved conflicts stay visible after another sync", (await Bt.engine.sync(Bt.transport, STORE)).attention === 2 && (await Bt.engine.records(STORE)).some((r) => r.kind === "patch"));
  const again = await A2.sync(A.transport, STORE);
  mark("D: syncing again creates nothing new", again.synced === 0 && Number(sql("select count(*) from appointments")) === 4, `appointments on server: ${sql("select count(*) from appointments")}`);

  // ── Scenario E: Day Close safeguards ──
  const st = await api("POST", "/api/device-sync-status", { deviceId: "tablet-B-test-0002", pending: 2, attention: 2, cashCount: 1, cashAmount: 20 });
  const status = await api("GET", "/api/cash-drawer/day-close-status?deviceId=tablet-A-test-0001");
  mark("E: Day Close sees another tablet's reported unsent cash", st.status === 200 && status.body?.devices?.holdingCash?.length === 1, JSON.stringify(status.body?.devices?.holdingCash ?? status.body));
  const open = await api("POST", "/api/cash-drawer/sessions", { openingBalance: "100.00", openedBy: "Test Owner", storeId: STORE });
  if (open.status < 300 && open.body?.id) {
    const close = await api("POST", `/api/cash-drawer/sessions/${open.body.id}/close`, { closingBalance: "150.00", closedBy: "Test Owner", deviceId: "tablet-A-test-0001" });
    mark("E: Day Close is refused while another tablet holds unsent cash", close.status === 409 && close.body?.code === "UNSENT_OFFLINE_CASH", `${close.status} ${close.body?.code ?? close.body?.message}`);
    await api("POST", "/api/device-sync-status", { deviceId: "tablet-B-test-0002", pending: 0, attention: 0, cashCount: 0, cashAmount: 0 });
    const close2 = await api("POST", `/api/cash-drawer/sessions/${open.body.id}/close`, { closingBalance: "150.00", closedBy: "Test Owner", deviceId: "tablet-A-test-0001" });
    // Ana's ticket is still in service, so the close is still (rightly) refused — but no longer for unsent cash.
    mark("E: once that tablet has synced, unsent cash no longer blocks Day Close", close2.body?.code !== "UNSENT_OFFLINE_CASH", `now: ${close2.status} ${close2.body?.code ?? "closed"}`);
  } else results.push(["BLOCKED", "E: Day Close refusal (could not open a drawer session through the API)", `${open.status} ${JSON.stringify(open.body).slice(0, 120)}`]);

  // ── Scenario E: restricted money operations ──
  const card = await api("POST", "/api/nail/checkout", { appointmentId: T1, idempotencyKey: "card-without-reader-0000001", tenders: [{ method: "m2", amount: 25 }], paymentMethod: "m2", tip: 0, discount: 0, totalPaid: 25, serviceRevenue: 25, productRevenue: 0 });
  mark("E: a card sale is not accepted without a confirmed card payment", card.status >= 400 && sql(`select status from appointments where id=${T1}`) === "started", `${card.status} ${card.body?.message ?? ""}`);

  console.log("\nSUMMARY " + JSON.stringify({ pass: results.filter((r) => r[0] === "PASS").length, fail: results.filter((r) => r[0] === "FAIL").length, blocked: results.filter((r) => r[0] === "BLOCKED").length }));
  for (const r of results.filter((x) => x[0] !== "PASS")) console.log(r.join("  "));
})().catch((e) => { console.error("DRIVER ERROR", e); process.exit(1); });
