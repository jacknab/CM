/**
 * Staff Work Photos — Phase 3.2A
 *
 * Staff upload completed-service photos which flow directly into the existing
 * GBP Photo Engine queue. No owner approval step.
 *
 * STAFF ROUTES (staffId session):
 *   POST   /api/staff/me/work-photos          — upload photo
 *   GET    /api/staff/me/work-photos          — my photo history
 *   DELETE /api/staff/me/work-photos/:id      — remove own photo
 *
 * OWNER ROUTES (userId session, store-scoped):
 *   GET    /api/work-photos                   — all store photos (read-only)
 *   GET    /api/work-photos/stats             — counts
 *   GET    /api/clients/:id/photo-permissions — read client consent
 *   PUT    /api/clients/:id/photo-permissions — update client consent
 */

import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import {
  staffWorkPhotos,
  clientPhotoPermissions,
  staff,
  services,
  appointments,
} from "@shared/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { storage as storeStorage } from "../storage";
import { uploadToR2, extractR2KeyFromUrl, memoryUpload } from "../lib/r2";
import { detectAndEnqueuePhoto } from "../services/gbpPhotoEngine";

const router = Router();

// ─── Multer middleware (10 MB limit for work photos) ─────────────────────────

const photoUpload = memoryUpload({ maxSizeMb: 10 });

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getSessionStaffId(req: any): number | null {
  const id = (req.session as any)?.staffId;
  return id ? Number(id) : null;
}

async function resolveOwnerStoreId(req: any, res: any): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const storeIdParam = req.query.storeId ?? req.body?.storeId;
  if (storeIdParam) {
    const storeId = Number(storeIdParam);
    const store = await storeStorage.getStore(storeId);
    if (!store || store.userId !== userId) {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    return storeId;
  }
  // Fall back to first store for this user
  const stores = await storeStorage.getStores(userId);
  if (!stores.length) {
    res.status(403).json({ message: "No store found" });
    return null;
  }
  return stores[0].id;
}

// ─── Client GBP consent check ─────────────────────────────────────────────────
// Opt-out model: no record = allowed by default.
// Only blocks GBP queue if client has explicitly set gbp_allowed = false.

async function isClientGBPAllowed(storeId: number, clientId: number | null | undefined): Promise<boolean> {
  if (!clientId) return true; // no client (walk-in / display photo) — always queue
  const rows = await db
    .select({ gbpAllowed: clientPhotoPermissions.gbpAllowed })
    .from(clientPhotoPermissions)
    .where(and(
      eq(clientPhotoPermissions.storeId, storeId),
      eq(clientPhotoPermissions.clientId, clientId),
    ))
    .limit(1);
  // No record → allowed by default
  if (!rows.length) return true;
  return rows[0].gbpAllowed;
}

// ─── AI metadata (beauty-specific) ───────────────────────────────────────────

async function generateWorkPhotoMetadata(
  imageUrl: string,
  opts: { storeId: number; serviceName?: string; staffName?: string },
): Promise<{ description: string; tags: string[] }> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const { serviceName, staffName } = opts;

  if (!apiKey) {
    return buildFallbackWorkMetadata(serviceName, staffName);
  }

  const appUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "certxa.com"}`;
  const publicUrl = imageUrl.startsWith("http") ? imageUrl : `${appUrl}${imageUrl}`;

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: publicUrl, detail: "low" } },
            {
              type: "text",
              text: [
                `You are writing metadata for a beauty salon work photo.`,
                serviceName ? `Service performed: "${serviceName}"` : "",
                staffName   ? `Performed by: "${staffName}"` : "",
                ``,
                `Rules:`,
                `- Describe what you see (nail design, hair style, lashes, brows, etc.)`,
                `- Identify technique, color, style, finish if visible`,
                `- Do NOT mention prices, promotions, or discount offers`,
                `- Do NOT invent services not visible in the image`,
                ``,
                `Return JSON only (no markdown):`,
                `{ "description": "<1 warm professional sentence, max 120 chars>", "tags": ["<style>","<technique>","<color>"] }`,
              ].filter(Boolean).join("\n"),
            },
          ],
        },
      ],
      max_completion_tokens: 180,
      temperature: 0.4,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as { description?: string; tags?: string[] };
      if (parsed.description && Array.isArray(parsed.tags)) {
        return {
          description: parsed.description.slice(0, 500),
          tags:        parsed.tags.slice(0, 10),
        };
      }
    }
  } catch (err: any) {
    console.warn("[WorkPhotos] AI classification failed:", err?.message ?? err);
  }

  return buildFallbackWorkMetadata(serviceName, staffName);
}

function buildFallbackWorkMetadata(
  serviceName?: string,
  staffName?: string,
): { description: string; tags: string[] } {
  const svc  = serviceName ?? "beauty service";
  const desc = staffName
    ? `${svc} by ${staffName}.`
    : `${svc} — professional result.`;
  return { description: desc, tags: ["Salon", svc] };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/staff/me/work-photos — upload a work photo
router.post(
  "/staff/me/work-photos",
  (req, res, next) => {
    photoUpload.single("photo")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "Photo too large — maximum 10 MB" });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) return res.status(400).json({ message: (err as Error).message || "Upload error" });
      next();
    });
  },
  async (req, res) => {
    try {
      const staffId = getSessionStaffId(req);
      if (!staffId) return res.status(401).json({ message: "Staff authentication required" });

      if (!req.file) return res.status(400).json({ message: "No photo file provided" });

      // Resolve staff record → get storeId + name
      const staffMember = await storeStorage.getStaffMember(staffId);
      if (!staffMember) return res.status(404).json({ message: "Staff not found" });
      if (!staffMember.storeId) return res.status(400).json({ message: "Staff not assigned to a store" });

      // Enforce: staff must be active
      if (staffMember.status && staffMember.status !== "active") {
        return res.status(403).json({ message: "Inactive staff accounts cannot upload photos" });
      }

      const storeId = staffMember.storeId;

      // Parse optional metadata from form body
      const appointmentId = req.body.appointmentId ? Number(req.body.appointmentId) : null;
      const serviceId     = req.body.serviceId     ? Number(req.body.serviceId)     : null;
      const clientId      = req.body.clientId      ? Number(req.body.clientId)      : null;
      const caption       = req.body.caption       ? String(req.body.caption).slice(0, 500) : null;

      // Validate appointment belongs to this staff + store (if provided)
      if (appointmentId) {
        const appt = await storeStorage.getAppointment(appointmentId);
        if (!appt || appt.storeId !== storeId) {
          return res.status(403).json({ message: "Appointment does not belong to your store" });
        }
        // Allow staff to upload for their own appointments
        if (appt.staffId !== staffId) {
          return res.status(403).json({ message: "You can only upload photos for your own appointments" });
        }
      }

      // Upload to R2
      const imageUrl  = await uploadToR2(req.file.buffer, "work-photos", req.file.originalname, req.file.mimetype);
      const imageR2Key = extractR2KeyFromUrl(imageUrl) ?? undefined;

      // Resolve service name for AI metadata
      let serviceName: string | undefined;
      if (serviceId) {
        const svcRows = await db
          .select({ name: services.name })
          .from(services)
          .where(eq(services.id, serviceId))
          .limit(1);
        serviceName = svcRows[0]?.name;
      }
      // If no explicit serviceId but appointment has one, pull from appointment
      if (!serviceName && appointmentId) {
        const appt = await storeStorage.getAppointment(appointmentId);
        const resolvedServiceId = serviceId ?? (appt as any)?.serviceId;
        if (resolvedServiceId) {
          const svcRows = await db
            .select({ name: services.name })
            .from(services)
            .where(eq(services.id, resolvedServiceId))
            .limit(1);
          serviceName = svcRows[0]?.name;
        }
      }

      // AI metadata — fire-and-forget friendly; errors produce fallback
      let aiDescription: string | null = null;
      let aiTags: string[] | null = null;
      try {
        const meta = await generateWorkPhotoMetadata(imageUrl, {
          storeId,
          serviceName,
          staffName: staffMember.name ?? undefined,
        });
        aiDescription = meta.description;
        aiTags        = meta.tags;
      } catch (aiErr: any) {
        console.warn("[WorkPhotos] AI metadata skipped:", aiErr?.message);
      }

      // Insert photo record
      const [photo] = await db
        .insert(staffWorkPhotos)
        .values({
          storeId,
          staffId,
          appointmentId,
          serviceId:    serviceId ?? (appointmentId ? (await storeStorage.getAppointment(appointmentId))?.serviceId ?? null : null),
          clientId,
          imageUrl,
          imageR2Key:   imageR2Key ?? null,
          aiDescription,
          aiTags:       aiTags ?? [],
          staffCaption: caption,
          gbpQueued:    false,
        })
        .returning();

      // ── Send to GBP Photo Engine (direct, no approval step) ───────────────
      const gbpAllowed = await isClientGBPAllowed(storeId, clientId);

      if (gbpAllowed && imageR2Key) {
        const effectiveServiceId = photo.serviceId ?? undefined;
        detectAndEnqueuePhoto(storeId, "service_image", {
          imageUrl,
          r2Key:      imageR2Key,
          serviceId:  effectiveServiceId,
          staffId,
          entityName: serviceName ?? staffMember.name ?? "Salon Service",
        }).then(async () => {
          // Mark photo record as queued
          await db
            .update(staffWorkPhotos)
            .set({ gbpQueued: true, updatedAt: new Date() })
            .where(eq(staffWorkPhotos.id, photo.id));
        }).catch((e) => {
          console.warn(`[WorkPhotos] GBP queue error photoId=${photo.id}:`, e?.message ?? e);
        });
      } else if (!gbpAllowed) {
        console.log(`[WorkPhotos] storeId=${storeId} clientId=${clientId} — GBP opt-out, photo stored only`);
      }

      return res.status(201).json({
        ...photo,
        gbpQueued: gbpAllowed && !!imageR2Key,
      });
    } catch (err: any) {
      console.error("[WorkPhotos] upload error:", err);
      return res.status(500).json({ message: "Failed to upload photo" });
    }
  },
);

// GET /api/staff/me/work-photos — my photo history
router.get("/staff/me/work-photos", async (req, res) => {
  try {
    const staffId = getSessionStaffId(req);
    if (!staffId) return res.status(401).json({ message: "Staff authentication required" });

    const limit  = Math.min(Number(req.query.limit  ?? 30), 100);
    const offset = Number(req.query.offset ?? 0);

    const photos = await db
      .select()
      .from(staffWorkPhotos)
      .where(eq(staffWorkPhotos.staffId, staffId))
      .orderBy(desc(staffWorkPhotos.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json(photos);
  } catch (err: any) {
    console.error("[WorkPhotos] GET staff history error:", err);
    return res.status(500).json({ message: "Failed to load photos" });
  }
});

// DELETE /api/staff/me/work-photos/:id — remove own photo
router.delete("/staff/me/work-photos/:id", async (req, res) => {
  try {
    const staffId = getSessionStaffId(req);
    if (!staffId) return res.status(401).json({ message: "Staff authentication required" });

    const photoId = Number(req.params.id);
    const rows = await db
      .select()
      .from(staffWorkPhotos)
      .where(eq(staffWorkPhotos.id, photoId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Photo not found" });
    const photo = rows[0];

    if (photo.staffId !== staffId) {
      return res.status(403).json({ message: "You can only delete your own photos" });
    }

    await db.delete(staffWorkPhotos).where(eq(staffWorkPhotos.id, photoId));
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[WorkPhotos] DELETE error:", err);
    return res.status(500).json({ message: "Failed to delete photo" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OWNER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/work-photos — all store photos (read-only, informational)
router.get("/work-photos", async (req, res) => {
  try {
    const storeId = await resolveOwnerStoreId(req, res);
    if (!storeId) return;

    const staffIdFilter   = req.query.staffId   ? Number(req.query.staffId)   : null;
    const serviceIdFilter = req.query.serviceId ? Number(req.query.serviceId) : null;
    const gbpFilter       = req.query.gbpQueued !== undefined ? req.query.gbpQueued === "true" : null;
    const limit  = Math.min(Number(req.query.limit  ?? 50), 100);
    const offset = Number(req.query.offset ?? 0);

    const conditions: any[] = [eq(staffWorkPhotos.storeId, storeId)];
    if (staffIdFilter   !== null) conditions.push(eq(staffWorkPhotos.staffId,   staffIdFilter));
    if (serviceIdFilter !== null) conditions.push(eq(staffWorkPhotos.serviceId, serviceIdFilter));
    if (gbpFilter       !== null) conditions.push(eq(staffWorkPhotos.gbpQueued, gbpFilter));

    const photos = await db
      .select()
      .from(staffWorkPhotos)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(staffWorkPhotos.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json(photos);
  } catch (err: any) {
    console.error("[WorkPhotos] owner GET error:", err);
    return res.status(500).json({ message: "Failed to load photos" });
  }
});

// GET /api/work-photos/stats
router.get("/work-photos/stats", async (req, res) => {
  try {
    const storeId = await resolveOwnerStoreId(req, res);
    if (!storeId) return;

    const [totalRows, gbpQueuedRows] = await Promise.all([
      db.select({ cnt: count() }).from(staffWorkPhotos).where(eq(staffWorkPhotos.storeId, storeId)),
      db.select({ cnt: count() }).from(staffWorkPhotos).where(
        and(eq(staffWorkPhotos.storeId, storeId), eq(staffWorkPhotos.gbpQueued, true))
      ),
    ]);

    return res.json({
      total:     Number(totalRows[0]?.cnt  ?? 0),
      gbpQueued: Number(gbpQueuedRows[0]?.cnt ?? 0),
    });
  } catch (err: any) {
    console.error("[WorkPhotos] stats error:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT PHOTO PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/clients/:id/photo-permissions
router.get("/clients/:id/photo-permissions", async (req, res) => {
  try {
    const storeId = await resolveOwnerStoreId(req, res);
    if (!storeId) return;

    const clientId = Number(req.params.id);
    const rows = await db
      .select()
      .from(clientPhotoPermissions)
      .where(and(
        eq(clientPhotoPermissions.storeId, storeId),
        eq(clientPhotoPermissions.clientId, clientId),
      ))
      .limit(1);

    if (!rows.length) {
      // Return defaults without persisting
      return res.json({
        storeId,
        clientId,
        gbpAllowed:       true,
        websiteAllowed:   true,
        marketingAllowed: false,
        consentMethod:    null,
        consentedAt:      null,
        notes:            null,
      });
    }
    return res.json(rows[0]);
  } catch (err: any) {
    console.error("[PhotoPermissions] GET error:", err);
    return res.status(500).json({ message: "Failed to load permissions" });
  }
});

// PUT /api/clients/:id/photo-permissions
router.put("/clients/:id/photo-permissions", async (req, res) => {
  try {
    const storeId = await resolveOwnerStoreId(req, res);
    if (!storeId) return;

    const clientId = Number(req.params.id);
    const { gbpAllowed, websiteAllowed, marketingAllowed, notes, consentMethod } = req.body;

    const existing = await db
      .select({ id: clientPhotoPermissions.id })
      .from(clientPhotoPermissions)
      .where(and(
        eq(clientPhotoPermissions.storeId, storeId),
        eq(clientPhotoPermissions.clientId, clientId),
      ))
      .limit(1);

    const payload: Record<string, any> = {
      updatedAt:  new Date(),
      consentedAt: new Date(),
      consentMethod: consentMethod ?? "owner_manual",
    };
    if (gbpAllowed       !== undefined) payload.gbpAllowed       = Boolean(gbpAllowed);
    if (websiteAllowed   !== undefined) payload.websiteAllowed   = Boolean(websiteAllowed);
    if (marketingAllowed !== undefined) payload.marketingAllowed = Boolean(marketingAllowed);
    if (notes            !== undefined) payload.notes            = String(notes).slice(0, 500);

    let row;
    if (existing.length) {
      const rows = await db
        .update(clientPhotoPermissions)
        .set(payload)
        .where(and(
          eq(clientPhotoPermissions.storeId, storeId),
          eq(clientPhotoPermissions.clientId, clientId),
        ))
        .returning();
      row = rows[0];
    } else {
      const rows = await db
        .insert(clientPhotoPermissions)
        .values({ storeId, clientId, ...payload })
        .returning();
      row = rows[0];
    }

    return res.json(row);
  } catch (err: any) {
    console.error("[PhotoPermissions] PUT error:", err);
    return res.status(500).json({ message: "Failed to save permissions" });
  }
});

export default router;
