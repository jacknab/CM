import { Router } from "express";
import { db } from "../db";
import {
  crews, crewLocations, serviceOrders, orderNotes,
  proCustomers, proEstimates, proInvoices,
  insertCrewSchema, insertServiceOrderSchema, insertOrderNoteSchema,
  insertProCustomerSchema, insertProEstimateSchema, insertProInvoiceSchema,
  storeSettings,
} from "../../shared/schema";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";

const router = Router();

router.use(isAuthenticated);

const sid = async (req: any): Promise<number> => {
  const sessionStoreId = await resolveSessionStoreId(req);
  return sessionStoreId ?? 0;
};

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

router.get("/customers", async (req, res) => {
  try {
    const storeId = await sid(req);
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const search = req.query.search ? String(req.query.search) : null;
    let q = db.select().from(proCustomers).where(eq(proCustomers.storeId, storeId)).orderBy(proCustomers.name);
    if (search) {
      q = db.select().from(proCustomers).where(
        and(
          eq(proCustomers.storeId, storeId),
          or(ilike(proCustomers.name, `%${search}%`), ilike(proCustomers.email, `%${search}%`), ilike(proCustomers.phone, `%${search}%`))
        )
      ).orderBy(proCustomers.name) as any;
    }
    res.json(await q);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [customer] = await db.select().from(proCustomers).where(and(eq(proCustomers.id, Number(req.params.id)), eq(proCustomers.storeId, storeId)));
    if (!customer) return res.status(404).json({ error: "Not found" });
    const jobs = await db.select().from(serviceOrders).where(and(eq(serviceOrders.storeId, storeId), eq(serviceOrders.customerName, customer.name))).orderBy(desc(serviceOrders.createdAt)).limit(20);
    const estimates = await db.select().from(proEstimates).where(and(eq(proEstimates.storeId, storeId), eq(proEstimates.customerId, customer.id))).orderBy(desc(proEstimates.createdAt)).limit(20);
    const invoices = await db.select().from(proInvoices).where(and(eq(proInvoices.storeId, storeId), eq(proInvoices.customerName, customer.name))).orderBy(desc(proInvoices.createdAt)).limit(20);
    res.json({ ...customer, jobs, estimates, invoices });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/customers", async (req, res) => {
  try {
    const storeId = await sid(req);
    const parsed = insertProCustomerSchema.parse({ ...req.body, storeId });
    const [c] = await db.insert(proCustomers).values(parsed).returning();
    res.status(201).json(c);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.put("/customers/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { name, phone, email, address, city, state, zip, propertyType, notes } = req.body;
    const [c] = await db.update(proCustomers).set({ name, phone, email, address, city, state, zip, propertyType, notes }).where(and(eq(proCustomers.id, Number(req.params.id)), eq(proCustomers.storeId, storeId))).returning();
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    await db.delete(proCustomers).where(and(eq(proCustomers.id, Number(req.params.id)), eq(proCustomers.storeId, storeId)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── CREWS ────────────────────────────────────────────────────────────────────

router.get("/crews", async (req, res) => {
  try {
    const storeId = await sid(req);
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const result = await db.select().from(crews).where(eq(crews.storeId, storeId)).orderBy(crews.name);
    const crewsWithLocations = await Promise.all(
      result.map(async (crew) => {
        const [loc] = await db.select().from(crewLocations).where(eq(crewLocations.crewId, crew.id)).orderBy(desc(crewLocations.updatedAt)).limit(1);
        return { ...crew, location: loc ?? null };
      })
    );
    res.json(crewsWithLocations);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/crews", async (req, res) => {
  try {
    const storeId = await sid(req);
    const parsed = insertCrewSchema.parse({ ...req.body, storeId });
    const [c] = await db.insert(crews).values(parsed).returning();
    res.status(201).json(c);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.put("/crews/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { name, color, active, notes } = req.body;
    const [c] = await db.update(crews).set({ name, color, active, notes }).where(and(eq(crews.id, Number(req.params.id)), eq(crews.storeId, storeId))).returning();
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/crews/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    await db.delete(crews).where(and(eq(crews.id, Number(req.params.id)), eq(crews.storeId, storeId)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/crews/:id/location", async (req, res) => {
  try {
    const crewId = Number(req.params.id);
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    await db.insert(crewLocations).values({ crewId, lat: String(lat), lng: String(lng), updatedAt: new Date() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── SERVICE ORDERS / JOBS ────────────────────────────────────────────────────

router.get("/orders", async (req, res) => {
  try {
    const storeId = await sid(req);
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const { status } = req.query;
    const rows = await db.select({ order: serviceOrders, crew: crews })
      .from(serviceOrders)
      .leftJoin(crews, eq(serviceOrders.crewId, crews.id))
      .where(status ? and(eq(serviceOrders.storeId, storeId), eq(serviceOrders.status, String(status))) : eq(serviceOrders.storeId, storeId))
      .orderBy(desc(serviceOrders.createdAt));
    res.json(rows.map(({ order, crew }) => ({ ...order, crew })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [row] = await db.select({ order: serviceOrders, crew: crews }).from(serviceOrders).leftJoin(crews, eq(serviceOrders.crewId, crews.id)).where(and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.storeId, storeId)));
    if (!row) return res.status(404).json({ error: "Not found" });
    const notes = await db.select().from(orderNotes).where(eq(orderNotes.orderId, Number(req.params.id))).orderBy(orderNotes.createdAt);
    res.json({ ...row.order, crew: row.crew, notes });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/orders", async (req, res) => {
  try {
    const storeId = await sid(req);
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(serviceOrders).where(eq(serviceOrders.storeId, storeId));
    const orderNumber = `JOB-${(Number(countRow?.count ?? 0) + 1).toString().padStart(4, "0")}`;
    const parsed = insertServiceOrderSchema.parse({ ...req.body, storeId, orderNumber, status: req.body.status ?? "new" });
    const [created] = await db.insert(serviceOrders).values(parsed).returning();
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.put("/orders/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const allowed = ["status","priority","serviceType","customerName","customerPhone","customerEmail","address","city","state","zip","lat","lng","description","crewId","scheduledAt","startedAt","completedAt","estimatedHours"];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    const [updated] = await db.update(serviceOrders).set(updates).where(and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.storeId, storeId))).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.delete("/orders/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    await db.delete(orderNotes).where(eq(orderNotes.orderId, Number(req.params.id)));
    await db.delete(serviceOrders).where(and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.storeId, storeId)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/orders/:id/notes", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { note, authorName } = req.body;
    const [n] = await db.insert(orderNotes).values({ orderId: Number(req.params.id), storeId, note, authorName }).returning();
    res.status(201).json(n);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── ESTIMATES ────────────────────────────────────────────────────────────────

router.get("/estimates", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { status } = req.query;
    const rows = await db.select().from(proEstimates)
      .where(status ? and(eq(proEstimates.storeId, storeId), eq(proEstimates.status, String(status))) : eq(proEstimates.storeId, storeId))
      .orderBy(desc(proEstimates.createdAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/estimates/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [est] = await db.select().from(proEstimates).where(and(eq(proEstimates.id, Number(req.params.id)), eq(proEstimates.storeId, storeId)));
    if (!est) return res.status(404).json({ error: "Not found" });
    res.json(est);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/estimates", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(proEstimates).where(eq(proEstimates.storeId, storeId));
    const estimateNumber = `EST-${(Number(countRow?.count ?? 0) + 1).toString().padStart(4, "0")}`;
    const parsed = insertProEstimateSchema.parse({ ...req.body, storeId, estimateNumber });
    const [e] = await db.insert(proEstimates).values(parsed).returning();
    res.status(201).json(e);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.put("/estimates/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const allowed = ["status","customerName","customerPhone","customerEmail","address","city","state","zip","serviceType","description","lineItems","subtotal","tax","total","validUntil","notes"];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    const [e] = await db.update(proEstimates).set(updates).where(and(eq(proEstimates.id, Number(req.params.id)), eq(proEstimates.storeId, storeId))).returning();
    res.json(e);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/estimates/:id/convert", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [est] = await db.select().from(proEstimates).where(and(eq(proEstimates.id, Number(req.params.id)), eq(proEstimates.storeId, storeId)));
    if (!est) return res.status(404).json({ error: "Not found" });
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(serviceOrders).where(eq(serviceOrders.storeId, storeId));
    const orderNumber = `JOB-${(Number(countRow?.count ?? 0) + 1).toString().padStart(4, "0")}`;
    const [order] = await db.insert(serviceOrders).values({
      storeId, orderNumber, status: "new", priority: "normal",
      serviceType: est.serviceType ?? "General Service",
      customerName: est.customerName, customerPhone: est.customerPhone, customerEmail: est.customerEmail,
      address: est.address ?? "", city: est.city, state: est.state, zip: est.zip,
      description: est.description,
    }).returning();
    await db.update(proEstimates).set({ status: "converted", convertedToOrderId: order.id }).where(eq(proEstimates.id, est.id));
    res.json(order);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────

router.get("/invoices", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { status } = req.query;
    const rows = await db.select().from(proInvoices)
      .where(status ? and(eq(proInvoices.storeId, storeId), eq(proInvoices.status, String(status))) : eq(proInvoices.storeId, storeId))
      .orderBy(desc(proInvoices.createdAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/invoices/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [inv] = await db.select().from(proInvoices).where(and(eq(proInvoices.id, Number(req.params.id)), eq(proInvoices.storeId, storeId)));
    if (!inv) return res.status(404).json({ error: "Not found" });
    res.json(inv);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/invoices", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(proInvoices).where(eq(proInvoices.storeId, storeId));
    const invoiceNumber = `INV-${(Number(countRow?.count ?? 0) + 1).toString().padStart(4, "0")}`;
    const parsed = insertProInvoiceSchema.parse({ ...req.body, storeId, invoiceNumber });
    const [inv] = await db.insert(proInvoices).values(parsed).returning();
    res.status(201).json(inv);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.put("/invoices/:id", async (req, res) => {
  try {
    const storeId = await sid(req);
    const allowed = ["status","customerName","customerPhone","customerEmail","address","lineItems","subtotal","tax","total","paidAt","dueAt","notes"];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    const [inv] = await db.update(proInvoices).set(updates).where(and(eq(proInvoices.id, Number(req.params.id)), eq(proInvoices.storeId, storeId))).returning();
    res.json(inv);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── DISPATCH OVERVIEW ────────────────────────────────────────────────────────

router.get("/dispatch", async (req, res) => {
  try {
    const storeId = await sid(req);
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const [activeOrders, allCrews] = await Promise.all([
      db.select({ order: serviceOrders, crew: crews })
        .from(serviceOrders).leftJoin(crews, eq(serviceOrders.crewId, crews.id))
        .where(and(eq(serviceOrders.storeId, storeId), sql`${serviceOrders.status} NOT IN ('completed','cancelled')`))
        .orderBy(desc(serviceOrders.createdAt)),
      db.select().from(crews).where(and(eq(crews.storeId, storeId), eq(crews.active, true))),
    ]);
    const crewsWithLocations = await Promise.all(
      allCrews.map(async (crew) => {
        const [loc] = await db.select().from(crewLocations).where(eq(crewLocations.crewId, crew.id)).orderBy(desc(crewLocations.updatedAt)).limit(1);
        return { ...crew, location: loc ?? null };
      })
    );
    const [totalRow, completedRow, revenueRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(serviceOrders).where(eq(serviceOrders.storeId, storeId)),
      db.select({ count: sql<number>`count(*)` }).from(serviceOrders).where(and(eq(serviceOrders.storeId, storeId), eq(serviceOrders.status, "completed"))),
      db.select({ total: sql<number>`coalesce(sum(total),0)` }).from(proInvoices).where(and(eq(proInvoices.storeId, storeId), eq(proInvoices.status, "paid"))),
    ]);
    res.json({
      orders: activeOrders.map(({ order, crew }) => ({ ...order, crew })),
      crews: crewsWithLocations,
      stats: {
        totalJobs: Number(totalRow[0]?.count ?? 0),
        completedJobs: Number(completedRow[0]?.count ?? 0),
        activeJobs: activeOrders.length,
        revenue: Number(revenueRow[0]?.total ?? 0),
        activeCrews: crewsWithLocations.filter(c => c.location).length,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ─── PRO FEATURES ─────────────────────────────────────────────────────────────

router.get("/features", async (req, res) => {
  try {
    const storeId = await sid(req);
    const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
    if (!row) return res.json({ features: [] });
    try {
      const prefs = JSON.parse(row.preferences);
      return res.json({ features: prefs.proFeatures ?? [] });
    } catch {
      return res.json({ features: [] });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/features", async (req, res) => {
  try {
    const storeId = await sid(req);
    const { features } = req.body;
    if (!Array.isArray(features)) return res.status(400).json({ error: "features must be an array" });

    const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
    if (existing) {
      let prefs: any = {};
      try { prefs = JSON.parse(existing.preferences); } catch {}
      prefs.proFeatures = features;
      await db.update(storeSettings).set({ preferences: JSON.stringify(prefs) }).where(eq(storeSettings.storeId, storeId));
    } else if (storeId) {
      await db.insert(storeSettings).values({ storeId, preferences: JSON.stringify({ proFeatures: features }) });
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
