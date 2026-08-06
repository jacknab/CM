import { Router, type IRouter, type Request } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, websitesTable, templatesTable, pool } from "@workspace/db";
import { isAuthenticated } from "../auth";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const [totalWebsitesResult] = await db
    .select({ count: count() })
    .from(websitesTable);

  const [publishedWebsitesResult] = await db
    .select({ count: count() })
    .from(websitesTable)
    .where(eq(websitesTable.published, true));

  const [totalTemplatesResult] = await db
    .select({ count: count() })
    .from(templatesTable);

  const categoryResults = await db
    .select({
      category: templatesTable.category,
      count: count(),
    })
    .from(templatesTable)
    .groupBy(templatesTable.category);

  const templatesByCategory = {
    nail_salon: 0,
    barbershop: 0,
    hair_salon: 0,
  };

  for (const row of categoryResults) {
    if (row.category in templatesByCategory) {
      templatesByCategory[row.category as keyof typeof templatesByCategory] = Number(row.count);
    }
  }

  res.json({
    totalWebsites: Number(totalWebsitesResult?.count ?? 0),
    publishedWebsites: Number(publishedWebsitesResult?.count ?? 0),
    totalTemplates: Number(totalTemplatesResult?.count ?? 0),
    templatesByCategory,
  });
});

// ── Store info (business category for template filtering) ─────────────────────
// Resolves the store from the session — client must not supply a storeid.
router.get("/store-info", isAuthenticated, async (req: Request, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Check if user is admin first
  const adminRow = await db.execute(sql`SELECT is_admin FROM users WHERE id = ${userId} LIMIT 1`);
  if ((adminRow.rows[0] as any)?.is_admin) {
    // Admins may optionally pass storeid to inspect a specific store
    const adminStoreid = req.query.storeid as string | undefined;
    if (!adminStoreid) {
      res.json({ category: null });
      return;
    }
    const id = parseInt(adminStoreid, 10);
    if (isNaN(id)) { res.status(400).json({ error: "storeid must be a number" }); return; }
    const result = await pool.query<{ category: string | null }>("SELECT category FROM locations WHERE id = $1 LIMIT 1", [id]);
    res.json({ category: result.rows[0]?.category ?? null });
    return;
  }

  // Regular user: resolve store from session
  const storeRow = await db.execute(sql`SELECT id FROM locations WHERE user_id = ${userId} LIMIT 1`);
  const storeId = storeRow.rows[0] ? (storeRow.rows[0] as any).id : null;
  if (!storeId) {
    res.status(404).json({ error: "No store associated with this account" });
    return;
  }

  const result = await pool.query<{ category: string | null }>(
    "SELECT category FROM locations WHERE id = $1 LIMIT 1",
    [storeId],
  );
  if (!result.rows.length) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json({ category: result.rows[0].category });
});

export default router;
