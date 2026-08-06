import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { isAuthenticated } from "../auth";
import templatesRouter from "./templates";
import websitesRouter from "./websites";
import subdomainsRouter from "./subdomains";
import dashboardRouter from "./dashboard";
import imageLibraryRouter from "./imageLibrary";
import systemStatusRouter from "./systemStatus";
import siteAssetsRouter from "./siteAssets";


const router: IRouter = Router();

// ── Website Builder context ───────────────────────────────────────────────────
// Returns the storeId that belongs to the authenticated user's account.
// The website builder calls this on load instead of reading a raw ?token= URL
// parameter, so the storeId is always derived server-side from the session.
// Platform admins get { storeId: null, isAdmin: true } and can see all stores.
router.get("/website-builder/context", isAuthenticated, async (req, res): Promise<void> => {
  try {
    const userIdRaw = (req.session as any)?.userId;
    const userId = userIdRaw != null ? String(userIdRaw) : null;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const adminRow = await db.execute(
      sql`SELECT is_admin FROM users WHERE id::text = ${userId} LIMIT 1`
    );
    const storeRow = await db.execute(
      sql`SELECT id, name FROM locations WHERE user_id::text = ${userId} LIMIT 1`
    );
    const row = storeRow.rows[0] as any;

    if ((adminRow.rows[0] as any)?.is_admin) {
      // Admins can access all stores, but if they also own a store account,
      // return it for UI display convenience (Settings "Store ID" panel).
      res.json({
        storeId: row ? String(row.id) : null,
        storeName: row?.name ?? null,
        isAdmin: true,
      });
      return;
    }

    res.json({
      storeId: row ? String(row.id) : null,
      storeName: row?.name ?? null,
      isAdmin: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resolve store context" });
  }
});

router.use(templatesRouter);
router.use(subdomainsRouter);
router.use(websitesRouter);
router.use(dashboardRouter);
router.use(imageLibraryRouter);
router.use(systemStatusRouter);
router.use(siteAssetsRouter);
export default router;
