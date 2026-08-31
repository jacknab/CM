import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, count, isNull, ne, or } from "drizzle-orm";
import { db, websitesTable, templatesTable, pageViewsTable } from "@workspace/db";
import { isAuthenticated } from "../auth";
import {
  CheckSlugQueryParams,
  CreateWebsiteBody,
  GetWebsiteParams,
  UpdateWebsiteParams,
  UpdateWebsiteBody,
  DeleteWebsiteParams,
  PublishWebsiteParams,
  UnpublishWebsiteParams,
  ResolveTenantParams,
} from "@workspace/api-zod";
import {
  handleWebsitePreview,
  handleTenantSiteBySlug,
  handleTenantSiteByDomain,
  handleTenantSitemapBySlug,
  handleTenantRobotsBySlug,
} from "../lib/template-serve";
import { extractTextFields } from "../lib/content-extractor";
import { logger } from "../lib/logger";
import { findProjectDir, findDistDir } from "../lib/template-serve";
import { provisionSsl, revokeSSL } from "../lib/sslProvisioner";
import fs from "fs";

/**
 * Resolve the authenticated session user's store context.
 * Returns { storeId, isAdmin } — never trusts client-supplied values.
 * Platform admins get isAdmin=true and can operate on any store. When they
 * also own a location, that location is still returned as the default store
 * for website-builder writes.
 */
async function resolveSessionStore(req: Request): Promise<{ storeId: string | null; isAdmin: boolean }> {
  const userIdRaw = (req.session as any)?.userId;
  const userId = userIdRaw != null ? String(userIdRaw) : null;
  if (!userId) return { storeId: null, isAdmin: false };

  const adminRow = await db.execute(
    sql`SELECT is_admin FROM users WHERE id::text = ${userId} LIMIT 1`
  );
  const storeRow = await db.execute(
    sql`SELECT id FROM locations WHERE user_id::text = ${userId} LIMIT 1`
  );
  const storeId = storeRow.rows[0] ? String((storeRow.rows[0] as any).id) : null;
  return { storeId, isAdmin: Boolean((adminRow.rows[0] as any)?.is_admin) };
}

/**
 * Fetch a website and verify the session user owns it.
 * Returns the website on success, or sends a 403/404 and returns null.
 */
async function assertWebsiteOwnership(
  req: Request,
  res: Response,
  websiteId: number
): Promise<typeof websitesTable.$inferSelect | null> {
  const [website] = await db
    .select()
    .from(websitesTable)
    .where(eq(websitesTable.id, websiteId));

  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return null;
  }

  const { storeId, isAdmin } = await resolveSessionStore(req);
  if (!isAdmin && website.storeid !== storeId) {
    res.status(403).json({ error: "You do not have permission to access this website" });
    return null;
  }

  return website;
}

/**
 * Fire-and-forget SSL provisioning after a domain goes active.
 * Updates ssl_status in the DB with the result; never throws so it can't
 * block the HTTP response that triggered it.
 */
async function triggerSslProvisioning(websiteId: number, domain: string): Promise<void> {
  try {
    await db
      .update(websitesTable)
      .set({ sslStatus: "pending", sslError: null })
      .where(eq(websitesTable.id, websiteId));

    const result = await provisionSsl(domain);

    if (result.status === "ok") {
      await db
        .update(websitesTable)
        .set({ sslStatus: "active", sslProvisionedAt: new Date(), sslError: null })
        .where(eq(websitesTable.id, websiteId));
      logger.info({ websiteId, domain }, "[SSL] Certificate provisioned successfully");
    } else if (result.status === "skipped") {
      await db
        .update(websitesTable)
        .set({ sslStatus: "skipped", sslError: result.reason })
        .where(eq(websitesTable.id, websiteId));
      logger.warn({ websiteId, domain, reason: result.reason }, "[SSL] Provisioning skipped");
    } else {
      await db
        .update(websitesTable)
        .set({ sslStatus: "failed", sslError: result.message })
        .where(eq(websitesTable.id, websiteId));
      logger.error({ websiteId, domain, message: result.message }, "[SSL] Provisioning failed");
    }
  } catch (err) {
    logger.error({ err, websiteId, domain }, "[SSL] Unexpected error during provisioning");
    await db
      .update(websitesTable)
      .set({ sslStatus: "failed", sslError: (err as Error).message })
      .where(eq(websitesTable.id, websiteId))
      .catch(() => {});
  }
}

const router: IRouter = Router();

const RESERVED_SLUGS = [
  "www", "api", "admin", "app", "mail", "smtp", "ftp", "ns1", "ns2",
  "dev", "staging", "production", "support", "help", "blog", "status",
  "static", "assets", "cdn", "media", "img", "images",
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/;
const BLOOM_TEMPLATE_NAME = "Nail Salon — Bloom";

async function isBloomTemplate(templateId: number | null | undefined): Promise<boolean> {
  if (!templateId) return false;

  const [template] = await db
    .select({ name: templatesTable.name, category: templatesTable.category })
    .from(templatesTable)
    .where(eq(templatesTable.id, templateId))
    .limit(1);

  return template?.name === BLOOM_TEMPLATE_NAME && template.category === "nail_salon";
}

async function hasBookingSlugConflict(slug: string, storeid: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id
    FROM locations
    WHERE booking_slug = ${slug}
      AND id::text <> ${storeid}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

function validateSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug) return { valid: false, reason: "Slug is required" };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      reason: "Slug must be 2-63 characters, lowercase letters, numbers, and hyphens only (no leading/trailing hyphens)",
    };
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return { valid: false, reason: "This slug is reserved and cannot be used" };
  }
  return { valid: true };
}

router.get("/websites/check-slug", isAuthenticated, async (req, res): Promise<void> => {
  const parsed = CheckSlugQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { slug } = parsed.data;

  const validation = validateSlug(slug);
  if (!validation.valid) {
    res.json({ available: false, slug, reason: validation.reason ?? null });
    return;
  }

  // Use session-resolved store ID — never trust the client-supplied ?storeid= param
  const { storeId } = await resolveSessionStore(req);

  const [existing] = await db
    .select({ id: websitesTable.id, storeid: websitesTable.storeid })
    .from(websitesTable)
    .where(eq(websitesTable.slug, slug));

  // A store may revisit website setup with its current slug prefilled.
  // Treat that slug as available for the owning store, while still blocking
  // every other store from claiming it.
  if (existing && existing.storeid !== (storeId ? String(storeId) : null)) {
    res.json({ available: false, slug, reason: "This slug is already taken" });
    return;
  }

  const bookingSlugConflict = await db.execute(sql`
    SELECT id, user_id
    FROM locations
    WHERE booking_slug = ${slug}
      AND id::text <> COALESCE(${storeId}, '')
    LIMIT 1
  `);
  if (bookingSlugConflict.rows.length > 0) {
    res.json({ available: false, slug, reason: "This slug is already used by online booking" });
    return;
  }

  res.json({ available: true, slug, reason: null });
});

router.get("/websites", isAuthenticated, async (req, res): Promise<void> => {
  try {
    const { storeId, isAdmin } = await resolveSessionStore(req);

    let websites;
    if (isAdmin) {
      // Platform admins: honour an explicit ?storeid= filter, otherwise fall back to their
      // own store (if they have one), and only show everything as a last resort.
      const filterStore = (req.query as Record<string, string>).storeid;
      if (filterStore) {
        websites = await db.select().from(websitesTable).where(eq(websitesTable.storeid, filterStore)).orderBy(websitesTable.createdAt);
      } else {
        // Prefer the admin's own store. Include legacy NULL-store websites
        // because older admin-created rows were saved without a storeid and
        // would otherwise remain permanently hidden from their owner.
        const ownStoreId = storeId;
        websites = ownStoreId
          ? await db.select().from(websitesTable).where(
              or(eq(websitesTable.storeid, ownStoreId), isNull(websitesTable.storeid))
            ).orderBy(websitesTable.createdAt)
          : await db.select().from(websitesTable).orderBy(websitesTable.createdAt);
      }
    } else {
      // Regular users only see websites belonging to their own store
      websites = storeId
        ? await db.select().from(websitesTable).where(eq(websitesTable.storeid, storeId)).orderBy(websitesTable.createdAt)
        : [];
    }

    res.json(websites);
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to list websites");
    res.status(500).json({ error: "Failed to list websites" });
  }
});

router.post("/websites", isAuthenticated, async (req, res): Promise<void> => {
  const parsed = CreateWebsiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, slug, templateId, content, publisherType, autoSettings } = parsed.data;

  // Resolve storeId from the authenticated session — never trust the client-supplied value
  const { storeId: sessionStoreId, isAdmin } = await resolveSessionStore(req);
  // Admins may pass a storeid override; regular users always get their own store
  const storeid = isAdmin ? (parsed.data.storeid ?? sessionStoreId) : sessionStoreId;

  if (!storeid) {
    res.status(403).json({ error: "No store is associated with this session" });
    return;
  }

  const validation = validateSlug(slug);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason });
    return;
  }

  const [existing] = await db
    .select({ id: websitesTable.id, storeid: websitesTable.storeid })
    .from(websitesTable)
    .where(eq(websitesTable.slug, slug));

  if (existing) {
    // Slugs are globally unique in wb_websites, so keep the availability
    // check and the insert constraint consistent for every store.
    res.status(409).json({ error: "A website with this slug already exists" });
    return;
  }

  const bloomWebsite = await isBloomTemplate(templateId);
  if (bloomWebsite && await hasBookingSlugConflict(slug, storeid)) {
    res.status(409).json({ error: "This slug is already used by another store's online booking" });
    return;
  }

  // No per-plan website limit — all plans can create websites freely.

  const website = await db.transaction(async (tx) => {
    if (bloomWebsite) {
      await tx.execute(sql`
        UPDATE locations
        SET booking_slug = ${slug}
        WHERE id::text = ${storeid}
      `);
    }

    const [createdWebsite] = await tx
      .insert(websitesTable)
      .values({
        name,
        slug,
        storeid,
        templateId: templateId ?? null,
        content: content ?? {},
        published: templateId != null,
        publishedAt: templateId != null ? new Date() : null,
        publisherType: publisherType ?? "template",
        autoSettings: autoSettings ?? {},
      })
      .returning();

    return createdWebsite;
  });

  res.status(201).json(website);
});

router.get("/websites/:id", isAuthenticated, async (req, res): Promise<void> => {
  try {
    const params = GetWebsiteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const website = await assertWebsiteOwnership(req, res, params.data.id);
    if (!website) return;

    res.json(website);
  } catch (err: any) {
    logger.error({ err: err.message, websiteId: req.params.id }, "Failed to fetch website");
    res.status(500).json({ error: "Failed to fetch website" });
  }
});

router.put("/websites/:id", isAuthenticated, async (req, res): Promise<void> => {
  try {
    const params = UpdateWebsiteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateWebsiteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Verify ownership before allowing any mutation
    const owned = await assertWebsiteOwnership(req, res, params.data.id);
    if (!owned) return;

    const targetSlug = parsed.data.slug ?? owned.slug;
    const targetTemplateId = parsed.data.templateId !== undefined
      ? parsed.data.templateId
      : owned.templateId;
    const bloomWebsite = await isBloomTemplate(targetTemplateId);

    if (parsed.data.slug !== undefined) {
      const validation = validateSlug(parsed.data.slug);
      if (!validation.valid) {
        res.status(400).json({ error: validation.reason });
        return;
      }

      const [existingSlug] = await db
        .select({ id: websitesTable.id })
        .from(websitesTable)
        .where(and(eq(websitesTable.slug, parsed.data.slug), ne(websitesTable.id, params.data.id)))
        .limit(1);
      if (existingSlug) {
        res.status(409).json({ error: "A website with this slug already exists" });
        return;
      }
    }

    if (bloomWebsite && owned.storeid && await hasBookingSlugConflict(targetSlug, owned.storeid)) {
      res.status(409).json({ error: "This slug is already used by another store's online booking" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.slug !== undefined) updateData.slug = parsed.data.slug;
    if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
    if (parsed.data.templateId !== undefined) updateData.templateId = parsed.data.templateId;
    if (parsed.data.publisherType !== undefined) updateData.publisherType = parsed.data.publisherType;
    if (parsed.data.autoSettings !== undefined) updateData.autoSettings = parsed.data.autoSettings;
    // Storeid is intentionally excluded — it is set at creation time and must not be changed by clients

    const website = await db.transaction(async (tx) => {
      if (bloomWebsite && owned.storeid) {
        await tx.execute(sql`
          UPDATE locations
          SET booking_slug = ${targetSlug}
          WHERE id::text = ${owned.storeid}
        `);
      }

      const [updatedWebsite] = await tx
        .update(websitesTable)
        .set(updateData)
        .where(eq(websitesTable.id, params.data.id))
        .returning();
      return updatedWebsite;
    });

    if (!website) {
      res.status(404).json({ error: "Website not found" });
      return;
    }

    res.json(website);
  } catch (err: any) {
    logger.error({ err: err.message, websiteId: req.params.id }, "Failed to save website");
    res.status(500).json({ error: "Failed to save changes" });
  }
});

router.delete("/websites/:id", isAuthenticated, async (req, res): Promise<void> => {
  const params = DeleteWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await assertWebsiteOwnership(req, res, params.data.id);
  if (!owned) return;

  await db.delete(websitesTable).where(eq(websitesTable.id, params.data.id));

  res.sendStatus(204);
});

router.post("/websites/:id/publish", isAuthenticated, async (req, res): Promise<void> => {
  const params = PublishWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Fetch the target website and verify ownership
  const target = await assertWebsiteOwnership(req, res, params.data.id);
  if (!target) return;

  // Auto-unpublish every other published site that shares the same storeid bucket
  // so only 1 live site exists per store at any time.
  if (target.storeid) {
    await db
      .update(websitesTable)
      .set({ published: false })
      .where(and(
        eq(websitesTable.storeid, target.storeid),
        eq(websitesTable.published, true),
        ne(websitesTable.id, params.data.id)
      ));
  } else {
    // No storeid — still enforce single-live among all null-storeid websites
    await db
      .update(websitesTable)
      .set({ published: false })
      .where(and(
        isNull(websitesTable.storeid),
        eq(websitesTable.published, true),
        ne(websitesTable.id, params.data.id)
      ));
  }

  // Now publish the requested site
  const [website] = await db
    .update(websitesTable)
    .set({ published: true, publishedAt: new Date() })
    .where(eq(websitesTable.id, params.data.id))
    .returning();

  logger.info({ websiteId: website.id, slug: website.slug, storeid: website.storeid }, "Website set as live");
  res.json(website);
});

router.post("/websites/:id/unpublish", isAuthenticated, async (req, res): Promise<void> => {
  const params = UnpublishWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await assertWebsiteOwnership(req, res, params.data.id);
  if (!owned) return;

  const [website] = await db
    .update(websitesTable)
    .set({ published: false })
    .where(eq(websitesTable.id, params.data.id))
    .returning();

  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  res.json(website);
});

// ── Website preview: serve template with text replacements injected ────────────
router.get("/websites/:id/preview", handleWebsitePreview);
router.get("/websites/:id/preview/*splat", handleWebsitePreview);

// ── Extract content fields from template via Puppeteer ────────────────────────
router.post("/websites/:id/extract-content", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  if (!website.templateId) {
    res.status(422).json({ error: "No template assigned to this website" });
    return;
  }

  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.id, website.templateId));

  if (!template || !template.filesPath || !fs.existsSync(template.filesPath)) {
    res.status(422).json({ error: "Template files not found on disk" });
    return;
  }

  const projectDir = findProjectDir(template.filesPath);
  const distDir = findDistDir(projectDir);

  if (!distDir) {
    res.status(422).json({ error: "Template not yet built — please wait for processing to complete" });
    return;
  }

  try {
    const fields = await extractTextFields(distDir, template.id);
    const content = { ...(website.content as object), fields };

    const [updated] = await db
      .update(websitesTable)
      .set({ content })
      .where(eq(websitesTable.id, params.data.id))
      .returning();

    logger.info({ websiteId: params.data.id, fieldCount: fields.length }, "Content fields extracted");
    res.json(updated);
  } catch (err) {
    logger.error({ err, websiteId: params.data.id }, "Content extraction failed");
    res.status(500).json({ error: "Failed to extract content from template" });
  }
});

// ── Custom Domain: save intent + generate verification token ──────────────────
router.post("/websites/:id/custom-domain/init", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { domain } = req.body as { domain?: string };
  if (!domain || domain.trim().length < 3) {
    res.status(400).json({ error: "A valid domain name is required" });
    return;
  }

  // Strip protocol + www so only bare hostname is stored
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  // Reuse existing token if the same domain is already stored; generate a new one otherwise
  const existingToken =
    website.customDomain === cleanDomain && website.customDomainToken
      ? website.customDomainToken
      : crypto.randomUUID().replace(/-/g, "");

  await db
    .update(websitesTable)
    .set({
      customDomain: cleanDomain,
      customDomainStatus: "pending_dns",
      customDomainToken: existingToken,
    })
    .where(eq(websitesTable.id, params.data.id));

  logger.info({ websiteId: params.data.id, customDomain: cleanDomain }, "Custom domain intent saved");
  res.json({ domain: cleanDomain, token: existingToken });
});

// ── Custom Domain: verify DNS ownership ───────────────────────────────────────
// Checks that the domain's A record resolves to our VPS IP.
// DNS confirmation alone is sufficient proof of ownership — an HTTP fetch-back
// check creates a chicken-and-egg problem (nginx has no vhost for the domain
// until after activation, so the fetch always returns the default server page).
router.get("/websites/:id/custom-domain/verify", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website || !website.customDomain || !website.customDomainToken) {
    if (website) res.status(404).json({ error: "No custom domain configured" });
    return;
  }

  const domain = website.customDomain;
  const VPS_IP = "216.128.140.207";

  // DNS check — resolve A record(s) and confirm at least one points to our VPS.
  // Also accept CNAME chains that ultimately resolve to the VPS IP.
  let dnsOk = false;
  try {
    const { promises: dns } = await import("dns");
    // Try A record first
    const addresses = await dns.resolve4(domain).catch(() => [] as string[]);
    dnsOk = addresses.includes(VPS_IP);

    // If bare domain fails, also try www prefix (some registrars add www CNAME)
    if (!dnsOk) {
      const wwwAddresses = await dns.resolve4(`www.${domain}`).catch(() => [] as string[]);
      dnsOk = wwwAddresses.includes(VPS_IP);
    }
  } catch {
    dnsOk = false;
  }

  // httpOk mirrors dnsOk — if DNS points to our server, the domain is reachable
  // by definition (nginx will serve it once activated). No separate HTTP probe needed.
  const httpOk = dnsOk;

  res.json({ dnsOk, httpOk, domain });
});

// ── Custom Domain: create Stripe Checkout session ─────────────────────────────
router.post("/websites/:id/custom-domain/checkout", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { domain } = req.body as { domain?: string };
  if (!domain || domain.trim().length < 3) {
    res.status(400).json({ error: "A valid domain name is required" });
    return;
  }
  const cleanDomain = domain.trim().toLowerCase();

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  // If domain is already active, just confirm
  if (website.customDomainStatus === "active" && website.customDomain === cleanDomain) {
    res.status(200).json({ checkoutUrl: null, domain: cleanDomain, alreadyActive: true });
    return;
  }

  res.status(422).json({ error: "Payment processing is not configured. Custom domain purchases are not yet available." });
});

// ── Custom Domain: Stripe success redirect ────────────────────────────────────
router.get("/websites/:id/custom-domain/success", async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.redirect(`/websites`);
    return;
  }

  const sessionId = (req.query as Record<string, string>).session_id;
  if (!sessionId) {
    res.redirect(`/websites/${params.data.id}/edit`);
    return;
  }

  res.redirect(`/websites/${params.data.id}/edit`);
});

// ── Custom Domain: activate (no payment required — included in subscription) ──
router.post("/websites/:id/custom-domain/activate", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  if (!website.customDomain) {
    res.status(400).json({ error: "No custom domain configured" });
    return;
  }

  await db
    .update(websitesTable)
    .set({ customDomainStatus: "active" })
    .where(eq(websitesTable.id, params.data.id));

  logger.info({ websiteId: params.data.id, customDomain: website.customDomain }, "Custom domain activated (no payment)");

  // Kick off SSL provisioning in the background (non-blocking)
  triggerSslProvisioning(params.data.id, website.customDomain).catch(() => {});

  res.json({ success: true, domain: website.customDomain });
});

// ── Remove custom domain ──────────────────────────────────────────────────────
router.delete("/websites/:id/custom-domain", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  await db
    .update(websitesTable)
    .set({ customDomain: null, customDomainStatus: null, customDomainToken: null, sslStatus: null, sslProvisionedAt: null, sslError: null })
    .where(eq(websitesTable.id, params.data.id));

  logger.info({ websiteId: params.data.id, removedDomain: website.customDomain }, "Custom domain removed");

  // Revoke SSL cert and remove nginx vhost in the background (non-blocking)
  if (website.customDomain) {
    revokeSSL(website.customDomain).catch((err) => {
      logger.warn({ err, domain: website.customDomain }, "[SSL] Revocation error (non-fatal)");
    });
  }

  res.json({ success: true });
});

// ── Custom Domain: retry SSL provisioning ─────────────────────────────────────
// Call this if ssl_status is 'failed' or 'skipped' to re-attempt cert issuance.
// The domain must already be active and DNS must point to the server.
router.post("/websites/:id/custom-domain/provision-ssl", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  if (website.customDomainStatus !== "active" || !website.customDomain) {
    res.status(400).json({ error: "Domain must be active before SSL can be provisioned" });
    return;
  }

  if (website.sslStatus === "pending") {
    res.status(409).json({ error: "SSL provisioning already in progress" });
    return;
  }

  // Accept immediately — provisioning runs in background
  res.json({ success: true, message: "SSL provisioning started", domain: website.customDomain });

  triggerSslProvisioning(params.data.id, website.customDomain).catch(() => {});
});

// ── Auto-mode live preview ────────────────────────────────────────────────────
// Renders the auto-generated HTML page server-side and serves it for the
// settings-panel preview iframe in the Website Builder.
router.get("/websites/:id/auto-preview", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  try {
    const { buildTenantData } = await import("../lib/tenant-data");
    const { renderSalonPage } = await import("../lib/render-salon-page");

    const websiteMeta = { id: website.id, name: website.name, slug: website.slug };
    let tenantData;
    if (website.storeid) {
      tenantData = await buildTenantData(website.storeid, websiteMeta);
    } else {
      tenantData = {
        website: websiteMeta,
        business: null,
        hours: [],
        services: [],
        serviceCategories: [],
        staff: [],
        reviews: [],
        googleReviewCount: 0,
        googleAvgRating: 0,
        serviceReviews: {},
        galleryPhotos: [],
      };
    }

    const appUrl = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 9200}`;
    const canonicalUrl = website.customDomain
      ? `https://${website.customDomain}`
      : `${appUrl}/${website.slug}`;

    const autoSettings = (website.autoSettings ?? {}) as Record<string, unknown>;
    const html = renderSalonPage(tenantData, autoSettings, canonicalUrl, appUrl);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } catch (err: any) {
    logger.error({ err: err.message, websiteId: params.data.id }, "Auto-preview render failed");
    res.status(500).send(`<pre>Render error: ${err.message}</pre>`);
  }
});

// ── Tenant data API (for data-aware templates) ────────────────────────────────
// Returns live business data from the platform DB for a given website slug.
// Queries platform tables (locations, services, staff, etc.) with per-query
// try/catch — returns empty arrays gracefully if tables don't exist yet.
router.get("/tenant/:slug/data", async (req, res): Promise<void> => {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.status(400).json({ error: "Missing slug" }); return; }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(eq(websitesTable.slug, slug));

  if (!website) { res.status(404).json({ error: "Website not found" }); return; }

  const storeid = website.storeid;

  if (storeid) {
    try {
      const statusRow = await db.execute(sql`
        SELECT account_status FROM locations WHERE id = ${storeid} LIMIT 1
      `);
      const accountStatus = String((statusRow.rows as any[])[0]?.account_status ?? "active").toLowerCase();
      if (accountStatus === "suspended" || accountStatus === "canceled") {
        res.status(503).json({ error: "Under Maintenance" });
        return;
      }
    } catch {
      // If status lookup fails, continue with normal behavior.
    }
  }

  let business: Record<string, unknown> | null = null;
  let hours: Record<string, unknown>[] = [];
  let services: Record<string, unknown>[] = [];
  let serviceCategories: Record<string, unknown>[] = [];
  let staff: Record<string, unknown>[] = [];
  let reviews: Record<string, unknown>[] = [];
  let serviceReviews: Record<number, unknown> = {};

  if (storeid) {
    try {
      const r = await db.execute(sql`
        SELECT id, name, address, phone, email, city, state, postcode, booking_slug, category
        FROM locations WHERE id = ${storeid} LIMIT 1`);
      if (r.rows.length > 0) business = r.rows[0] as Record<string, unknown>;
    } catch { /* platform table may not exist in this environment */ }

    try {
      const r = await db.execute(sql`
        SELECT day_of_week, open_time, close_time, is_closed
        FROM business_hours WHERE store_id = ${storeid} ORDER BY day_of_week`);
      hours = r.rows as Record<string, unknown>[];
    } catch { /* platform table may not exist */ }

    try {
      const r = await db.execute(sql`
        SELECT id, name FROM service_categories
        WHERE store_id = ${storeid}
          AND (hidden_from_public IS NULL OR hidden_from_public = false)
        ORDER BY sort_order NULLS LAST, id`);
      serviceCategories = r.rows as Record<string, unknown>[];
    } catch { /* platform table may not exist */ }

    try {
      const r = await db.execute(sql`
         SELECT id, name, price, duration, category_id, description, image_url FROM services
         WHERE store_id = ${storeid}
           AND is_active = true
          AND (hidden_from_public IS NULL OR hidden_from_public = false)
        ORDER BY category_id NULLS LAST, id`);
      services = r.rows as Record<string, unknown>[];
    } catch { /* platform table may not exist */ }

    try {
      const r = await db.execute(sql`
        SELECT id, name, role, avatar_url, bio FROM staff
        WHERE store_id = ${storeid} AND status = 'active' ORDER BY id LIMIT 12`);
      staff = r.rows as Record<string, unknown>[];
    } catch { /* platform table may not exist */ }

    try {
      const r = await db.execute(sql`
        SELECT customer_name,
               reviewer_photo_url,
               rating,
               review_text,
               review_text AS comment,
               review_create_time,
               review_create_time AS created_at,
               COALESCE(review_image_urls, '[]')::JSONB AS review_image_urls,
               review_media_items,
               owner_reply
        FROM google_reviews
        WHERE store_id = ${storeid} AND rating >= 4
        ORDER BY review_create_time DESC LIMIT 10`);
      reviews = r.rows as Record<string, unknown>[];
    } catch {
      try {
        const r = await db.execute(sql`
        SELECT customer_name, NULL::TEXT AS reviewer_photo_url, rating,
               comment AS review_text, comment, created_at AS review_create_time,
               created_at, NULL::TEXT AS review_image_urls,
               NULL::JSONB AS review_media_items, NULL::JSONB AS owner_reply
        FROM reviews
          WHERE store_id = ${storeid} AND is_public = true
          ORDER BY created_at DESC LIMIT 10`);
        reviews = r.rows as Record<string, unknown>[];
      } catch { /* platform table may not exist */ }
    }
  }

  if (storeid) {
    try {
      const { getServiceReviewsForStore } = await import("../lib/serviceReviewMatcher");
       serviceReviews = await getServiceReviewsForStore(Number(storeid));
    } catch { /* non-fatal — table may not exist yet */ }
  }

  logger.info({ slug, storeid, hasData: !!business }, "Tenant data fetched");
  res.json({ website: { id: website.id, name: website.name, slug: website.slug }, business, hours, services, serviceCategories, staff, reviews, serviceReviews });
});

// ── Salon real-time status (public, no auth) ─────────────────────────────────
// Returns current walk-in availability based on timeclock, appointments, and business hours.
router.get("/tenant/:slug/status", async (req, res): Promise<void> => {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.status(400).json({ error: "Missing slug" }); return; }

  const [website] = await db
    .select({ id: websitesTable.id, storeid: websitesTable.storeid })
    .from(websitesTable)
    .where(eq(websitesTable.slug, slug));

  if (!website) { res.status(404).json({ error: "Website not found" }); return; }

  const storeid = website.storeid;
  if (!storeid) {
    res.json({ isOpen: false, staffWorking: 0, staffAvailable: 0, staffBusy: 0, upcomingCount: 0, status: "closed" });
    return;
  }

  try {
    // Resolve timezone from location record
    const locRow = await db.execute(sql`
      SELECT COALESCE(timezone, 'America/New_York') AS tz FROM locations WHERE id = ${storeid} LIMIT 1
    `);
    const tz: string = (locRow.rows[0] as any)?.tz ?? "America/New_York";

    // Current day-of-week and HH:MM in the salon's timezone
    const timeRow = await db.execute(sql`
      SELECT
        EXTRACT(DOW FROM NOW() AT TIME ZONE ${tz})::integer AS dow,
        TO_CHAR(NOW() AT TIME ZONE ${tz}, 'HH24:MI') AS cur_time
    `);
    const { dow, cur_time } = timeRow.rows[0] as { dow: number; cur_time: string };

    // Check business hours for today
    const hoursRow = await db.execute(sql`
      SELECT open_time, close_time, is_closed FROM business_hours
      WHERE store_id = ${storeid} AND day_of_week = ${dow}
      LIMIT 1
    `);
    let isOpen = false;
    if (hoursRow.rows.length > 0) {
      const h = hoursRow.rows[0] as { open_time: string; close_time: string; is_closed: boolean };
      if (!h.is_closed && cur_time >= h.open_time && cur_time <= h.close_time) {
        isOpen = true;
      }
    }

    // Staff clocked in right now (clock_out IS NULL for today's work_date)
    const clockedRow = await db.execute(sql`
      SELECT COUNT(*)::integer AS cnt FROM timeclock
      WHERE store_id = ${storeid}
        AND work_date = (NOW() AT TIME ZONE ${tz})::date
        AND clock_out IS NULL
    `);
    const staffWorking: number = parseInt(String((clockedRow.rows[0] as any)?.cnt ?? 0), 10);

    // Staff actively serving / checked-in right now
    const busyRow = await db.execute(sql`
      SELECT COUNT(DISTINCT staff_id)::integer AS cnt FROM appointments
      WHERE store_id = ${storeid}
        AND (date AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date
        AND status IN ('checked_in', 'serving', 'started')
        AND staff_id IS NOT NULL
    `);
    const staffBusy: number = parseInt(String((busyRow.rows[0] as any)?.cnt ?? 0), 10);

    const staffAvailable = Math.max(0, staffWorking - staffBusy);

    // Upcoming confirmed/pending appointments in the next 2 hours
    const upcomingRow = await db.execute(sql`
      SELECT COUNT(*)::integer AS cnt FROM appointments
      WHERE store_id = ${storeid}
        AND date BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
        AND status IN ('pending', 'confirmed')
    `);
    const upcomingCount: number = parseInt(String((upcomingRow.rows[0] as any)?.cnt ?? 0), 10);

    const status =
      !isOpen             ? "closed"
      : staffAvailable > 0 ? "accepting_walkins"
      :                      "appointment_recommended";

    res.json({ isOpen, staffWorking, staffAvailable, staffBusy, upcomingCount, status });
  } catch {
    // Fail gracefully — tables may not exist in all environments
    res.json({ isOpen: false, staffWorking: 0, staffAvailable: 0, staffBusy: 0, upcomingCount: 0, status: "closed" });
  }
});

// ── Tenant site serving by slug (for Nginx subdomain routing) ────────────────
// Nginx rewrites *.certxa.com/* → /api/tenant/:slug/site/*
// These routes serve the full compiled template with content injection.
router.get("/tenant/:slug/site", handleTenantSiteBySlug);
router.get("/tenant/:slug/site/*splat", handleTenantSiteBySlug);

// ── Sitemap & robots.txt (slug-based, for Nginx subdomain routing) ────────────
router.get("/tenant/:slug/sitemap.xml", handleTenantSitemapBySlug);
router.get("/tenant/:slug/robots.txt", handleTenantRobotsBySlug);

// ── Tenant site serving by custom domain (for BYOD routing) ──────────────────
// Nginx catch-all for custom domains proxies here with the original Host header.
// The handler looks up the website by custom_domain + status='active'.
router.get("/domain-site", handleTenantSiteByDomain);
router.get("/domain-site/*splat", handleTenantSiteByDomain);

// ── Visitor Analytics: Public pageview tracking ────────────────────────────────
// No auth required — called by a tiny tracking script injected into every live page.
router.post("/tenant/:slug/pageview", async (req, res): Promise<void> => {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.sendStatus(204); return; }

  const [website] = await db
    .select({ id: websitesTable.id, published: websitesTable.published })
    .from(websitesTable)
    .where(eq(websitesTable.slug, slug));

  if (!website || !website.published) { res.sendStatus(204); return; }

  const { path: urlPath, referrer } = (req.body ?? {}) as { path?: string; referrer?: string };

  // Privacy-friendly: truncated hash of IP — no raw PII stored
  const rawIp = ((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0]?.trim()
    ?? req.socket?.remoteAddress ?? "";
  const { createHash } = await import("crypto");
  const ipHash = createHash("sha256").update(rawIp).digest("hex").slice(0, 16);

  // Classify UA; drop obvious bots
  const ua = (req.headers["user-agent"] ?? "").toLowerCase();
  if (ua.includes("bot") || ua.includes("crawl") || ua.includes("spider") || ua.includes("slurp")) {
    res.sendStatus(204); return;
  }
  const uaSnippet = (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) ? "mobile" : "desktop";

  try {
    await db.insert(pageViewsTable).values({
      websiteId: website.id,
      path: (urlPath ?? "/").slice(0, 500),
      referrer: referrer ? referrer.slice(0, 500) : null,
      ipHash,
      uaSnippet,
    });
  } catch { /* silently ignore insert errors */ }

  res.sendStatus(204);
});

// ── Analytics: authenticated traffic stats for a website ──────────────────────
router.get("/websites/:id/analytics", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  const days = Math.min(parseInt((req.query as Record<string, string>).days ?? "30", 10) || 30, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  try {
    const [totalRow] = (await db.execute(sql`SELECT COUNT(*) AS total FROM wb_page_views WHERE website_id = ${params.data.id}`)).rows as any[];
    const [weekRow]  = (await db.execute(sql`SELECT COUNT(*) AS c FROM wb_page_views WHERE website_id = ${params.data.id} AND created_at >= ${weekAgo}`)).rows as any[];
    const [monthRow] = (await db.execute(sql`SELECT COUNT(*) AS c FROM wb_page_views WHERE website_id = ${params.data.id} AND created_at >= ${monthAgo}`)).rows as any[];
    const [todayRow] = (await db.execute(sql`SELECT COUNT(*) AS c FROM wb_page_views WHERE website_id = ${params.data.id} AND created_at >= ${todayStart}`)).rows as any[];

    const byDayRows = (await db.execute(sql`
      SELECT DATE(created_at AT TIME ZONE 'UTC') AS date, COUNT(*) AS views
      FROM wb_page_views
      WHERE website_id = ${params.data.id} AND created_at >= ${since}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `)).rows as any[];

    const referrerRows = (await db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(referrer), ''), 'direct') AS referrer, COUNT(*) AS count
      FROM wb_page_views
      WHERE website_id = ${params.data.id} AND created_at >= ${since}
      GROUP BY 1 ORDER BY count DESC LIMIT 10
    `)).rows as any[];

    const pathRows = (await db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(path), ''), '/') AS path, COUNT(*) AS count
      FROM wb_page_views
      WHERE website_id = ${params.data.id} AND created_at >= ${since}
      GROUP BY 1 ORDER BY count DESC LIMIT 10
    `)).rows as any[];

    // Fill every day in the window even if no views that day
    const byDayMap: Record<string, number> = {};
    for (const r of byDayRows) byDayMap[r.date] = Number(r.views);
    const byDay = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      return { date: key, views: byDayMap[key] ?? 0 };
    });

    res.json({
      total: Number(totalRow?.total ?? 0),
      thisWeek: Number(weekRow?.c ?? 0),
      thisMonth: Number(monthRow?.c ?? 0),
      today: Number(todayRow?.c ?? 0),
      byDay,
      topReferrers: referrerRows.map((r) => ({ referrer: String(r.referrer), count: Number(r.count) })),
      topPaths:     pathRows.map((r) => ({ path: String(r.path), count: Number(r.count) })),
    });
  } catch (err: any) {
    logger.error({ err: err.message, websiteId: params.data.id }, "Analytics query failed");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ── SEO: AI-powered scan ───────────────────────────────────────────────────────
router.post("/websites/:id/seo-scan", isAuthenticated, async (req, res): Promise<void> => {
  const params = GetWebsiteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const website = await assertWebsiteOwnership(req, res, params.data.id);
  if (!website) return;

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "OpenAI API key not configured" }); return; }

  const content = website.content as any;
  const seo = content?.seo as { title?: string; description?: string; keywords?: string } | undefined;
  const fields: { label?: string; current?: string }[] = content?.fields ?? [];

  const textSample = fields
    .filter((f) => f.current && f.current.length > 3)
    .slice(0, 20)
    .map((f) => `${f.label || "field"}: ${f.current}`)
    .join("\n");

  const prompt = `You are an expert SEO consultant. Analyze this website and return a JSON SEO report.

Website URL slug: ${website.slug}
Current page title: ${seo?.title || "(not set)"}
Current meta description: ${seo?.description || "(not set)"}
Current keywords: ${seo?.keywords || "(not set)"}

Page content sample:
${textSample || "(no content scanned yet — user has not run a text scan)"}

Return ONLY a valid JSON object (no markdown) with this exact shape:
{
  "score": <0-100>,
  "grade": "<A|B|C|D|F>",
  "summary": "<2-3 sentence overall assessment>",
  "issues": [{ "severity": "<high|medium|low>", "field": "<title|description|keywords|content>", "message": "<specific issue>" }],
  "recommendations": [{ "field": "<title|description|keywords|content>", "action": "<actionable recommendation>" }],
  "suggestedTitle": "<optimized title, max 60 chars>",
  "suggestedDescription": "<optimized description, max 160 chars>",
  "suggestedKeywords": "<5-8 comma-separated keywords>"
}`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      logger.error({ websiteId: params.data.id, status: openaiRes.status }, "OpenAI SEO scan error");
      res.status(502).json({ error: "AI service unavailable — try again" });
      return;
    }

    const data = await openaiRes.json() as any;
    const text = data.choices?.[0]?.message?.content ?? "{}";
    let report: Record<string, unknown>;
    try { report = JSON.parse(text); }
    catch { report = { score: 0, grade: "F", summary: "Could not parse AI response.", issues: [], recommendations: [] }; }

    res.json(report);
  } catch (err: any) {
    logger.error({ err: err.message, websiteId: params.data.id }, "SEO scan request failed");
    res.status(500).json({ error: "SEO scan failed — please try again" });
  }
});

// ── Tenant JSON resolver (SPA data fetching) ──────────────────────────────────
router.get("/tenant/:slug", async (req, res): Promise<void> => {
  const params = ResolveTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(and(eq(websitesTable.slug, params.data.slug), eq(websitesTable.published, true)));

  if (!website) {
    res.status(404).json({ error: "Tenant not found or not published" });
    return;
  }

  let template = null;
  if (website.templateId) {
    const [tmpl] = await db
      .select()
      .from(templatesTable)
      .where(eq(templatesTable.id, website.templateId));
    template = tmpl ?? null;
  }

  res.json({ website, template });
});

export default router;
