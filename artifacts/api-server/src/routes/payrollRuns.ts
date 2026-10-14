/**
 * Payroll — auto pay-period runs + printable paychecks (commission-only).
 *
 *   GET  /api/payroll/schedule            store's pay schedule (or null)
 *   PUT  /api/payroll/schedule            upsert schedule
 *   GET  /api/payroll/runs                list runs (auto-creates any due draft runs first)
 *   GET  /api/payroll/runs/:id            run + line items (recomputes draft lines from bookings)
 *   GET  /api/payroll/runs/:id/staff/:staffId/tickets   the tickets behind one person's commission
 *   PATCH /api/payroll/runs/:id/items/:itemId   edit adds / deductions on a draft line
 *   POST /api/payroll/runs/:id/approve    lock the run, assign check numbers, total it
 *   POST /api/payroll/runs/:id/void       reopen an approved run
 *   GET/POST /api/payroll/deductions, PUT/DELETE /api/payroll/deductions/:id
 *                                         recurring deductions, taken from every pay period
 *
 * Legacy payout_* / contractor_* subsystem is untouched.
 */

import { commissionBasis } from "@shared/commissionBasis";
import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { isAuthenticated } from "../auth";
import { paySchedules, payrollRuns, payrollRunItems, staff, appointments, appointmentAddons, addons, services, locations, clients, payoutDeductionRules } from "@shared/schema";
import { cashPortionOf, paidByCard, ruleDeductionsFor, type DeductionRule } from "../lib/payrollDeductions";
import { and, eq, inArray, sql } from "drizzle-orm";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { autoApprovalDate, payrollPeriodsDue } from "../lib/payrollPeriods";

const router = Router();

async function storeIdFor(req: Request, res: Response): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(403).json({ error: "Only an owner or manager can manage payroll" });
    return null;
  }
  const role = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!["owner", "admin", "manager"].includes(role.rows[0]?.role)) {
    res.status(403).json({ error: "Only an owner or manager can manage payroll" });
    return null;
  }
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(404).json({ error: "No store found" });
  return storeId;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
// ── schedule ─────────────────────────────────────────────────────────────
router.get("/schedule", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const [row] = await db.select().from(paySchedules).where(eq(paySchedules.storeId, sid));
  res.json(row ?? null);
});

router.put("/schedule", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const b = req.body ?? {};
  const frequency = ["weekly", "biweekly", "semimonthly", "monthly"].includes(b.frequency) ? b.frequency : "weekly";
  const anchorDate = typeof b.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.anchorDate) ? b.anchorDate : null;
  const periodEndOffsetDays = Number.isFinite(+b.periodEndOffsetDays) ? Math.max(0, Math.min(31, +b.periodEndOffsetDays)) : 0;
  // Share paid by check; the rest is paid in cash. Left out = unchanged (100 for a new schedule).
  const checkPercent = b.checkPercent === undefined ? undefined : Math.round(Math.max(0, Math.min(100, Number(b.checkPercent) || 0)));
  if (!anchorDate) return res.status(400).json({ error: "anchorDate (YYYY-MM-DD) required" });

  const [row] = await db
    .insert(paySchedules)
    .values({ storeId: sid, frequency, anchorDate, periodEndOffsetDays, ...(checkPercent !== undefined ? { checkPercent } : {}) })
    .onConflictDoUpdate({
      target: paySchedules.storeId,
      set: { frequency, anchorDate, periodEndOffsetDays, ...(checkPercent !== undefined ? { checkPercent } : {}), updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

// ── auto-create + list runs ──────────────────────────────────────────────
router.get("/runs", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;

  const [sched] = await db.select().from(paySchedules).where(eq(paySchedules.storeId, sid));
  if (sched) {
    const tzResult = await pool.query<{ timezone: string | null }>("SELECT timezone FROM locations WHERE id = $1 LIMIT 1", [sid]);
    const timezone = tzResult.rows[0]?.timezone || "UTC";
    const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
    const due = payrollPeriodsDue(sched.frequency, sched.anchorDate as unknown as string, sched.periodEndOffsetDays, today);
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

    const drafts = await db.select().from(payrollRuns).where(and(eq(payrollRuns.storeId, sid), eq(payrollRuns.status, "draft")));
    for (const run of drafts) {
      if (today >= autoApprovalDate(run.periodEnd)) await approvePayrollRunById(run.id, null);
    }
  }

  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.storeId, sid))
    .orderBy(sql`${payrollRuns.periodStart} DESC`);
  res.json({
    schedule: sched ?? null,
    runs: runs.map((run) => ({ ...run, autoApprovesOn: autoApprovalDate(run.periodEnd) })),
  });
});

// ── compute a draft run's line items from bookings ───────────────────────
export async function computeLines(storeId: number, periodStart: string, periodEnd: string) {
  const tzResult = await pool.query<{ timezone: string | null }>("SELECT timezone FROM locations WHERE id = $1 LIMIT 1", [storeId]);
  const timezone = tzResult.rows[0]?.timezone || "UTC";
  const periodStartUtc = fromZonedTime(`${periodStart}T00:00:00`, timezone);
  const periodEndExclusiveUtc = fromZonedTime(`${addDays(periodEnd, 1)}T00:00:00`, timezone);
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
      discountAmount: appointments.discountAmount,
      servicePrice: appointments.servicePrice,
      serviceRevenue: appointments.serviceRevenue,
      productRevenue: appointments.productRevenue,
      status: appointments.status,
      date: appointments.date,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        eq(appointments.status, "completed"),
        sql`${appointments.date} >= ${periodStartUtc}`,
        sql`${appointments.date} < ${periodEndExclusiveUtc}`,
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
    let serviceRevenue = 0, productRevenue = 0, addonRevenue = 0, tips = 0;
    for (const a of mine) {
      // One rule for everyone (see @shared/commissionBasis): services + add-ons at the service rate,
      // retail products at the product rate, all pre-discount / pre-tax / pre-tip.
      const basis = commissionBasis(a, { catalogPrice: svcPrice.get(a.serviceId!) ?? 0, addonTotal: addonRev.get(a.id) ?? 0 });
      serviceRevenue += basis.service;
      productRevenue += basis.product;
      addonRevenue += addonRev.get(a.id) ?? 0;
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
      addonRevenue: addonRevenue.toFixed(2),
      totalRevenue: (serviceRevenue + productRevenue).toFixed(2),
      serviceCommission: serviceCommission.toFixed(2),
      productCommission: productCommission.toFixed(2),
      commissionAmount: (serviceCommission + productCommission).toFixed(2),
      tips: tips.toFixed(2),
    };
  });
}

/** The tip on every card-paid, tipped ticket of the period, per staff member (same tickets as computeLines). */
async function cardTipsByStaff(storeId: number, periodStart: string, periodEnd: string): Promise<Map<number, number[]>> {
  const tzResult = await pool.query<{ timezone: string | null }>("SELECT timezone FROM locations WHERE id = $1 LIMIT 1", [storeId]);
  const timezone = tzResult.rows[0]?.timezone || "UTC";
  const rows = await db
    .select({ staffId: appointments.staffId, tipAmount: appointments.tipAmount, paymentMethod: appointments.paymentMethod })
    .from(appointments)
    .where(and(
      eq(appointments.storeId, storeId),
      eq(appointments.status, "completed"),
      sql`${appointments.date} >= ${fromZonedTime(`${periodStart}T00:00:00`, timezone)}`,
      sql`${appointments.date} < ${fromZonedTime(`${addDays(periodEnd, 1)}T00:00:00`, timezone)}`,
      sql`COALESCE(${appointments.tipAmount}, 0) > 0`,
    ));
  const byStaff = new Map<number, number[]>();
  for (const row of rows) {
    if (row.staffId == null || !paidByCard(row.paymentMethod)) continue;
    byStaff.set(row.staffId, [...(byStaff.get(row.staffId) ?? []), Number(row.tipAmount)]);
  }
  return byStaff;
}

/** The share of each paycheck the salon pays by check (100 when it has not said otherwise). */
async function checkPercentFor(storeId: number): Promise<number> {
  const [sched] = await db.select({ checkPercent: paySchedules.checkPercent }).from(paySchedules).where(eq(paySchedules.storeId, storeId));
  const pct = Number(sched?.checkPercent ?? 100);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100;
}

async function refreshDraftItems(run: typeof payrollRuns.$inferSelect) {
  let items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, run.id));
  if (run.status !== "draft") return items;
  const manual = new Map(items.map((item) => [item.staffId, item]));
  const computed = await computeLines(run.storeId, run.periodStart, run.periodEnd);
  const rules = (await db.select().from(payoutDeductionRules)
    .where(and(eq(payoutDeductionRules.storeId, run.storeId), eq(payoutDeductionRules.isActive, true)))) as DeductionRule[];
  const checkPercent = await checkPercentFor(run.storeId);
  const cardTips = rules.some((rule) => rule.type === "card_tips")
    ? await cardTipsByStaff(run.storeId, run.periodStart, run.periodEnd)
    : new Map<number, number[]>();
  await db.delete(payrollRunItems).where(eq(payrollRunItems.payrollRunId, run.id));
  const values = computed.map((line) => {
    const prior = manual.get(line.staffId);
    const boothRent = Number(prior?.boothRent ?? 0);
    // other_deductions is the total: what the owner typed for this period plus the salon's recurring
    // deductions. The typed part carries over; the recurring part is worked out again from the rules.
    const typedDeductions = Math.max(0, Number(prior?.otherDeductions ?? 0) - Number(prior?.ruleDeductions ?? 0));
    const recurring = ruleDeductionsFor(rules, { staffId: line.staffId, commission: Number(line.commissionAmount), cardTips: cardTips.get(line.staffId), tickets: Number(line.appointmentCount) || 0 });
    const otherDeductions = typedDeductions + recurring.total;
    const otherEarnings = Number(prior?.otherEarnings ?? 0);
    const netPay = Math.max(0, Number(line.commissionAmount) + Number(line.tips) + otherEarnings - boothRent - otherDeductions);
    return {
      payrollRunId: run.id,
      ...line,
      boothRent: boothRent.toFixed(2),
      otherDeductions: otherDeductions.toFixed(2),
      ruleDeductions: recurring.total.toFixed(2),
      ruleDeductionsDetail: recurring.detail.length ? recurring.detail : null,
      otherEarnings: otherEarnings.toFixed(2),
      netPay: netPay.toFixed(2),
      cashPortion: cashPortionOf(netPay, checkPercent).toFixed(2),
      notes: prior?.notes ?? null,
      status: "pending" as const,
    };
  });
  if (values.length) await db.insert(payrollRunItems).values(values as any);
  const refreshed = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, run.id));
  const totals = refreshed.reduce((sum, item) => ({
    commission: sum.commission + Number(item.commissionAmount),
    tips: sum.tips + Number(item.tips),
    deductions: sum.deductions + Number(item.boothRent) + Number(item.otherDeductions),
    net: sum.net + Number(item.netPay),
    checks: sum.checks + (Number(item.netPay) > 0 ? 1 : 0),
  }), { commission: 0, tips: 0, deductions: 0, net: 0, checks: 0 });
  await db.update(payrollRuns).set({
    totalCommission: totals.commission.toFixed(2),
    tipsTotal: totals.tips.toFixed(2),
    deductionsTotal: totals.deductions.toFixed(2),
    netTotal: totals.net.toFixed(2),
    contractorCount: totals.checks,
  }).where(eq(payrollRuns.id, run.id));
  return refreshed;
}

export async function approvePayrollRunById(runId: number, approvedBy: string | null, startingCheckNumber?: number | null) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  if (!run) throw new Error("Run not found");
  if (run.status === "approved") return { ok: true, alreadyApproved: true, checkCount: run.contractorCount };
  const items = await refreshDraftItems(run);
  if (!items.length) {
    // A legitimate zero-pay period still closes automatically; it simply prints no checks.
    await db.update(payrollRuns).set({ status: "approved", approvedAt: new Date(), approvedBy, finalizedAt: new Date() }).where(eq(payrollRuns.id, runId));
    return { ok: true, checkCount: 0 };
  }

  let net = 0, tips = 0, deductions = 0, commission = 0, checkCount = 0;
  let checkSequence = startingCheckNumber || null;
  await db.transaction(async (tx) => {
    for (const item of items) {
      const itemNet = Math.max(0, Number(item.netPay));
      // A check is written for the part not paid in cash.
      const checkAmount = Math.max(0, itemNet - Number((item as any).cashPortion ?? 0));
      net += itemNet;
      tips += Number(item.tips);
      commission += Number(item.commissionAmount);
      deductions += Number(item.boothRent) + Number(item.otherDeductions);
      let checkNumber: string | null = null;
      if (checkAmount > 0) {
        checkCount++;
        if (checkSequence) checkNumber = String(checkSequence++);
      }
      await tx.update(payrollRunItems).set({ checkNumber, status: itemNet > 0 ? "paid" : "skipped" }).where(eq(payrollRunItems.id, item.id));
    }
    await tx.update(payrollRuns).set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy,
      finalizedAt: new Date(),
      totalCommission: commission.toFixed(2),
      tipsTotal: tips.toFixed(2),
      deductionsTotal: deductions.toFixed(2),
      netTotal: net.toFixed(2),
      contractorCount: checkCount,
      checksPrintedCount: 0,
    }).where(eq(payrollRuns.id, runId));
  });
  return { ok: true, checkCount };
}

router.get("/runs/:id", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });

  const items = await refreshDraftItems(run);

  res.json({ run: { ...run, autoApprovesOn: autoApprovalDate(run.periodEnd) }, items });
});

// ── the tickets behind one person's commission ───────────────────────────
// Same tickets, same period boundaries and same commission rule as computeLines, listed one by one
// so the owner can see which services the money came from. Rates are the ones on the run's line.
router.get("/runs/:id/staff/:staffId/tickets", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const runId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(staffId)) return res.status(400).json({ error: "Invalid request" });
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  const [item] = await db.select().from(payrollRunItems).where(and(eq(payrollRunItems.payrollRunId, runId), eq(payrollRunItems.staffId, staffId)));
  if (!item) return res.status(404).json({ error: "Line not found" });

  const tzResult = await pool.query<{ timezone: string | null }>("SELECT timezone FROM locations WHERE id = $1 LIMIT 1", [sid]);
  const timezone = tzResult.rows[0]?.timezone || "UTC";
  const periodStartUtc = fromZonedTime(`${run.periodStart}T00:00:00`, timezone);
  const periodEndExclusiveUtc = fromZonedTime(`${addDays(run.periodEnd, 1)}T00:00:00`, timezone);
  const appts = await db
    .select({
      id: appointments.id,
      ticketNumber: appointments.ticketNumber,
      date: appointments.date,
      serviceId: appointments.serviceId,
      totalPaid: appointments.totalPaid,
      tipAmount: appointments.tipAmount,
      discountAmount: appointments.discountAmount,
      servicePrice: appointments.servicePrice,
      serviceRevenue: appointments.serviceRevenue,
      productRevenue: appointments.productRevenue,
      clientName: clients.fullName,
      serviceName: services.name,
      catalogPrice: services.price,
    })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.customerId))
    .leftJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.storeId, sid),
        eq(appointments.staffId, staffId),
        eq(appointments.status, "completed"),
        sql`${appointments.date} >= ${periodStartUtc}`,
        sql`${appointments.date} < ${periodEndExclusiveUtc}`,
      ),
    )
    .orderBy(appointments.date);

  const addonsByAppt = new Map<number, { name: string; price: number }[]>();
  if (appts.length) {
    const rows = await db
      .select({ appointmentId: appointmentAddons.appointmentId, name: addons.name, price: addons.price })
      .from(appointmentAddons)
      .leftJoin(addons, eq(appointmentAddons.addonId, addons.id))
      .where(inArray(appointmentAddons.appointmentId, appts.map((a) => a.id)));
    for (const r of rows) {
      const list = addonsByAppt.get(r.appointmentId) ?? [];
      list.push({ name: r.name ?? "Add-on", price: Number(r.price ?? 0) });
      addonsByAppt.set(r.appointmentId, list);
    }
  }

  const svcRate = Number(item.commissionRate ?? 0) / 100;
  const prodRate = Number(item.productCommissionRate ?? 0) / 100;
  const tickets = appts.map((a) => {
    const ticketAddons = addonsByAppt.get(a.id) ?? [];
    const basis = commissionBasis(a, { catalogPrice: Number(a.catalogPrice ?? 0), addonTotal: ticketAddons.reduce((sum, x) => sum + x.price, 0) });
    return {
      id: a.id,
      ticketNumber: a.ticketNumber ?? null,
      date: new Date(a.date).toISOString(),
      clientName: a.clientName || "Guest",
      serviceName: a.serviceName ?? "Service",
      addons: ticketAddons.map((x) => x.name),
      serviceAmount: basis.service.toFixed(2),
      productAmount: basis.product.toFixed(2),
      commission: (basis.service * svcRate + basis.product * prodRate).toFixed(2),
      tip: Number(a.tipAmount ?? 0).toFixed(2),
    };
  });
  res.json({
    staffName: item.staffName,
    timezone,
    commissionRate: Number(item.commissionRate ?? 0),
    productCommissionRate: Number(item.productCommissionRate ?? 0),
    tickets,
  });
});

router.patch("/runs/:id/items/:itemId", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
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
  // The box on screen holds only what the owner typed; the line's recurring deductions stay on top of it.
  const recurringDeductions = Number(item.ruleDeductions ?? 0);
  const otherDeductions = b.otherDeductions === undefined ? Number(item.otherDeductions) : num(b.otherDeductions, 0) + recurringDeductions;
  const otherEarnings = num(b.otherEarnings, Number(item.otherEarnings));
  const net = Math.max(0, Number(item.commissionAmount) + Number(item.tips) + otherEarnings - boothRent - otherDeductions);

  await db
    .update(payrollRunItems)
    .set({
      boothRent: boothRent.toFixed(2),
      otherDeductions: otherDeductions.toFixed(2),
      otherEarnings: otherEarnings.toFixed(2),
      netPay: net.toFixed(2),
      cashPortion: cashPortionOf(net, await checkPercentFor(sid)).toFixed(2),
      notes: typeof b.notes === "string" ? b.notes.slice(0, 500) : item.notes,
    })
    .where(eq(payrollRunItems.id, itemId));
  res.json({ ok: true, netPay: net.toFixed(2) });
});

router.post("/runs/:id/approve", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status === "approved") return res.json({ ok: true, alreadyApproved: true });

  const startCheck = Number(req.body?.startingCheckNumber) || null;
  res.json(await approvePayrollRunById(runId, String((req.session as any)?.userId ?? ""), startCheck));
});

router.post("/runs/:id/void", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const runId = Number(req.params.id);
  const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.storeId, sid)));
  if (!run) return res.status(404).json({ error: "Run not found" });
  await db.update(payrollRuns).set({ status: "draft", approvedAt: null, approvedBy: null, finalizedAt: null }).where(eq(payrollRuns.id, runId));
  await db.update(payrollRunItems).set({ checkNumber: null, status: "pending" }).where(eq(payrollRunItems.payrollRunId, runId));
  res.json({ ok: true });
});

// ── recurring deductions ─────────────────────────────────────────────────
// Rules the owner sets once (a supply fee, a card processing fee…) that come off every pay period.
// Stored in payout_deduction_rules, the table the setup wizard and the old Deductions page wrote to.
function ruleInput(b: any): { name: string; type: "fixed" | "percentage" | "card_tips" | "per_ticket"; amount: string; perTransaction: string; appliesTo: "all" | "specific"; staffId: number | null } | string {
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return "Give the deduction a name";
  const type = b?.type === "percentage" ? "percentage" : b?.type === "card_tips" ? "card_tips" : b?.type === "per_ticket" ? "per_ticket" : "fixed";
  const amount = Number(b?.amount ?? 0);
  // Card fee on tips: a percent of the tip plus a flat fee per transaction — either may be zero, not both.
  const perTransaction = type === "card_tips" ? Number(b?.perTransaction ?? 0) : 0;
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(perTransaction) || perTransaction < 0) return "Enter an amount above zero";
  if (type === "card_tips" ? amount + perTransaction <= 0 : amount <= 0) return "Enter an amount above zero";
  if (type !== "fixed" && amount > 100) return "A percentage can't be more than 100";
  if (type === "fixed" && amount > 100000) return "That amount is too large";
  if (perTransaction > 100) return "That per-transaction fee is too large";
  const appliesTo = b?.appliesTo === "specific" ? "specific" : "all";
  const staffId = appliesTo === "specific" ? Number(b?.staffId) : null;
  if (appliesTo === "specific" && !Number.isSafeInteger(staffId)) return "Choose who this deduction is for";
  return { name, type, amount: amount.toFixed(2), perTransaction: perTransaction.toFixed(2), appliesTo, staffId };
}

router.get("/deductions", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const rules = await db.select().from(payoutDeductionRules).where(eq(payoutDeductionRules.storeId, sid)).orderBy(payoutDeductionRules.id);
  res.json(rules);
});

router.post("/deductions", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const input = ruleInput(req.body);
  if (typeof input === "string") return res.status(400).json({ error: input });
  if (input.staffId != null) {
    const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, input.staffId), eq(staff.storeId, sid)));
    if (!member) return res.status(400).json({ error: "Choose who this deduction is for" });
  }
  const [row] = await db.insert(payoutDeductionRules).values({ storeId: sid, ...input, isActive: true }).returning();
  res.status(201).json(row);
});

router.put("/deductions/:id", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const id = Number(req.params.id);
  const [existing] = await db.select().from(payoutDeductionRules).where(and(eq(payoutDeductionRules.id, id), eq(payoutDeductionRules.storeId, sid)));
  if (!existing) return res.status(404).json({ error: "Deduction not found" });
  // Switching a deduction on or off sends only isActive.
  if (req.body?.name === undefined && typeof req.body?.isActive === "boolean") {
    const [row] = await db.update(payoutDeductionRules).set({ isActive: req.body.isActive }).where(eq(payoutDeductionRules.id, id)).returning();
    return res.json(row);
  }
  const input = ruleInput(req.body);
  if (typeof input === "string") return res.status(400).json({ error: input });
  if (input.staffId != null) {
    const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, input.staffId), eq(staff.storeId, sid)));
    if (!member) return res.status(400).json({ error: "Choose who this deduction is for" });
  }
  const [row] = await db.update(payoutDeductionRules)
    .set({ ...input, contractorId: null, ...(typeof req.body?.isActive === "boolean" ? { isActive: req.body.isActive } : {}) })
    .where(eq(payoutDeductionRules.id, id)).returning();
  res.json(row);
});

router.delete("/deductions/:id", isAuthenticated, async (req, res) => {
  const sid = await storeIdFor(req, res);
  if (!sid) return;
  const id = Number(req.params.id);
  const gone = await db.delete(payoutDeductionRules).where(and(eq(payoutDeductionRules.id, id), eq(payoutDeductionRules.storeId, sid))).returning({ id: payoutDeductionRules.id });
  if (!gone.length) return res.status(404).json({ error: "Deduction not found" });
  res.json({ ok: true });
});

/** Hourly automation: create every newly closed period and approve drafts on business day four. */
export async function runPayrollAutomationTick(now: Date = new Date()): Promise<void> {
  const schedules = await db
    .select({ schedule: paySchedules, timezone: locations.timezone })
    .from(paySchedules)
    .innerJoin(locations, eq(locations.id, paySchedules.storeId));

  for (const { schedule, timezone } of schedules) {
    const today = formatInTimeZone(now, timezone || "UTC", "yyyy-MM-dd");
    const due = payrollPeriodsDue(
      schedule.frequency,
      schedule.anchorDate as unknown as string,
      schedule.periodEndOffsetDays,
      today,
    );
    for (const period of due) {
      await db.insert(payrollRuns).values({
        storeId: schedule.storeId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        payDate: period.payDate,
        status: "draft",
      }).onConflictDoNothing();
    }

    const drafts = await db.select().from(payrollRuns).where(and(
      eq(payrollRuns.storeId, schedule.storeId),
      eq(payrollRuns.status, "draft"),
    ));
    for (const run of drafts) {
      await refreshDraftItems(run);
      if (today >= autoApprovalDate(run.periodEnd)) {
        await approvePayrollRunById(run.id, "system:auto-approval");
      }
    }
  }
}

export default router;
