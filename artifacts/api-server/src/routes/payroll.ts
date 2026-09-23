import { Router } from "express";
// Use the existing authentication middleware used by other routes
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { locations } from "@shared/schema";
// Import payroll tables defined in the shared models
import { payrollRuns, payrollRunItems } from "../../../shared/models/payroll";
import { eq, desc } from "drizzle-orm";
import { resolveSessionStoreId } from "../lib/sessionStore";

const router = Router();

// Get payroll runs for a store
router.get("/api/payroll/runs", isAuthenticated, async (req, res) => {
  const userId = (req.session as any)?.userId;
  const store = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
  if (!store.length) return res.status(404).json({ error: "Store not found" });
  const storeId = store[0].id;
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.storeId, storeId)).orderBy(desc(payrollRuns.createdAt));
  return res.json(runs);
});

// Create a new payroll run
router.post("/api/payroll/runs", isAuthenticated, async (req, res) => {
  const { periodStart, periodEnd } = req.body;
  const storeId = await resolveSessionStoreId(req);
  if (!storeId || !periodStart || !periodEnd) return res.status(400).json({ error: "Missing fields" });
  const [run] = await db.insert(payrollRuns).values({ storeId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), status: "draft" }).returning();
  return res.json(run);
});

// Add items to a payroll run
router.post("/api/payroll/runs/:runId/items", isAuthenticated, async (req, res) => {
  const { runId } = req.params;
  const { employeeId, amount, type } = req.body;
  if (!employeeId || amount == null || !type) return res.status(400).json({ error: "Missing fields" });
  const storeId = await resolveSessionStoreId(req);
  const [run] = await db.select({ storeId: payrollRuns.storeId }).from(payrollRuns).where(eq(payrollRuns.id, Number(runId)));
  if (!run || !storeId || run.storeId !== storeId) return res.status(404).json({ error: "Payroll run not found" });
  const [item] = await db.insert(payrollRunItems).values({ payrollRunId: Number(runId), employeeId, amount, type }).returning();
  return res.json(item);
});

export default router;
