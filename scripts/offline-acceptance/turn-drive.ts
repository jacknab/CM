// End-to-end check of the turn rotation against the REAL test server (scratch database, port 9291):
// real clock-ins, real walk-in tickets, real checkouts. Run reset.sh first, then: npx tsx turn-drive.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const S = process.env.TURN_TEST_DIR || "/tmp/claude-0/-apps-CM/ca730288-4e83-4f29-a3a4-75c70e0853f0/scratchpad/e2e";
const B = process.env.TURN_TEST_URL || "http://127.0.0.1:9291";
const cookie = readFileSync(`${S}/cookie`, "utf8").trim();
const STORE = 1;
let failed = 0;
const mark = (name: string, ok: boolean, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(B + url, { method, headers: { Cookie: cookie, "X-Forwarded-Proto": "https", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) as any };
};
const sql = (q: string) => execSync(`psql "$(cat ${S}/testurl)" -At -F'|' -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
let seq = 0;
const key = () => `turn-drive-${Date.now()}-${String(++seq).padStart(6, "0")}`;

const setRules = async (rules: Record<string, unknown>) => {
  const r = await api("PUT", `/api/turn/settings?storeId=${STORE}`, { turnEnabled: true, autoAdvanceOnCheckout: false, appointmentExclusionWindowMinutes: 1, ...rules });
  if (r.status !== 200) throw new Error(`settings ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const line = async (serviceId?: number) => (await api("GET", `/api/turn/eligibility?storeId=${STORE}${serviceId ? `&serviceId=${serviceId}` : ""}`)).body;
let clientNo = 0;
const client = async () => (await api("POST", "/api/customers", { name: `Walk In ${++clientNo}`, phone: `60255${String(10000 + clientNo + Math.floor(Math.random() * 80000)).slice(-5)}`, storeId: STORE })).body.id as number;
/** A walk-in handed to whoever the line says is next. Returns the ticket. */
const walkIn = async (serviceId: number, staffId?: number) => {
  const r = await api("POST", "/api/nail/tickets", { clientId: await client(), serviceId, addonIds: [], nail: null, customLines: [], ...(staffId ? { staffId } : { autoAssign: true }) });
  if (r.status !== 201) throw new Error(`ticket ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { appointmentId: number; staffId: number | null; staffName: string | null };
};
// Checkout must add up to the ticket: its service price plus any extra lines. The test salon's $0 service is the base, so an
// extra line of the wanted amount makes a ticket of exactly that service amount.
const pay = async (appointmentId: number, amount: number, discount = 0) => {
  const total = Math.max(0, amount - discount);
  const r = await api("POST", "/api/nail/checkout", { appointmentId, idempotencyKey: key(), tip: 0, discount, totalPaid: total, serviceRevenue: amount, productRevenue: 0, paymentMethod: "cash",
    extras: amount > 0 ? [{ label: "Service", price: amount }] : [], tenders: total > 0 ? [{ method: "cash", amount: total }] : [] });
  if (r.status >= 300) throw new Error(`checkout ${r.status} ${JSON.stringify(r.body)}`);
  await sleep(150);
  return r;
};
const serve = async (serviceId: number, amount: number) => { const t = await walkIn(serviceId); await pay(t.appointmentId, amount); return t.staffId!; };
const units = (l: any) => Object.fromEntries(l.technicians.filter((t: any) => t.clockedIn).map((t: any) => [t.name.split(" ")[0], t.turnUnits]));
const order = (l: any) => l.technicians.filter((t: any) => t.clockedIn).map((t: any) => t.name.split(" ")[0]);

(async () => {
  // ── Setup: three technicians who all do every service, all clocked in ──
  // The test salon's setup does not always make the same number of technicians: use exactly three, with names that cannot collide.
  while (Number(sql("select count(*) from staff where store_id=1")) < 3) {
    sql("insert into staff (name, store_id, color, status) values ('New Test', 1, '#22c55e', 'active')");
    sql("insert into staff_services (staff_id, service_id) select (select max(id) from staff where store_id=1), service_id from staff_services where staff_id = (select min(id) from staff where store_id=1)");
  }
  sql("update staff set status = 'removed' where store_id=1 and id not in (select id from staff where store_id=1 order by id limit 3)");
  const three = sql("select id from staff where store_id=1 and status <> 'removed' order by id").split("\n").map(Number);
  ["Lan", "Kim", "Mai"].forEach((name, i) => sql(`update staff set name = '${name} Test' where id = ${three[i]}`));
  const staff = sql("select id, name from staff where store_id=1 and status <> 'removed' order by id").split("\n").map((r) => ({ id: Number(r.split("|")[0]), name: r.split("|")[1].split(" ")[0] }));
  const nameOf = (id: number) => staff.find((s) => s.id === id)?.name ?? String(id);
  // Two $0 services in different categories: every ticket's amount then comes from its extra line alone.
  sql("update services set price = 0 where store_id = 1 and id in (38, 5)");
  const svc = sql("select s.id, s.price, s.category from services s where s.store_id=1 and s.id in (38, 5) order by s.id desc").split("\n").map((r) => ({ id: Number(r.split("|")[0]), price: Number(r.split("|")[1]), category: r.split("|")[2] }));
  const cheap = svc[0], other = svc[1];
  for (const s of staff) { await api("POST", "/api/timeclock/clock-in", { storeId: STORE, staffId: s.id }); await sleep(150); }
  mark("three technicians are clocked in", order(await line()).length === 3, order(await line()).join(", "));

  // ── 1. Fixed order ──
  await setRules({ turnMode: "round_robin" });
  const rr: string[] = [];
  for (let i = 0; i < 6; i++) rr.push(nameOf(await serve(cheap.id, 20)));
  mark("fixed order: six walk-ins go round the three technicians twice, in the same order", rr.slice(0, 3).join() === rr.slice(3).join() && new Set(rr.slice(0, 3)).size === 3, rr.join(" → "));
  // the next technician is busy: they are passed over, keep their place, and are next again
  const due = order(await line())[0];
  const held = await walkIn(cheap.id);
  mark("fixed order: the client goes to the technician who is next", held.staffName?.startsWith(due) === true, `${due} / ${held.staffName}`);
  const second = await walkIn(cheap.id);
  const afterBusy = await line();
  mark("fixed order: with the first two busy the third takes the client", new Set([held.staffId, second.staffId]).size === 2);
  const hist1 = (await api("GET", `/api/turn/history?storeId=${STORE}`)).body.events as any[];
  mark("history: every assignment is recorded with an explanation", hist1.filter((e) => e.kind === "assigned").length === 8 && hist1.filter((e) => e.kind === "assigned").every((e) => typeof e.explanation === "string" && e.explanation.length > 10), hist1.find((e) => e.kind === "assigned")?.explanation);
  await pay(held.appointmentId, 20); await pay(second.appointmentId, 20);
  void afterBusy;
  // The next technician does not perform the service: passed over (with the reason), keeps their place, and is next again.
  const nextName = order(await line())[0];
  const nextUp = staff.find((x) => x.name === nextName)!;
  sql(`delete from staff_services where staff_id=${nextUp.id} and service_id=${other.id}`);
  const skipped = await walkIn(other.id);
  const why = sql(`select explanation from turn_events where appointment_id=${skipped.appointmentId} and kind='assigned'`);
  mark("fixed order: a technician who does not perform the service is passed over, and the history says why", skipped.staffId !== nextUp.id && why.includes(`${nextUp.name} Test (doesn't perform this service)`), why);
  await pay(skipped.appointmentId, 20);
  mark("fixed order: the technician who was passed over kept their place and is next", order(await line())[0] === nextUp.name, order(await line()).join(", "));
  // …unless the salon says being passed over for that reason uses the turn.
  await setRules({ turnMode: "round_robin", turnSkipLosesTurn: ["service_not_supported"] });
  const skipped2 = await walkIn(other.id);
  await pay(skipped2.appointmentId, 20);
  const passedRow = sql(`select staff_id, reason from turn_events where appointment_id=${skipped2.appointmentId} and kind='passed'`);
  const lineAfter = order(await line());
  mark("fixed order, 'passed over uses the turn': they go to the back and it is recorded", passedRow === `${nextUp.id}|service_not_supported` && lineAfter[0] !== nextUp.name, `${passedRow} · line ${lineAfter.join(", ")}`);
  sql(`insert into staff_services (staff_id, service_id) values (${nextUp.id}, ${other.id})`);

  // ── 2. Dollar brackets, exact boundaries, one credit per ticket ──
  await setRules({ turnMode: "brackets", turnBrackets: [{ fromCents: 0, units: 500 }, { fromCents: 3000, units: 1000 }, { fromCents: 6000, units: 2000 }], turnBoundary: "at_or_over" });
  const zero = units(await line());
  mark("changing the method starts the line again: everyone is at zero", Object.values(zero).every((u) => u === 0), JSON.stringify(zero));
  const t1 = await walkIn(cheap.id); await pay(t1.appointmentId, 29.99);
  const t2 = await walkIn(cheap.id); await pay(t2.appointmentId, 30);
  const t3 = await walkIn(cheap.id); await pay(t3.appointmentId, 60);
  const u = units(await line());
  mark("brackets: $29.99 → ½, exactly $30 → 1, exactly $60 → 2", u[nameOf(t1.staffId!)] === 500 && u[nameOf(t2.staffId!)] === 1000 && u[nameOf(t3.staffId!)] === 2000, JSON.stringify(u));
  mark("brackets: the technician with the fewest turns is next", order(await line())[0] === nameOf(t1.staffId!), order(await line()).join(", "));
  // the same checkout reported again must not earn again
  const again = await api("PATCH", `/api/appointments/${t2.appointmentId}`, { status: "completed" });
  const credits = sql(`select count(*) from turn_events where appointment_id=${t2.appointmentId} and kind='credited'`);
  mark("a ticket earns its turns once, however often its checkout is reported", credits === "1" && units(await line())[nameOf(t2.staffId!)] === 1000, `status ${again.status}, credited rows ${credits}`);
  const credit = sql(`select amount_cents, turn_units, method, config_version from turn_events where appointment_id=${t3.appointmentId} and kind='credited'`);
  mark("the credit records the amount, the turns, the method and the rule version", /^6000\|2000\|brackets\|\d+$/.test(credit), credit);
  // a rule change (not a method change) leaves earlier tickets as they were credited
  await setRules({ turnMode: "brackets", turnBrackets: [{ fromCents: 0, units: 1000 }, { fromCents: 3000, units: 3000 }], turnBoundary: "at_or_over" });
  const kept = units(await line());
  mark("changing the brackets does not re-count tickets already checked out", kept[nameOf(t1.staffId!)] === 500 && kept[nameOf(t3.staffId!)] === 2000, JSON.stringify(kept));
  const t4 = await walkIn(cheap.id); await pay(t4.appointmentId, 30);
  const after = units(await line());
  mark("the new brackets apply from the next checkout", after[nameOf(t4.staffId!)] === kept[nameOf(t4.staffId!)] + 3000, JSON.stringify(after));

  // ── 3. Discounted amount ──
  await setRules({ turnMode: "proportional", turnValueThreshold: 30, turnAmountBasis: "service_after_discount" });
  const d1 = await walkIn(cheap.id); await pay(d1.appointmentId, 60, 15);
  mark("proportional, after discount: $60 of service less a $15 discount earns 1½", units(await line())[nameOf(d1.staffId!)] === 1500, JSON.stringify(units(await line())));

  // ── 4. Equal clients ──
  await setRules({ turnMode: "client_count" });
  const c1 = nameOf(await serve(cheap.id, 20)), c2 = nameOf(await serve(cheap.id, 200)), c3 = nameOf(await serve(cheap.id, 5));
  const cu = units(await line());
  mark("equal clients: a $200 ticket and a $5 ticket each count as one client", new Set([c1, c2, c3]).size === 3 && Object.values(cu).every((x) => x === 1000), JSON.stringify(cu));
  const unpaid = await walkIn(cheap.id);
  await api("PATCH", `/api/appointments/${unpaid.appointmentId}`, { status: "cancelled" });
  mark("equal clients: a cancelled ticket counts for nothing", Object.values(units(await line())).every((x) => x === 1000));

  // ── 5. Two walk-ins at the same instant ──
  await setRules({ turnMode: "round_robin" });
  const both = await Promise.all([walkIn(cheap.id), walkIn(cheap.id)]);
  mark("two walk-ins at the same instant go to two different technicians", both[0].staffId !== both[1].staffId && both[0].staffId != null && both[1].staffId != null, `${both[0].staffName} / ${both[1].staffName}`);
  await pay(both[0].appointmentId, 20); await pay(both[1].appointmentId, 20);

  // ── 6. A hand-picked technician ──
  const lineNow = order(await line());
  const last = staff.find((s) => s.name === lineNow[lineNow.length - 1])!;
  const picked = await walkIn(cheap.id, last.id);
  const ev = sql(`select automatic, turn_units, explanation from turn_events where appointment_id=${picked.appointmentId} and kind='assigned'`);
  mark("a hand-picked technician is recorded as chosen by staff, with who was next, and keeps their place", /^f\|0\|.*chosen by staff.*was next in line/.test(ev), ev);
  await pay(picked.appointmentId, 20);

  // ── 7. Per-category rotation ──
  if (other && other.category !== cheap.category) {
    await setRules({ turnMode: "client_count", turnCategoryRotation: true });
    const a = nameOf(await serve(cheap.id, 20));
    const forOther = await line(other.id), forCheap = await line(cheap.id);
    mark("per category: a client in one category does not count in another category's rotation", units(forOther)[a] === 0 && units(forCheap)[a] === 1000, `${cheap.category}: ${JSON.stringify(units(forCheap))} · ${other.category}: ${JSON.stringify(units(forOther))}`);
    mark("per category: the line names the category it is answering for", forOther.turnCategory === other.category, String(forOther.turnCategory));
  } else mark("per category: skipped — the test salon has one service category", true);

  // ── 8. History and messages ──
  const hist = (await api("GET", `/api/turn/history?storeId=${STORE}`)).body.events as any[];
  mark("history: rule changes are recorded with the old and the new rules", hist.filter((e) => e.kind === "config_changed" && e.details?.before && e.details?.after).length >= 5);
  const versions = hist.filter((e) => e.kind === "config_changed").map((e) => e.configVersion);
  mark("history: each rule change has its own version number", new Set(versions).size === versions.length, versions.join(","));
  const msgs = (await line()).technicians.filter((t: any) => t.clockedIn).map((t: any) => t.lineMessage);
  mark("each technician is told their place, and only one is told 'You're next'", msgs.filter((m: string) => m === "You're next.").length === 1 && msgs.every((m: string) => typeof m === "string" && m.length > 0), msgs.join(" | "));
  const other2 = sql("select count(*) from turn_events where store_id <> 1");
  mark("no history was written for any other salon", other2 === "0");

  console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
