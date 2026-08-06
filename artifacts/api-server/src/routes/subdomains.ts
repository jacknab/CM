import { Router, type IRouter, type Request } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, websitesTable, purchasedSubdomainsTable } from "@workspace/db";
import { isAuthenticated } from "../auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const RESERVED_SLUGS = [
  "www", "api", "admin", "app", "mail", "smtp", "ftp", "ns1", "ns2",
  "dev", "staging", "production", "support", "help", "blog", "status",
  "static", "assets", "cdn", "media", "img", "images",
];
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/;

/**
 * Resolve the session user's store ID.
 * Returns { storeId, isAdmin } — never trusts client-supplied values.
 */
async function resolveSessionStore(req: Request): Promise<{ storeId: string | null; isAdmin: boolean }> {
  const userId = (req.session as any)?.userId;
  if (!userId) return { storeId: null, isAdmin: false };

  const adminRow = await db.execute(
    sql`SELECT is_admin FROM users WHERE id = ${userId} LIMIT 1`
  );
  if ((adminRow.rows[0] as any)?.is_admin) return { storeId: null, isAdmin: true };

  const storeRow = await db.execute(
    sql`SELECT id FROM locations WHERE user_id = ${userId} LIMIT 1`
  );
  const storeId = storeRow.rows[0] ? String((storeRow.rows[0] as any).id) : null;
  return { storeId, isAdmin: false };
}

// ── List purchased subdomains for the session store ───────────────────────────
router.get("/subdomains", isAuthenticated, async (req, res): Promise<void> => {
  const { storeId, isAdmin } = await resolveSessionStore(req);

  // Admins may optionally filter by a specific store via query param
  const adminFilter = isAdmin ? (req.query.storeid as string | undefined) : undefined;
  const effectiveStoreId = adminFilter ?? storeId;

  if (!effectiveStoreId) {
    // The website builder can be opened by an admin/import session that has
    // no store selected yet. There are simply no store-owned subdomains to
    // list in that state; do not turn an optional panel request into a 400.
    res.json([]);
    return;
  }

  const rows = await db
    .select()
    .from(purchasedSubdomainsTable)
    .where(eq(purchasedSubdomainsTable.storeid, effectiveStoreId));

  res.json(rows);
});

// ── Check if a subdomain is available ─────────────────────────────────────────
router.get("/subdomains/check", async (req, res): Promise<void> => {
  const subdomain = (req.query.subdomain as string | undefined)?.toLowerCase().trim();
  if (!subdomain) { res.status(400).json({ error: "subdomain is required" }); return; }

  if (!SLUG_PATTERN.test(subdomain) || RESERVED_SLUGS.includes(subdomain)) {
    res.json({ available: false, subdomain, reason: "Invalid or reserved subdomain" });
    return;
  }

  const [existing] = await db
    .select({ id: purchasedSubdomainsTable.id })
    .from(purchasedSubdomainsTable)
    .where(eq(purchasedSubdomainsTable.subdomain, subdomain));

  const [existingWebsite] = await db
    .select({ id: websitesTable.id })
    .from(websitesTable)
    .where(eq(websitesTable.slug, subdomain));

  if (existing || existingWebsite) {
    res.json({ available: false, subdomain, reason: "Subdomain is already taken" });
    return;
  }

  res.json({ available: true, subdomain, reason: null });
});

// ── Purchase subdomain via Stripe Checkout ────────────────────────────────────
router.post("/subdomains/purchase", isAuthenticated, async (req, res): Promise<void> => {
  const { subdomain: rawSubdomain } = req.body as { subdomain?: string };

  if (!rawSubdomain) {
    res.status(400).json({ error: "subdomain is required" });
    return;
  }

  const { storeId, isAdmin } = await resolveSessionStore(req);
  // Admins may pass an explicit storeid override; regular users always use their own store
  const bodyStoreid = isAdmin ? (req.body as Record<string, string>).storeid : undefined;
  const effectiveStoreId = bodyStoreid ?? storeId;

  if (!effectiveStoreId) {
    res.status(400).json({ error: "No store associated with this session" });
    return;
  }

  const subdomain = rawSubdomain.toLowerCase().trim();

  if (!SLUG_PATTERN.test(subdomain) || RESERVED_SLUGS.includes(subdomain)) {
    res.status(400).json({ error: "Invalid subdomain format" });
    return;
  }

  // Check availability
  const [existing] = await db
    .select({ id: purchasedSubdomainsTable.id })
    .from(purchasedSubdomainsTable)
    .where(eq(purchasedSubdomainsTable.subdomain, subdomain));

  const [existingWebsite] = await db
    .select({ id: websitesTable.id })
    .from(websitesTable)
    .where(eq(websitesTable.slug, subdomain));

  if (existing || existingWebsite) {
    res.status(400).json({ error: "Subdomain is already taken" });
    return;
  }

  res.status(422).json({ error: "Payment processing is not configured. Subdomain purchases are not yet available." });
});

// ── Verify purchase and activate ───────────────────────────────────────────────
router.post("/subdomains/purchase/verify", isAuthenticated, async (req, res): Promise<void> => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  res.status(422).json({ error: "Payment verification not configured." });
});

// ── Assign a domain to a website ──────────────────────────────────────────────
router.post("/websites/:id/assign-domain", isAuthenticated, async (req, res): Promise<void> => {
  const id = parseInt((req.params as Record<string, string>).id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid website ID" }); return; }

  const { assignedSubdomain } = req.body as { assignedSubdomain?: string | null };

  // Resolve who is making the request from the session — never trust client-supplied storeid for auth
  const { storeId, isAdmin } = await resolveSessionStore(req);

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(eq(websitesTable.id, id));

  if (!website) { res.status(404).json({ error: "Website not found" }); return; }

  // Enforce website ownership
  if (!isAdmin && website.storeid !== storeId) {
    res.status(403).json({ error: "You do not have permission to modify this website" });
    return;
  }

  // The effective store owning the purchased subdomains
  const effectiveStoreId = isAdmin
    ? ((req.body as Record<string, string>).storeid ?? website.storeid ?? storeId)
    : storeId;

  // null means "reset to own slug" — always allowed
  if (assignedSubdomain != null && assignedSubdomain !== "") {
    // Verify the session store owns this purchased subdomain
    const [owned] = await db
      .select({ id: purchasedSubdomainsTable.id, status: purchasedSubdomainsTable.status })
      .from(purchasedSubdomainsTable)
      .where(
        and(
          eq(purchasedSubdomainsTable.subdomain, assignedSubdomain),
          eq(purchasedSubdomainsTable.storeid, effectiveStoreId ?? ""),
        )
      );

    if (!owned) {
      res.status(400).json({ error: "Subdomain not owned by this store" });
      return;
    }
    if (owned.status !== "active") {
      res.status(400).json({ error: "Subdomain is not active — payment may be pending" });
      return;
    }
  }

  const newAssigned = (assignedSubdomain == null || assignedSubdomain === "") ? null : assignedSubdomain;

  const [updated] = await db
    .update(websitesTable)
    .set({ assignedSubdomain: newAssigned })
    .where(eq(websitesTable.id, id))
    .returning();

  logger.info({ websiteId: id, assignedSubdomain: newAssigned }, "Domain assigned to website");
  res.json(updated);
});

export default router;
