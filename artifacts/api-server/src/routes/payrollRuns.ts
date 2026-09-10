/**
 * Payroll — auto pay-period runs + printable paychecks (commission-only).
 *
 *   GET  /api/payroll/schedule            store's pay schedule (or null)
 *   PUT  /api/payroll/schedule            upsert schedule
 *   GET  /api/payroll/runs                list runs (auto-creates any due draft runs first)
 *   GET  /api/payroll/runs/:id            run + line items (recomputes draft lines from bookings)
 *   PATCH /api/payroll/runs/:id/items/:itemId   edit adds / deductions on a draft line
 *   POST /api/payroll/runs/:id/approve    lock the run, assign check numbers, total it
 *   POST /api/payroll/runs/:id/void       reopen an approved run
 *
 * Legacy payout_* / contractor_* subsystem is untouched.
 */

import { Router, type Request } from "express";
import { db, pool } from "../db";
import { isAuthenticated } from "../auth";
import { paySchedules, payrollRuns, payrollRunItems, staff, appointments, appointmentAddons, addons, services } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const router = Router();

async function storeIdFor(req: Request): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  const staffId = (req.session as any)?.staffId;
  if (userId) {
    const r = await pool.query<{ id: number }>("SELECT id FROM locations WHERE user_id = $1 LIMIT 1", [userId]);
    return r.rows[0]?.id ?? null;
  }
  if (staffId) {
    const r = await pool.query<{ store_id: number }>("SELECT store_id FROM staff WHERE id = $1 LIMIT 1", [staffId]);
    return r.rows[0]?.store_id ?? null;
  }
  return null;
}

// ── date helpers (YYYY-MM-DD, no tz) ──────────────────────────────────────
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const addMonths = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
};

interface Period { periodStart: string; periodEnd: string; payDate: string }

/** All complete periods whose end date is on/before `today`, newest first, capped. */
function periodsDue(
  frequency: string,
  anchor: string,
  offsetDays: number,
  today: string,
  cap = 12,
): Period[] {
  const out: Period[] = [];
  let payDate = anchor;
  // fast-forward anchor to the first pay date not far in the past
  let guard = 0;
  const step = (pd: string) =>
    frequency === "monthly" ? addMonths(pd, 1)
    : frequency === "semimonthly" ? addDays(pd, 15)
    : frequency === "biweekly" ? addDays(pd, 14)
    : addDays(pd, 7);
  const spanStart = (pd: string) => {
    const end = addDays(pd, -offsetDays);
    const start =
      frequency === "monthly" ? addDays(addMonths(end, -1), 1)
      : frequency === "semimonthly" ? addDays(end, -14)
      : frequency === "biweekly" ? addDays(end, -13)
      : addDays(end, -6);
    return { start, end };
  };

  // walk forward from anchor
  while (guard++ < 520) {
    const { start, end } = spanStart(payDate);
    if (end <= today) out.push({ periodStart: start, periodEnd: end, payDate });
    if (payDate > today && end > today) break;
    payDate = step(payDate);
  }
  return out.slice(-cap).reverse();
}

// ── schedule ─────────────────────────────────────────────────────────────
router.get("/schedule", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const [row] = await db.select().from(paySchedules).where(eq(paySchedules.storeId, sid));
  res.json(row ?? null);
});

router.put("/schedule", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const b = req.body ?? {};
  const frequency = ["weekly", "biweekly", "semimonthly", "monthly"].includes(b.frequency) ? b.frequency : "weekly";
  const anchorDate = typeof b.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.anchorDate) ? b.anchorDate : null;
  const periodEndOffsetDays = Number.isFinite(+b.periodEndOffsetDays) ? Math.max(0, Math.min(31, +b.periodEndOffsetDays)) : 0;
  if (!anchorDate) return res.status(400).json({ error: "anchorDate (YYYY-MM-DD) required" });

  const [row] = await db
    .insert(paySchedules)
    .values({ storeId: sid, frequency, anchorDate, periodEndOffsetDays })
    .onConflictDoUpdate({
      target: paySchedules.storeId,
      set: { frequency, anchorDate, periodEndOffsetDays, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

// ── auto-create + list runs ──────────────────────────────────────────────
router.get("/runs", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });

  const [sched] = await db.select().from(paySchedules).where(eq(paySchedules.storeId, sid));
  if (sched) {
    const due = periodsDue(sched.frequency, sched.anchorDate as unknown as string, sched.periodEndOffsetDays, iso(new Date()));
    for (const p of due) {
      await db
        .insert(payrollRuns)
        .values({
          storeId: sid,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          payDate: p.payDate,
          status: "draft",
        })
        .onConflictDoNothing(); // unique (store_id, period_start)
    }
  }

  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.storeId, sid))
    .orderBy(sql`${payrollRuns.periodStart} DESC`);
  res.json({ schedule: sched ?? null, runs });
});

// ── compute a draft run's line items from bookings ───────────────────────
async function computeLines(storeId: number, periodStart: string, periodEnd: string) {
  const team = await db
    .select()
    .from(staff)
    .where(and(eq(staff.storeId, storeId), sql`COALESCE(${staff.status}, 'active') <> 'removed'`));

  const appts = await db
    .select({
      id: appointments.id,
      staffId: appointments.staffId,
      serviceId: appointments.serviceId,
      totalPaid: appointments.totalPaid,
      tipAmount: appointments.tipAmount,
      servicePrice: appointments.servicePrice,
      status: appointments.status,
      date: appointments.date,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.status, "completed"),
        sql`${appointments.date} >= ${periodStart + "T00:00:00Z"}`,
        sql`${appointments.date} <  ${periodEnd + "T23:59:59Z"}`,
      ),
    );

  const svcRows = await db.select({ id: services.id, price: services.price }).from(services).where(eq(services.storeId, storeId));
  const svcPrice = new Map(svcRows.map((s) => [s.id, Number(s.price ?? 0)]));

  const apptIds = appts.map((a) => a.id);
  const addonRev = new Map<number, number>();
  if (apptIds.length) {
    const rows = await db
      .select({ appointmentId: appointmentAddons.appointmentId, price: addons.price })
      .from(appointmentAddons)
      .leftJoin(addons, eq(appointmentAddons.addonId, addons.id))
      .where(inArray(appointmentAddons.appointmentId, apptIds));
    for (const r of rows) addonRev.set(r.appointmentId, (addonRev.get(r.appointmentId) ?? 0) + Number(r.price ?? 0));
  }

  return team.map((t) => {
    const mine = appts.filter((a) => a.staffId === t.id);
    let serviceRevenue = 0, productRevenue = 0, tips = 0;
    for (const a of mine) {
      const gross = a.totalPaid ? Number(a.totalPaid) - Number(a.tipAmount ?? 0) : (a.servicePrice != null ? Number(a.servicePrice) : svcPrice.get(a.serviceId!) ?? 0);
      serviceRevenue += Math.max(0, gross);
      productRevenue += addonRev.get(a.id) ?? 0;
      tips += Number(a.tipAmount ?? 0);
    }
    const svcRate = Number(t.commissionRate ?? 0) / 100;
    const prodRate = Number((t as any).productCommissionRate ?? 0) / 100;
    const serviceCommission = serviceRevenue * svcRate;
    const productCommission = productRevenue * prodRate;
    return {
      staffId: t.id,
      staffName: t.name,
      commissionRate: (Number(t.commissionRate ?? 0)).toFixed(2),
      productCommissionRate: (Number((t as any).productCommissionRate ?? 0)).toFixed(2),
      appointmentCount: mine.length,
      serviceRevenue: serviceRevenue.toFixed(2),
      productRevenue: productRevenue.toFixed(2),
      addonRevenue: productRevenue.toFixed(2),
      totalRevenue: (serviceRevenue + productRevenue).toFixed(2),
      serviceCommission: serviceCommission.toFixed(2),
      productCommission: productCommission.toFixed(2),
      commissionAmount: (serviceCommission + productCommission).toFixed(2),
      tips: tips.toFixed(2),
    };
  });
}

router.get("/runs/:id", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });

  let items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));

  // Draft run with no items yet, or a refresh request → (re)compute from bookings,
  // preserving any manual booth_rent / other_deductions / other_earnings already entered.
  if (run.status === "draft" && (items.length === 0 || req.query.refresh === "1")) {
    const manual = new Map(items.map((i) => [i.staffId, i]));
    const computed = await computeLines(sid, run.periodStart, run.periodEnd);
    await db.delete(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));
    const toInsert = computed.map((c) => {
      const m = manual.get(c.staffId);
      const boothRent = Number(m?.boothRent ?? 0);
      const otherDeductions = Number(m?.otherDeductions ?? 0);
      const otherEarnings = Number(m?.otherEarnings ?? 0);
      const net = Number(c.commissionAmount) + Number(c.tips) + otherEarnings - boothRent - otherDeductions;
      return {
        payrollRunId: runId,
        ...c,
        boothRent: boothRent.toFixed(2),
        otherDeductions: otherDeductions.toFixed(2),
        otherEarnings: otherEarnings.toFixed(2),
        netPay: net.toFixed(2),
        status: "pending" as const,
      };
    });
    if (toInsert.length) await db.insert(payrollRunItems).values(toInsert as any);
    items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));
  }

  res.json({ run, items });
});

router.patch("/runs/:id/items/:itemId", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const runId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "draft") return res.status(409).json({ error: "Run is locked" });

  const [item] = await db.select().from(payrollRunItems).where(and(eq(payrollRunItems.id, itemId), eq(payrollRunItems.payrollRunId, runId)));
  if (!item) return res.status(404).json({ error: "Line not found" });

  const b = req.body ?? {};
  const num = (v: any, fb: number) => (Number.isFinite(+v) ? Math.max(0, +v) : fb);
  const boothRent = num(b.boothRent, Number(item.boothRent));
  const otherDeductions = num(b.otherDeductions, Number(item.otherDeductions));
  const otherEarnings = num(b.otherEarnings, Number(item.otherEarnings));
  const net = Number(item.commissionAmount) + Number(item.tips) + otherEarnings - boothRent - otherDeductions;

  await db
    .update(payrollRunItems)
    .set({
      boothRent: boothRent.toFixed(2),
      otherDeductions: otherDeductions.toFixed(2),
      otherEarnings: otherEarnings.toFixed(2),
      netPay: net.toFixed(2),
      notes: typeof b.notes === "string" ? b.notes.slice(0, 500) : item.notes,
    })
    .where(eq(payrollRunItems.id, itemId));
  res.json({ ok: true, netPay: net.toFixed(2) });
});

router.post("/runs/:id/approve", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status === "approved") return res.json({ ok: true, alreadyApproved: true });

  const items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));
  const startCheck = Number(req.body?.startingCheckNumber) || null;

  let net = 0, tips = 0, deductions = 0, comm = 0, checksPrinted = 0, checkSeq = startCheck;
  for (const it of items) {
    const n = Number(it.netPay);
    net += n; tips += Number(it.tips); comm += Number(it.commissionAmount);
    deductions += Number(it.boothRent) + Number(it.otherDeductions);
    let checkNumber: string | null = null;
    if (n > 0) {
      checksPrinted++;
      if (checkSeq) { checkNumber = String(checkSeq); checkSeq++; }
    }
    await db.update(payrollRunItems).set({ checkNumber, status: n > 0 ? "paid" : "skipped" }).where(eq(payrollRunItems.id, it.id));
  }

  await db
    .update(payrollRuns)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: String((req.session as any)?.userId ?? ""),
      finalizedAt: new Date(),
      totalCommission: comm.toFixed(2),
      tipsTotal: tips.toFixed(2),
      deductionsTotal: deductions.toFixed(2),
      netTotal: net.toFixed(2),
      checksPrintedCount: checksPrinted,
    })
    .where(eq(payrollRuns.id, runId));

  res.json({ ok: true, checksPrinted });
});

router.post("/runs/:id/void", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req);
  if (!sid) return res.status(404).json({ error: "No store" });
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  await db.update(payrollRuns).set({ status: "draft", approvedAt: null, approvedBy: null, finalizedAt: null }).where(eq(payrollRuns.id, runId));
  await db.update(payrollRunItems).set({ checkNumber: null, status: "pending" }).where(eq(payrollRunItems.payrollRunId, runId));
  res.json({ ok: true });
});

export default router;
