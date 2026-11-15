/**
 * Certxa Pro expenses and low-stock alerts (owner, 2026-11-15: "match GlossGenius"; migration 0367).
 *
 *   GET    /api/pro/expenses?month=YYYY-MM     the month's expenses, totals by category, takings and what's left
 *   POST   /api/pro/expenses                   { spentOn, amountCents, category, vendor?, note?, receipt?, repeatsMonthly }
 *   PUT    /api/pro/expenses/:id               the same
 *   DELETE /api/pro/expenses/:id
 *   GET    /api/pro/expenses/export?year=YYYY  { filename, csv } — the year's expenses, for the tax adviser
 *
 * Hourly: an expense set to repeat monthly is copied on the same day each month (only on or just after that day, so a
 * copy the pro deleted doesn't come back), and a product that sold down to its low-stock level sends the pro one push
 * until it is restocked.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { persistDataUriToR2 } from "../lib/r2";
import { pushOwnerMessage } from "../lib/ownerPush";

const router = Router();
const id = z.coerce.number().int().positive();
export const EXPENSE_CATEGORIES = ["Supplies", "Rent", "Products for resale", "Equipment", "Education", "Marketing", "Software", "Insurance", "Travel", "Fees", "Other"] as const;

async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}
function unexpected(res: Response, error: unknown) {
  console.error("[pro-expenses] failed", error instanceof Error ? error.message : "unknown error");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

const input = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date"),
  amountCents: z.number().int().min(1, "Enter the amount").max(100_000_000),
  category: z.enum(EXPENSE_CATEGORIES),
  vendor: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(1000).nullish(),
  // A new photo as a data: address, the kept address, or null to remove it.
  receipt: z.string().max(8_000_000).nullish(),
  repeatsMonthly: z.boolean().default(false),
}).strict();

const row = (e: any) => ({
  id: e.id, spentOn: e.spent_on, amountCents: e.amount_cents, category: e.category, vendor: e.vendor, note: e.note,
  receiptUrl: e.receipt_url, repeatsMonthly: e.repeats_monthly, repeated: e.repeated_from != null,
});

router.get("/api/pro/expenses/categories", isAuthenticated, (_req, res) => res.json(EXPENSE_CATEGORIES));

router.get("/api/pro/expenses", isAuthenticated, async (req, res) => {
  const month = String(req.query.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const start = `${month}-01`;
    const list = (await pool.query(
      `SELECT * FROM business_expenses WHERE store_id = $1 AND spent_on >= $2::date AND spent_on < ($2::date + interval '1 month') ORDER BY spent_on DESC, id DESC`, [storeId, start])).rows;
    // Takings that month in the business's time zone: paid visits (less tips, which are the pro's) and membership payments.
    const tz = (await pool.query(`SELECT COALESCE(timezone, 'America/New_York') AS tz FROM locations WHERE id = $1`, [storeId])).rows[0]?.tz;
    const takings = (await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(CAST(total_paid AS numeric) - COALESCE(CAST(tip_amount AS numeric), 0)), 0) FROM appointments
           WHERE store_id = $1 AND total_paid IS NOT NULL AND status IN ('completed', 'paid')
             AND (COALESCE(completed_at, date) AT TIME ZONE $3)::date >= $2::date AND (COALESCE(completed_at, date) AT TIME ZONE $3)::date < ($2::date + interval '1 month')) AS visits,
         (SELECT COALESCE(SUM(amount_cents), 0) / 100.0 FROM client_membership_charges
           WHERE store_id = $1 AND status = 'paid' AND (created_at AT TIME ZONE $3)::date >= $2::date AND (created_at AT TIME ZONE $3)::date < ($2::date + interval '1 month')) AS memberships`,
      [storeId, start, tz])).rows[0];
    const totalCents = list.reduce((n, e) => n + Number(e.amount_cents), 0);
    const byCategory: Record<string, number> = {};
    for (const e of list) byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount_cents);
    const takingsCents = Math.round((Number(takings.visits) + Number(takings.memberships)) * 100);
    return res.json({ expenses: list.map(row), totalCents, byCategory, takingsCents, leftCents: takingsCents - totalCents });
  } catch (error) { return unexpected(res, error); }
});

async function save(storeId: number, expenseId: number | null, body: z.infer<typeof input>) {
  let receipt: string | null | undefined = body.receipt;
  if (typeof receipt === "string" && receipt.startsWith("data:")) receipt = await persistDataUriToR2(receipt, "expense-receipts");
  if (expenseId) {
    const r = await pool.query(
      `UPDATE business_expenses SET spent_on=$3, amount_cents=$4, category=$5, vendor=$6, note=$7, receipt_url=$8, repeats_monthly=$9 WHERE id=$1 AND store_id=$2 RETURNING *`,
      [expenseId, storeId, body.spentOn, body.amountCents, body.category, body.vendor ?? null, body.note ?? null, receipt ?? null, body.repeatsMonthly]);
    return r.rows[0] ?? null;
  }
  return (await pool.query(
    `INSERT INTO business_expenses (store_id, spent_on, amount_cents, category, vendor, note, receipt_url, repeats_monthly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [storeId, body.spentOn, body.amountCents, body.category, body.vendor ?? null, body.note ?? null, receipt ?? null, body.repeatsMonthly])).rows[0];
}

router.post("/api/pro/expenses", isAuthenticated, async (req, res) => {
  const body = input.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the expense." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    return res.status(201).json(row(await save(storeId, null, body.data)));
  } catch (error) { return unexpected(res, error); }
});

router.put("/api/pro/expenses/:id", isAuthenticated, async (req, res) => {
  const eid = id.safeParse(req.params.id);
  const body = input.safeParse(req.body);
  if (!eid.success) return res.status(400).json({ error: "Invalid expense" });
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the expense." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const e = await save(storeId, eid.data, body.data);
    return e ? res.json(row(e)) : res.status(404).json({ error: "Expense not found" });
  } catch (error) { return unexpected(res, error); }
});

router.delete("/api/pro/expenses/:id", isAuthenticated, async (req, res) => {
  const eid = id.safeParse(req.params.id);
  if (!eid.success) return res.status(400).json({ error: "Invalid expense" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`DELETE FROM business_expenses WHERE id = $1 AND store_id = $2`, [eid.data, storeId]);
    return r.rowCount ? res.status(204).end() : res.status(404).json({ error: "Expense not found" });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/expenses/export", isAuthenticated, async (req, res) => {
  const year = String(req.query.year ?? "");
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: "Invalid year" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const list = (await pool.query(
      `SELECT * FROM business_expenses WHERE store_id = $1 AND spent_on >= $2::date AND spent_on < ($2::date + interval '1 year') ORDER BY spent_on, id`, [storeId, `${year}-01-01`])).rows;
    const cell = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = [["Date", "Category", "Vendor", "Amount", "Note", "Receipt"].join(",")];
    for (const e of list) lines.push([new Date(e.spent_on).toISOString().slice(0, 10), e.category, e.vendor, (e.amount_cents / 100).toFixed(2), e.note, e.receipt_url].map(cell).join(","));
    // As JSON: the app shares the text (its API client reads JSON only).
    return res.json({ filename: `expenses-${year}.csv`, csv: lines.join("\n") + "\n", count: list.length });
  } catch (error) { return unexpected(res, error); }
});

// ── Hourly: monthly repeats and low-stock alerts ──
export async function expensesAndStockOnce() {
  const lock = await pool.connect();
  try {
    if (!(await lock.query(`SELECT pg_try_advisory_lock(hashtext('pro_expenses_stock')) AS got`)).rows[0]?.got) return;
    try {
      // This month's copy of each repeating expense, on its day (the last day of a shorter month), within 3 days of it.
      await pool.query(
        `INSERT INTO business_expenses (store_id, spent_on, amount_cents, category, vendor, note, repeated_from)
         SELECT e.store_id, d.day, e.amount_cents, e.category, e.vendor, e.note, e.id
           FROM business_expenses e
           CROSS JOIN LATERAL (SELECT LEAST(date_trunc('month', current_date)::date + (EXTRACT(DAY FROM e.spent_on)::int - 1),
                                           (date_trunc('month', current_date) + interval '1 month - 1 day')::date) AS day) d
          WHERE e.repeats_monthly AND e.repeated_from IS NULL
            AND d.day > e.spent_on AND d.day <= current_date AND d.day > current_date - 3
         ON CONFLICT (repeated_from, spent_on) WHERE repeated_from IS NOT NULL DO NOTHING`);
      // Restocked: ready to alert again next time.
      await pool.query(`UPDATE products SET low_stock_alerted = false WHERE low_stock_alerted AND stock > COALESCE(low_stock_threshold, 5)`);
      const low = (await pool.query(
        `UPDATE products p SET low_stock_alerted = true
           FROM locations l JOIN users u ON u.id = l.user_id
          WHERE l.id = p.store_id AND u.account_type = 'certxa_pro'
            AND NOT p.low_stock_alerted AND p.stock IS NOT NULL AND COALESCE(p.low_stock_threshold, 5) > 0 AND p.stock <= COALESCE(p.low_stock_threshold, 5)
            AND EXISTS (SELECT 1 FROM appointment_products ap WHERE ap.product_id = p.id AND ap.stock_taken)
          RETURNING p.store_id, p.name, p.stock`)).rows;
      for (const p of low) {
        void pushOwnerMessage(p.store_id, { title: "Low on stock", body: `${p.name}: ${p.stock} left`, data: { type: "low_stock" } }).catch(() => {});
      }
    } finally { await lock.query(`SELECT pg_advisory_unlock(hashtext('pro_expenses_stock'))`).catch(() => {}); }
  } finally { lock.release(); }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startExpensesAndStock() {
  if (timer) return;
  const run = () => void expensesAndStockOnce().catch((e) => console.error("[pro-expenses] hourly failed", e instanceof Error ? e.message : e));
  setTimeout(run, 120_000).unref?.();
  timer = setInterval(run, 60 * 60_000);
}

export default router;
