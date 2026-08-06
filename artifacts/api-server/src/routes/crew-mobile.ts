import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "../db";
import { crews, serviceOrders, orderNotes, crewLocations } from "../../shared/schema";
import { eq, and, asc, desc, isNotNull, sql } from "drizzle-orm";
import { compareSync, hashSync } from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.CREW_JWT_SECRET ?? "certxa-crew-jwt-2025";
const OVERTIME_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

function signCrewToken(crewId: number, storeId: number): string {
  return jwt.sign({ crewId, storeId, type: "crew" }, JWT_SECRET, { expiresIn: "30d" });
}

interface CrewPayload { crewId: number; storeId: number; type: string; }

export function requireCrewAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as CrewPayload;
    if (payload.type !== "crew") return res.status(401).json({ error: "Invalid token type" });
    (req as any).crewId = payload.crewId;
    (req as any).storeId = payload.storeId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

const auth = requireCrewAuth;

// ─── OVERTIME DETECTION ───────────────────────────────────────────────────────

export function startOvertimeDetector() {
  setInterval(async () => {
    try {
      const runningOrders = await db.select().from(serviceOrders).where(
        and(eq(serviceOrders.status, "in_progress"), isNotNull(serviceOrders.startedAt), isNotNull(serviceOrders.estimatedHours), eq(serviceOrders.overtimeFlagged, false))
      );
      for (const order of runningOrders) {
        if (!order.startedAt || !order.estimatedHours) continue;
        const elapsedMs = Date.now() - new Date(order.startedAt).getTime();
        const elapsedHours = elapsedMs / 3600000;
        const estimated = Number(order.estimatedHours);
        if (elapsedHours > estimated + 0.25) {
          await db.update(serviceOrders).set({ overtimeFlagged: true, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
          await db.insert(orderNotes).values({
            orderId: order.id,
            storeId: order.storeId,
            note: `⚠️ OVERTIME ALERT: Job has been in progress for ${elapsedHours.toFixed(1)}h (estimated ${estimated}h). Crew may need assistance.`,
            authorName: "System",
          });
          console.log(`[Overtime] Job ${order.orderNumber} flagged — ${elapsedHours.toFixed(1)}h elapsed, ${estimated}h estimated`);
        }
      }
    } catch (err) {
      console.error("[Overtime detector]", err);
    }
  }, OVERTIME_CHECK_INTERVAL);
  console.log("[Crew] Overtime detector started");
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: "phone and pin required" });

    const normalizedPhone = phone.replace(/\D/g, "");
    const allCrews = await db.select().from(crews).where(
      sql`regexp_replace(${crews.phone}, '[^0-9]', '', 'g') = ${normalizedPhone}`
    );

    const crew = allCrews.find(c => c.pinHash && compareSync(String(pin), c.pinHash));
    if (!crew) return res.status(401).json({ error: "Invalid phone number or PIN" });
    if (!crew.active) return res.status(403).json({ error: "Account is inactive. Contact your office manager." });

    const token = signCrewToken(crew.id, crew.storeId);
    res.json({ token, crew: { id: crew.id, name: crew.name, color: crew.color, storeId: crew.storeId, phone: crew.phone } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── SET PIN (dashboard only — no crew auth required, uses store session) ─────

router.post("/set-pin", async (req, res) => {
  try {
    const { crewId, storeId, phone, pin } = req.body;
    if (!crewId || !storeId || !pin) return res.status(400).json({ error: "crewId, storeId, pin required" });
    if (String(pin).length < 4 || String(pin).length > 8) return res.status(400).json({ error: "PIN must be 4–8 digits" });

    const pinHash = hashSync(String(pin), 10);
    const [updated] = await db.update(crews).set({ phone: phone ?? null, pinHash }).where(and(eq(crews.id, Number(crewId)), eq(crews.storeId, Number(storeId)))).returning();
    if (!updated) return res.status(404).json({ error: "Crew not found" });
    res.json({ success: true, crew: { id: updated.id, name: updated.name, phone: updated.phone, hasPinSet: !!updated.pinHash } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to set PIN" });
  }
});

// ─── ME ───────────────────────────────────────────────────────────────────────

router.get("/me", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const [crew] = await db.select().from(crews).where(and(eq(crews.id, crewId), eq(crews.storeId, storeId)));
    if (!crew) return res.status(404).json({ error: "Not found" });

    const activeOrder = await db.select().from(serviceOrders).where(
      and(eq(serviceOrders.crewId, crewId), eq(serviceOrders.status, "in_progress"))
    );

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const completedToday = await db.select({ count: sql<number>`count(*)` }).from(serviceOrders).where(
      and(eq(serviceOrders.crewId, crewId), eq(serviceOrders.status, "completed"), sql`${serviceOrders.completedAt} >= ${todayStart}`)
    );

    res.json({
      id: crew.id, name: crew.name, color: crew.color,
      storeId: crew.storeId, phone: crew.phone,
      activeJob: activeOrder[0] ?? null,
      todayCompleted: Number(completedToday[0]?.count ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

router.get("/orders", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const { status } = req.query;

    let orders;
    if (status && status !== "all") {
      orders = await db.select().from(serviceOrders).where(
        and(eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId), eq(serviceOrders.status, String(status)))
      ).orderBy(asc(serviceOrders.scheduledAt));
    } else {
      orders = await db.select().from(serviceOrders).where(
        and(eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId))
      ).orderBy(
        sql`CASE WHEN ${serviceOrders.status} = 'in_progress' THEN 0 WHEN ${serviceOrders.status} = 'en_route' THEN 1 WHEN ${serviceOrders.status} = 'assigned' THEN 2 WHEN ${serviceOrders.status} = 'new' THEN 3 WHEN ${serviceOrders.status} = 'completed' THEN 4 ELSE 5 END`,
        asc(serviceOrders.scheduledAt)
      );
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/orders/:id", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const [order] = await db.select().from(serviceOrders).where(
      and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId))
    );
    if (!order) return res.status(404).json({ error: "Not found or not assigned to you" });
    const notes = await db.select().from(orderNotes).where(eq(orderNotes.orderId, order.id)).orderBy(asc(orderNotes.createdAt));
    res.json({ ...order, notes });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── STATUS ───────────────────────────────────────────────────────────────────

router.put("/orders/:id/status", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const { status } = req.body;

    const validStatuses = ["en_route", "in_progress", "completed", "cancelled"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const updates: Record<string, any> = { status, updatedAt: new Date() };
    if (status === "in_progress") updates.startedAt = new Date();
    if (status === "completed") updates.completedAt = new Date();

    const [order] = await db.update(serviceOrders).set(updates).where(
      and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId))
    ).returning();

    if (!order) return res.status(404).json({ error: "Not found or not assigned to you" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── TIMER ────────────────────────────────────────────────────────────────────

router.post("/orders/:id/timer/start", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const [order] = await db.update(serviceOrders).set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId)))
      .returning();
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/orders/:id/timer/stop", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const [order] = await db.update(serviceOrders).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.crewId, crewId), eq(serviceOrders.storeId, storeId)))
      .returning();
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

router.post("/orders/:id/notes", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const storeId = (req as any).storeId;
    const { note } = req.body;
    const [orderCheck] = await db.select().from(serviceOrders).where(
      and(eq(serviceOrders.id, Number(req.params.id)), eq(serviceOrders.crewId, crewId))
    );
    if (!orderCheck) return res.status(403).json({ error: "Not authorized" });
    const [createdNote] = await db.insert(orderNotes).values({ orderId: Number(req.params.id), storeId, note, authorName: "Crew" }).returning();
    res.status(201).json(createdNote);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GPS ──────────────────────────────────────────────────────────────────────

router.post("/location", auth, async (req, res) => {
  try {
    const crewId = (req as any).crewId;
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    await db.insert(crewLocations).values({ crewId, lat: String(lat), lng: String(lng), updatedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
