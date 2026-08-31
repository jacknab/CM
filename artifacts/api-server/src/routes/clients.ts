import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { isAuthenticated } from "../auth";
import {
  clients,
  clientEmails,
  clientPhones,
  clientAddresses,
  clientTags,
  clientTagRelationships,
  clientNotes,
  clientMarketingPreferences,
  clientCustomFields,
  clientCustomFieldValues,
  clientAuditLogs,
  clientExportJobs,
  clientImportJobs,
  appointments,
  staff,
  services,
} from "@shared/schema";
import {
  eq,
  and,
  ilike,
  or,
  desc,
  asc,
  inArray,
  sql,
  isNull,
  notInArray,
} from "drizzle-orm";
import * as XLSX from "xlsx";
import { normalizePhone } from "../lib/phoneUtils";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

async function auditLog(
  storeId: number,
  actionType: string,
  options: { clientId?: number; actorUserId?: string; metadata?: object; ipAddress?: string }
) {
  await db.insert(clientAuditLogs).values({
    storeId,
    clientId: options.clientId ?? null,
    actionType,
    actorUserId: options.actorUserId ?? null,
    metadataJson: options.metadata ?? null,
    ipAddress: options.ipAddress ?? null,
  });
}

function getUserId(req: any): string | undefined {
  return (req.session as any)?.userId;
}

// ─── CLIENT LIST ──────────────────────────────────────────────────────────────

router.get("/", isAuthenticated, async (req, res) => {
  try {
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const { search, tag, status, page = "1", limit = "50", sort = "fullName", order = "asc" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = db
      .select({
        client: clients,
        primaryEmail: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        primaryPhone: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        displayPhone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        tags: sql<string>`(SELECT COALESCE(json_agg(json_build_object('id', t.id, 'tagName', t.tag_name, 'tagColor', t.tag_color)) FILTER (WHERE t.id IS NOT NULL), '[]'::json) FROM client_tags t JOIN client_tag_relationships r ON r.tag_id = t.id WHERE r.client_id = clients.id)`,
        loyaltyPointsLive: sql<number>`COALESCE(clients.loyalty_points, 0)`,
        // Live-computed from appointments — the denormalized columns are never
        // written back so they always read 0/null from the stored row.
        liveVisits: sql<number>`(
          SELECT COUNT(*)::int
          FROM appointments
          WHERE customer_id = clients.id
            AND store_id    = clients.store_id
            AND status      = 'completed'
        )`,
        liveSpentCents: sql<number>`(
          SELECT COALESCE(ROUND(SUM(CAST(total_paid AS DECIMAL(10,2))) * 100), 0)::int
          FROM appointments
          WHERE customer_id = clients.id
            AND store_id    = clients.store_id
            AND status      = 'completed'
        )`,
        liveLastVisit: sql<string>`(
          SELECT MAX(date)
          FROM appointments
          WHERE customer_id = clients.id
            AND store_id    = clients.store_id
            AND status      = 'completed'
        )`,
      })
      .from(clients)
      .$dynamic();

    const conditions = [eq(clients.storeId, storeId), isNull(clients.archivedAt)];

    if (status && status !== "all") {
      conditions.push(eq(clients.clientStatus, status));
    }

    if (search) {
      conditions.push(
        or(
          ilike(clients.fullName, `%${search}%`),
          ilike(clients.firstName, `%${search}%`),
          ilike(clients.lastName, `%${search}%`),
          sql`EXISTS (SELECT 1 FROM client_emails WHERE client_id = ${clients.id} AND email_address ILIKE ${`%${search}%`})`,
          sql`EXISTS (SELECT 1 FROM client_phones WHERE client_id = ${clients.id} AND (phone_number_e164 LIKE ${`%${search.replace(/\D/g, "")}%`} OR display_phone ILIKE ${`%${search}%`}))`,
        )!
      );
    }

    if (tag) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM client_tag_relationships r JOIN client_tags t ON r.tag_id = t.id WHERE r.client_id = ${clients.id} AND t.tag_name = ${tag})`
      );
    }

    // For live-computed columns, sort by the same subquery expression so the
    // ORDER BY matches what the client actually sees (not the stale stored value).
    const liveVisitsSql   = sql`(SELECT COUNT(*) FROM appointments WHERE customer_id = clients.id AND store_id = clients.store_id AND status = 'completed')`;
    const liveSpentSql    = sql`(SELECT COALESCE(SUM(CAST(total_paid AS DECIMAL(10,2))), 0) FROM appointments WHERE customer_id = clients.id AND store_id = clients.store_id AND status = 'completed')`;
    const liveLastVisitSql = sql`(SELECT MAX(date) FROM appointments WHERE customer_id = clients.id AND store_id = clients.store_id AND status = 'completed')`;

    const orderExpr = sort === "lastVisitAt" ? (order === "desc" ? desc(liveLastVisitSql) : asc(liveLastVisitSql))
      : sort === "totalSpent"  ? (order === "desc" ? desc(liveSpentSql)     : asc(liveSpentSql))
      : sort === "totalVisits" ? (order === "desc" ? desc(liveVisitsSql)    : asc(liveVisitsSql))
      : sort === "createdAt"   ? (order === "desc" ? desc(clients.createdAt) : asc(clients.createdAt))
      : (order === "desc" ? desc(clients.fullName) : asc(clients.fullName));

    const rows = await query
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(limitNum)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(and(...conditions));

    return res.json({
      clients: rows.map((r) => ({
        ...r.client,
        primaryEmail:    r.primaryEmail,
        primaryPhone:    r.displayPhone || r.primaryPhone,
        tags:            r.tags ? JSON.parse(JSON.stringify(r.tags)) : [],
        loyaltyPoints:   Number(r.loyaltyPointsLive ?? r.client.loyaltyPoints ?? 0),
        // Override stale denormalized columns with live appointment aggregates
        totalVisits:     Number(r.liveVisits ?? 0),
        totalSpentCents: Number(r.liveSpentCents ?? 0),
        lastVisitAt:     r.liveLastVisit ?? null,
      })),
      total: Number(count),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("[clients] list error:", err);
    return res.status(500).json({ message: "Failed to fetch clients" });
  }
});

// ─── CLIENT CREATE ────────────────────────────────────────────────────────────

router.post("/", isAuthenticated, async (req, res) => {
  try {
    const {
      storeId,
      firstName = "",
      lastName = "",
      preferredName,
      dateOfBirth,
      allergies,
      gender,
      email,
      phone,
      notes,
      source = "manual",
      tagIds,
      smsOptIn = true,
      emailMarketingOptIn = true,
    } = req.body;

    if (!storeId) return res.status(400).json({ message: "storeId required" });
    if (!firstName && !lastName && !email && !phone) {
      return res.status(400).json({ message: "At least one of name, email, or phone is required" });
    }

    // Prevent duplicate phone within the same store
    if (phone) {
      const { e164: checkE164 } = normalizePhone(phone);
      if (!checkE164) {
        return res.status(400).json({ message: "Invalid phone number format.", code: "INVALID_PHONE" });
      }
      const [existing] = await db
        .select({ id: clients.id })
        .from(clientPhones)
        .innerJoin(clients, and(eq(clientPhones.clientId, clients.id), eq(clients.storeId, storeId), isNull(clients.archivedAt)))
        .where(eq(clientPhones.phoneNumberE164, checkE164))
        .limit(1);
      if (existing) {
        return res.status(409).json({ message: "A customer with this phone number already exists.", code: "PHONE_DUPLICATE" });
      }
    }

    // Prevent duplicate email within the same store
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      const [existingEmail] = await db
        .select({ id: clientEmails.clientId })
        .from(clientEmails)
        .innerJoin(clients, and(eq(clientEmails.clientId, clients.id), eq(clients.storeId, storeId), isNull(clients.archivedAt)))
        .where(eq(clientEmails.emailAddress, normalizedEmail))
        .limit(1);
      if (existingEmail) {
        return res.status(409).json({ message: "A customer with this email address already exists.", code: "EMAIL_DUPLICATE" });
      }
    }

    // Warn on name duplicate (soft check — same first+last already exists)
    if (firstName && lastName) {
      const [existingName] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.storeId, storeId), ilike(clients.firstName, firstName), ilike(clients.lastName, lastName), isNull(clients.archivedAt)))
        .limit(1);
      if (existingName) {
        return res.status(409).json({ message: `A client named "${firstName} ${lastName}" already exists.`, code: "NAME_DUPLICATE" });
      }
    }

    const fullName = `${firstName} ${lastName}`.trim() || email || phone || "";

    const [client] = await db
      .insert(clients)
      .values({ storeId, firstName, lastName, fullName, preferredName, dateOfBirth, allergies: allergies || null, gender, source })
      .returning();

    if (email) {
      await db.insert(clientEmails).values({
        clientId: client.id,
        emailAddress: normalizeEmail(email),
        isPrimary: true,
        marketingOptIn: emailMarketingOptIn,
      });
    }

    if (phone) {
      const { e164, display } = normalizePhone(phone);
      if (e164) {
        // Auto-detect whether this is a mobile, VoIP, or landline number so the
        // system can route SMS/voice intelligently going forward.
        let detectedType: "mobile" | "voip" | "landline" | "unknown" = "unknown";
        try {
          const { detectPhoneType } = await import("../lib/phoneTypeDetector");
          detectedType = detectPhoneType(e164).phoneType;
        } catch (e: any) {
          console.warn(`[clients] phone-type detection skipped: ${e?.message ?? e}`);
        }
        await db.insert(clientPhones).values({
          clientId: client.id,
          phoneNumberE164: e164,
          displayPhone: display,
          phoneType: detectedType,
          smsOptIn,
          isPrimary: true,
        });
      }
    }

    // Default marketing preferences
    await db.insert(clientMarketingPreferences).values({
      clientId: client.id,
      smsMarketingOptIn: smsOptIn,
      emailMarketingOptIn,
    });

    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      await db.insert(clientTagRelationships).values(
        tagIds.map((tagId: number) => ({ clientId: client.id, tagId }))
      );
    }

    if (notes) {
      await db.insert(clientNotes).values({
        clientId: client.id,
        storeId,
        createdByUserId: getUserId(req) ?? null,
        noteType: "general",
        noteContent: notes,
      });
    }

    await auditLog(storeId, "created", { clientId: client.id, actorUserId: getUserId(req), ipAddress: req.ip });

    return res.status(201).json(client);
  } catch (err) {
    console.error("[clients] create error:", err);
    return res.status(500).json({ message: "Failed to create client" });
  }
});

// ─── FIND ALL DUPLICATES ──────────────────────────────────────────────────────
// Must be registered before GET /:id to avoid the catch-all matching this path.

router.get("/find-all-duplicates", isAuthenticated, async (req, res) => {
  try {
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    // Clients sharing the same phone number within the store
    const phoneDupes = await db.execute(sql`
      SELECT cp.phone_number_e164 AS match_value,
             array_agg(DISTINCT cp.client_id ORDER BY cp.client_id) AS client_ids
      FROM client_phones cp
      JOIN clients c ON cp.client_id = c.id
      WHERE c.store_id = ${storeId} AND c.archived_at IS NULL
      GROUP BY cp.phone_number_e164
      HAVING COUNT(DISTINCT cp.client_id) > 1
    `);

    // Clients sharing the same email address within the store
    const emailDupes = await db.execute(sql`
      SELECT ce.email_address AS match_value,
             array_agg(DISTINCT ce.client_id ORDER BY ce.client_id) AS client_ids
      FROM client_emails ce
      JOIN clients c ON ce.client_id = c.id
      WHERE c.store_id = ${storeId} AND c.archived_at IS NULL
      GROUP BY ce.email_address
      HAVING COUNT(DISTINCT ce.client_id) > 1
    `);

    // Clients sharing the same first + last name (case-insensitive) within the store
    const nameDupes = await db.execute(sql`
      SELECT lower(trim(first_name)) || ' ' || lower(trim(last_name)) AS match_value,
             array_agg(DISTINCT id ORDER BY id) AS client_ids
      FROM clients
      WHERE store_id = ${storeId}
        AND archived_at IS NULL
        AND trim(first_name) != ''
        AND trim(last_name) != ''
      GROUP BY lower(trim(first_name)), lower(trim(last_name))
      HAVING COUNT(DISTINCT id) > 1
    `);

    type RawRow = { match_value: string; client_ids: number[] };

    const groups = new Map<string, { reason: string; matchValue: string; clientIds: number[] }>();

    for (const row of phoneDupes.rows as RawRow[]) {
      const ids = (row.client_ids as unknown as number[]).map(Number).sort((a, b) => a - b);
      const key = ids.join(",");
      if (!groups.has(key)) groups.set(key, { reason: "phone", matchValue: row.match_value, clientIds: ids });
    }
    for (const row of emailDupes.rows as RawRow[]) {
      const ids = (row.client_ids as unknown as number[]).map(Number).sort((a, b) => a - b);
      const key = ids.join(",");
      if (!groups.has(key)) groups.set(key, { reason: "email", matchValue: row.match_value, clientIds: ids });
    }
    for (const row of nameDupes.rows as RawRow[]) {
      const ids = (row.client_ids as unknown as number[]).map(Number).sort((a, b) => a - b);
      const key = ids.join(",");
      if (!groups.has(key)) groups.set(key, { reason: "name", matchValue: row.match_value, clientIds: ids });
    }

    if (groups.size === 0) return res.json({ groups: [] });

    const allIds = Array.from(new Set(Array.from(groups.values()).flatMap((g) => g.clientIds)));
    const clientRows = await db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        firstName: clients.firstName,
        lastName: clients.lastName,
        totalVisits: clients.totalVisits,
        totalSpentCents: clients.totalSpentCents,
        lastVisitAt: clients.lastVisitAt,
        createdAt: clients.createdAt,
        primaryEmail: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = ${clients.id} AND is_primary = true LIMIT 1)`,
        primaryPhone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = ${clients.id} AND is_primary = true LIMIT 1)`,
      })
      .from(clients)
      .where(inArray(clients.id, allIds));

    const clientMap = Object.fromEntries(clientRows.map((c) => [c.id, c]));

    const result = Array.from(groups.entries()).map(([key, group]) => ({
      key,
      reason: group.reason,
      matchValue: group.matchValue,
      clients: group.clientIds.map((id) => clientMap[id]).filter(Boolean),
    }));

    return res.json({ groups: result });
  } catch (err) {
    console.error("[clients] find-all-duplicates error:", err);
    return res.status(500).json({ message: "Failed to find duplicates" });
  }
});

// ─── CLIENT GET ───────────────────────────────────────────────────────────────

router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) return res.status(404).json({ message: "Client not found" });

    const [emails, phones, addresses, tagRels, notes, mktPrefs, customFieldValues, liveStats] = await Promise.all([
      db.select().from(clientEmails).where(eq(clientEmails.clientId, clientId)).orderBy(desc(clientEmails.isPrimary)),
      db.select().from(clientPhones).where(eq(clientPhones.clientId, clientId)).orderBy(desc(clientPhones.isPrimary)),
      db.select().from(clientAddresses).where(eq(clientAddresses.clientId, clientId)),
      db
        .select({ rel: clientTagRelationships, tag: clientTags })
        .from(clientTagRelationships)
        .innerJoin(clientTags, eq(clientTagRelationships.tagId, clientTags.id))
        .where(eq(clientTagRelationships.clientId, clientId)),
      db.select().from(clientNotes).where(eq(clientNotes.clientId, clientId)).orderBy(desc(clientNotes.pinned), desc(clientNotes.createdAt)),
      db.select().from(clientMarketingPreferences).where(eq(clientMarketingPreferences.clientId, clientId)),
      db.select({ val: clientCustomFieldValues, field: clientCustomFields })
        .from(clientCustomFieldValues)
        .innerJoin(clientCustomFields, eq(clientCustomFieldValues.customFieldId, clientCustomFields.id))
        .where(eq(clientCustomFieldValues.clientId, clientId)),
      // Live appointment aggregates — the denormalized columns on clients are never
      // written back, so always compute fresh from appointments.
      db.execute(sql`
        SELECT
          COUNT(*)::int                                                             AS total_visits,
          COALESCE(ROUND(SUM(CAST(total_paid AS DECIMAL(10,2))) * 100), 0)::int   AS total_spent_cents,
          MAX(date)                                                                 AS last_visit_at
        FROM appointments
        WHERE customer_id = ${clientId}
          AND store_id    = ${client.storeId}
          AND status      = 'completed'
      `),
    ]);

    const primaryEmail = emails.find(e => e.isPrimary)?.emailAddress ?? emails[0]?.emailAddress;
    const stats = (liveStats.rows[0] as any) ?? {};

    return res.json({
      ...client,
      // Override stale denormalized columns with live appointment aggregates
      totalVisits:     Number(stats.total_visits ?? 0),
      totalSpentCents: Number(stats.total_spent_cents ?? 0),
      lastVisitAt:     stats.last_visit_at ?? null,
      emails,
      phones,
      addresses,
      tags: tagRels.map((r) => ({ ...r.rel, tag: r.tag })),
      notes,
      marketingPreferences: mktPrefs[0] ?? null,
      customFields: customFieldValues.map((r) => ({ ...r.val, field: r.field })),
      primaryEmail: primaryEmail ?? null,
      primaryPhone: phones.find(p => p.isPrimary)?.displayPhone ?? phones[0]?.displayPhone ?? null,
      matchedCustomerId: client.id,
      loyaltyPoints: client.loyaltyPoints ?? 0,
    });
  } catch (err) {
    console.error("[clients] get error:", err);
    return res.status(500).json({ message: "Failed to fetch client" });
  }
});

// ─── CLIENT UPDATE ────────────────────────────────────────────────────────────

router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { firstName, lastName, preferredName, dateOfBirth, allergies, gender, clientStatus, preferredStaffId, source, referralSource, avatarUrl } = req.body;

    const newFirst = firstName ?? undefined;
    const newLast = lastName ?? undefined;
    const updates: Partial<typeof clients.$inferInsert> = {};
    if (newFirst !== undefined) updates.firstName = newFirst;
    if (newLast !== undefined) updates.lastName = newLast;
    if (newFirst !== undefined || newLast !== undefined) {
      const [cur] = await db.select().from(clients).where(eq(clients.id, clientId));
      updates.fullName = `${newFirst ?? cur?.firstName ?? ""} ${newLast ?? cur?.lastName ?? ""}`.trim();
    }
    if (preferredName !== undefined) updates.preferredName = preferredName;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;
    if (allergies !== undefined) updates.allergies = allergies || null;
    if (gender !== undefined) updates.gender = gender;
    if (clientStatus !== undefined) updates.clientStatus = clientStatus;
    if (preferredStaffId !== undefined) updates.preferredStaffId = preferredStaffId;
    if (source !== undefined) updates.source = source;
    if (referralSource !== undefined) updates.referralSource = referralSource;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    updates.updatedAt = new Date();

    const [updated] = await db.update(clients).set(updates).where(eq(clients.id, clientId)).returning();
    if (!updated) return res.status(404).json({ message: "Client not found" });

    const storeId = updated.storeId;
    await auditLog(storeId, "updated", { clientId, actorUserId: getUserId(req), metadata: { fields: Object.keys(updates) } });

    return res.json(updated);
  } catch (err) {
    console.error("[clients] update error:", err);
    return res.status(500).json({ message: "Failed to update client" });
  }
});

// ─── CLIENT ARCHIVE / DELETE ──────────────────────────────────────────────────

router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) return res.status(404).json({ message: "Client not found" });

    await db.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, clientId));
    await auditLog(client.storeId, "archived", { clientId, actorUserId: getUserId(req) });

    return res.json({ message: "Client archived" });
  } catch (err) {
    console.error("[clients] delete error:", err);
    return res.status(500).json({ message: "Failed to archive client" });
  }
});

// ─── TAGS ─────────────────────────────────────────────────────────────────────

router.get("/tags/list", isAuthenticated, async (req, res) => {
  try {
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const tags = await db
      .select({
        tag: clientTags,
        count: sql<number>`(SELECT COUNT(*) FROM client_tag_relationships WHERE tag_id = ${clientTags.id})`,
      })
      .from(clientTags)
      .where(eq(clientTags.storeId, storeId))
      .orderBy(asc(clientTags.tagName));

    return res.json(tags.map((r) => ({ ...r.tag, count: Number(r.count) })));
  } catch (err) {
    console.error("[clients] tags list error:", err);
    return res.status(500).json({ message: "Failed to fetch tags" });
  }
});

router.post("/tags", isAuthenticated, async (req, res) => {
  try {
    const { storeId, tagName, tagColor = "#6366f1" } = req.body;
    if (!storeId || !tagName) return res.status(400).json({ message: "storeId and tagName required" });

    const [tag] = await db
      .insert(clientTags)
      .values({ storeId, tagName: tagName.trim(), tagColor })
      .onConflictDoUpdate({ target: [clientTags.storeId, clientTags.tagName], set: { tagColor } })
      .returning();

    return res.status(201).json(tag);
  } catch (err) {
    console.error("[clients] tags create error:", err);
    return res.status(500).json({ message: "Failed to create tag" });
  }
});

router.post("/:id/tags", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { tagId } = req.body;
    await db.insert(clientTagRelationships).values({ clientId, tagId }).onConflictDoNothing();
    return res.json({ message: "Tag added" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to add tag" });
  }
});

router.delete("/:id/tags/:tagId", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const tagId = Number(req.params.tagId);
    await db.delete(clientTagRelationships).where(and(eq(clientTagRelationships.clientId, clientId), eq(clientTagRelationships.tagId, tagId)));
    return res.json({ message: "Tag removed" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to remove tag" });
  }
});

// ─── NOTES ────────────────────────────────────────────────────────────────────

router.get("/:id/notes", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const notes = await db.select().from(clientNotes).where(eq(clientNotes.clientId, clientId)).orderBy(desc(clientNotes.pinned), desc(clientNotes.createdAt));
    return res.json(notes);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch notes" });
  }
});

router.post("/:id/notes", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { storeId, noteType = "general", visibility = "internal", noteContent, pinned = false } = req.body;
    if (!storeId || !noteContent) return res.status(400).json({ message: "storeId and noteContent required" });

    const [note] = await db
      .insert(clientNotes)
      .values({ clientId, storeId, createdByUserId: getUserId(req) ?? null, noteType, visibility, noteContent, pinned })
      .returning();

    return res.status(201).json(note);
  } catch (err) {
    return res.status(500).json({ message: "Failed to create note" });
  }
});

router.patch("/:id/notes/:noteId", isAuthenticated, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const { noteContent, pinned, visibility } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (noteContent !== undefined) updates.noteContent = noteContent;
    if (pinned !== undefined) updates.pinned = pinned;
    if (visibility !== undefined) updates.visibility = visibility;

    const [note] = await db.update(clientNotes).set(updates).where(eq(clientNotes.id, noteId)).returning();
    return res.json(note);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update note" });
  }
});

router.delete("/:id/notes/:noteId", isAuthenticated, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    await db.delete(clientNotes).where(eq(clientNotes.id, noteId));
    return res.json({ message: "Note deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete note" });
  }
});

// ─── PHONES ───────────────────────────────────────────────────────────────────

router.post("/:id/phones", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { phoneNumber, phoneType = "mobile", smsOptIn = true, isPrimary = false } = req.body;
    if (!phoneNumber) return res.status(400).json({ message: "phoneNumber required" });

    const { e164, display } = normalizePhone(phoneNumber);
    if (!e164) return res.status(400).json({ message: "Invalid phone number format.", code: "INVALID_PHONE" });

    // Prevent adding a phone that already belongs to another client in the same store
    const [thisClient] = await db.select({ storeId: clients.storeId }).from(clients).where(eq(clients.id, clientId));
    if (thisClient?.storeId) {
      const [conflict] = await db
        .select({ id: clients.id })
        .from(clientPhones)
        .innerJoin(clients, and(eq(clientPhones.clientId, clients.id), eq(clients.storeId, thisClient.storeId), isNull(clients.archivedAt)))
        .where(and(eq(clientPhones.phoneNumberE164, e164), sql`${clientPhones.clientId} != ${clientId}`))
        .limit(1);
      if (conflict) {
        return res.status(409).json({ message: "A customer with this phone number already exists.", code: "PHONE_DUPLICATE" });
      }
    }

    if (isPrimary) {
      await db.update(clientPhones).set({ isPrimary: false }).where(eq(clientPhones.clientId, clientId));
    }
    const [phone] = await db.insert(clientPhones).values({ clientId, phoneNumberE164: e164, displayPhone: display, phoneType, smsOptIn, isPrimary }).returning();
    return res.status(201).json(phone);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ message: "A customer with this phone number already exists.", code: "PHONE_DUPLICATE" });
    }
    return res.status(500).json({ message: "Failed to add phone" });
  }
});

// ─── EMAILS ───────────────────────────────────────────────────────────────────

router.post("/:id/emails", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { emailAddress, isPrimary = false, marketingOptIn = true } = req.body;
    if (!emailAddress) return res.status(400).json({ message: "emailAddress required" });

    if (isPrimary) {
      await db.update(clientEmails).set({ isPrimary: false }).where(eq(clientEmails.clientId, clientId));
    }
    const [email] = await db.insert(clientEmails).values({ clientId, emailAddress: normalizeEmail(emailAddress), isPrimary, marketingOptIn }).returning();
    return res.status(201).json(email);
  } catch (err) {
    return res.status(500).json({ message: "Failed to add email" });
  }
});

// ─── MARKETING PREFERENCES ────────────────────────────────────────────────────

router.get("/:id/marketing-preferences", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const [prefs] = await db.select().from(clientMarketingPreferences).where(eq(clientMarketingPreferences.clientId, clientId));
    return res.json(prefs ?? null);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch preferences" });
  }
});

router.put("/:id/marketing-preferences", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { smsMarketingOptIn, emailMarketingOptIn, promotionalNotifications, appointmentReminders, reviewRequests } = req.body;

    const [prefs] = await db
      .insert(clientMarketingPreferences)
      .values({ clientId, smsMarketingOptIn, emailMarketingOptIn, promotionalNotifications, appointmentReminders, reviewRequests })
      .onConflictDoUpdate({
        target: clientMarketingPreferences.clientId,
        set: { smsMarketingOptIn, emailMarketingOptIn, promotionalNotifications, appointmentReminders, reviewRequests, updatedAt: new Date() },
      })
      .returning();

    return res.json(prefs);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update preferences" });
  }
});

// ─── DUPLICATE DETECTION ──────────────────────────────────────────────────────

router.post("/detect-duplicates", isAuthenticated, async (req, res) => {
  try {
    const { storeId, email, phone, firstName, lastName } = req.body;
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const dupes: any[] = [];

    if (email) {
      const rows = await db
        .select({ clientId: clientEmails.clientId })
        .from(clientEmails)
        .innerJoin(clients, eq(clientEmails.clientId, clients.id))
        .where(and(eq(clientEmails.emailAddress, normalizeEmail(email)), eq(clients.storeId, storeId), isNull(clients.archivedAt)));
      if (rows.length > 0) dupes.push(...rows.map((r) => ({ type: "email", clientId: r.clientId })));
    }

    if (phone) {
      const { e164 } = normalizePhone(phone);
      if (e164) {
        const rows = await db
          .select({ clientId: clientPhones.clientId })
          .from(clientPhones)
          .innerJoin(clients, eq(clientPhones.clientId, clients.id))
          .where(and(eq(clientPhones.phoneNumberE164, e164), eq(clients.storeId, storeId), isNull(clients.archivedAt)));
        if (rows.length > 0) dupes.push(...rows.map((r) => ({ type: "phone", clientId: r.clientId })));
      }
    }

    // Name match (both first and last must match)
    if (firstName && lastName) {
      const nameMatches = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.storeId, storeId), ilike(clients.firstName, firstName), ilike(clients.lastName, lastName), isNull(clients.archivedAt)));
      if (nameMatches.length > 0) dupes.push(...nameMatches.map((r) => ({ type: "name", clientId: r.id })));
    }

    const uniqueClientIds = Array.from(new Set(dupes.map((d) => d.clientId)));
    if (uniqueClientIds.length === 0) return res.json({ duplicates: [] });

    const dupClients = await db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        primaryEmail: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = ${clients.id} AND is_primary = true LIMIT 1)`,
        primaryPhone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = ${clients.id} AND is_primary = true LIMIT 1)`,
      })
      .from(clients)
      .where(inArray(clients.id, uniqueClientIds));

    return res.json({
      duplicates: dupClients.map((c) => ({
        ...c,
        matchTypes: dupes.filter((d) => d.clientId === c.id).map((d) => d.type),
      })),
    });
  } catch (err) {
    console.error("[clients] duplicate detection error:", err);
    return res.status(500).json({ message: "Failed to detect duplicates" });
  }
});

// ─── MERGE CLIENTS ────────────────────────────────────────────────────────────

router.post("/merge", isAuthenticated, async (req, res) => {
  try {
    const { storeId, winnerId, loserIds } = req.body;
    if (!storeId || !winnerId || !Array.isArray(loserIds) || loserIds.length === 0) {
      return res.status(400).json({ message: "storeId, winnerId, and loserIds[] required" });
    }

    // Verify all clients belong to this store
    const allIds = [winnerId, ...loserIds];
    const clientRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(inArray(clients.id, allIds), eq(clients.storeId, storeId)));
    if (clientRows.length !== allIds.length) {
      return res.status(403).json({ message: "One or more clients not found in this store" });
    }

    await db.transaction(async (tx) => {
      for (const loserId of loserIds) {
        // Re-point appointments to winner
        await tx.execute(sql`
          UPDATE appointments SET customer_id = ${winnerId}
          WHERE customer_id = ${loserId} AND store_id = ${storeId}
        `);

        // Accumulate loyalty points into winner before archiving
        await tx.execute(sql`
          UPDATE clients
          SET loyalty_points = COALESCE(loyalty_points, 0) + COALESCE((SELECT loyalty_points FROM clients WHERE id = ${loserId}), 0)
          WHERE id = ${winnerId}
        `);

        // Merge emails the winner doesn't already have
        await tx.execute(sql`
          INSERT INTO client_emails (client_id, email_address, is_primary, marketing_opt_in)
          SELECT ${winnerId}, email_address, false, marketing_opt_in
          FROM client_emails
          WHERE client_id = ${loserId}
          ON CONFLICT DO NOTHING
        `);

        // Merge phones the winner doesn't already have
        await tx.execute(sql`
          INSERT INTO client_phones (client_id, store_id, phone_number_e164, display_phone, phone_type, sms_opt_in, is_primary)
          SELECT ${winnerId}, store_id, phone_number_e164, display_phone, phone_type, sms_opt_in, false
          FROM client_phones
          WHERE client_id = ${loserId}
          ON CONFLICT DO NOTHING
        `);

        // Move notes to winner
        await tx.execute(sql`
          UPDATE client_notes SET client_id = ${winnerId} WHERE client_id = ${loserId}
        `);

        // Merge tag relationships (skip duplicates)
        await tx.execute(sql`
          INSERT INTO client_tag_relationships (client_id, tag_id)
          SELECT ${winnerId}, tag_id FROM client_tag_relationships WHERE client_id = ${loserId}
          ON CONFLICT DO NOTHING
        `);

        // Merge custom field values the winner doesn't have (use actual column names)
        await tx.execute(sql`
          INSERT INTO client_custom_field_values (client_id, custom_field_id, field_value)
          SELECT ${winnerId}, custom_field_id, field_value
          FROM client_custom_field_values
          WHERE client_id = ${loserId}
            AND custom_field_id NOT IN (SELECT custom_field_id FROM client_custom_field_values WHERE client_id = ${winnerId})
          ON CONFLICT DO NOTHING
        `);

        // Re-point kiosk checkins (table may not exist in all environments)
        await tx.execute(sql`
          UPDATE kiosk_checkins SET client_id = ${winnerId} WHERE client_id = ${loserId}
        `).catch(() => {});

        // Archive the loser
        await tx.execute(sql`
          UPDATE clients SET archived_at = NOW() WHERE id = ${loserId}
        `);
      }

      // Recalculate winner totals from actual appointment data
      await tx.execute(sql`
        UPDATE clients SET
          total_visits = COALESCE((
            SELECT COUNT(*) FROM appointments
            WHERE customer_id = ${winnerId} AND store_id = ${storeId} AND status = 'completed'
          ), 0),
          total_spent_cents = COALESCE((
            SELECT SUM(total_paid) FROM appointments
            WHERE customer_id = ${winnerId} AND store_id = ${storeId} AND status IN ('completed', 'paid')
          ), 0),
          updated_at = NOW()
        WHERE id = ${winnerId}
      `);
    });

    await auditLog(storeId, "merged", { clientId: winnerId, actorUserId: getUserId(req), metadata: { loserIds }, ipAddress: req.ip });

    return res.json({ success: true, winnerId, merged: loserIds.length });
  } catch (err) {
    console.error("[clients] merge error:", err);
    return res.status(500).json({ message: "Failed to merge clients" });
  }
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

async function buildClientRows(storeId: number, filter: any = {}) {
  const conditions = [eq(clients.storeId, storeId), isNull(clients.archivedAt)];

  if (filter.status) conditions.push(eq(clients.clientStatus, filter.status));
  if (filter.smsOptIn === true) conditions.push(
    sql`EXISTS (SELECT 1 FROM client_marketing_preferences WHERE client_id = clients.id AND sms_marketing_opt_in = true)`
  );
  if (filter.emailOptIn === true) conditions.push(
    sql`EXISTS (SELECT 1 FROM client_marketing_preferences WHERE client_id = clients.id AND email_marketing_opt_in = true)`
  );
  if (filter.tag) conditions.push(
    sql`EXISTS (SELECT 1 FROM client_tag_relationships r JOIN client_tags t ON r.tag_id = t.id WHERE r.client_id = clients.id AND t.tag_name = ${filter.tag})`
  );

  const rows = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      fullName: clients.fullName,
      dateOfBirth: clients.dateOfBirth,
      clientStatus: clients.clientStatus,
      source: clients.source,
      totalVisits: clients.totalVisits,
      totalSpentCents: clients.totalSpentCents,
      lastVisitAt: clients.lastVisitAt,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      primaryEmail: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      primaryPhone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      primaryPhoneE164: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      altPhone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = false LIMIT 1)`,
      altPhoneE164: sql<string>`(SELECT phone_number_e164 FROM client_phones WHERE client_id = clients.id AND is_primary = false LIMIT 1)`,
      addressLine1: sql<string>`(SELECT address_line1 FROM client_addresses WHERE client_id = clients.id LIMIT 1)`,
      city: sql<string>`(SELECT city FROM client_addresses WHERE client_id = clients.id LIMIT 1)`,
      state: sql<string>`(SELECT state FROM client_addresses WHERE client_id = clients.id LIMIT 1)`,
      postalCode: sql<string>`(SELECT postal_code FROM client_addresses WHERE client_id = clients.id LIMIT 1)`,
      country: sql<string>`(SELECT country FROM client_addresses WHERE client_id = clients.id LIMIT 1)`,
      tags: sql<string>`(SELECT string_agg(t.tag_name, ', ') FROM client_tags t JOIN client_tag_relationships r ON r.tag_id = t.id WHERE r.client_id = clients.id)`,
      notes: sql<string>`(SELECT string_agg(n.note_content, ' | ') FROM (SELECT note_content FROM client_notes WHERE client_id = clients.id AND visibility = 'internal' ORDER BY created_at DESC LIMIT 5) n)`,
      smsOptIn: sql<boolean>`(SELECT sms_marketing_opt_in FROM client_marketing_preferences WHERE client_id = clients.id LIMIT 1)`,
      emailOptIn: sql<boolean>`(SELECT email_marketing_opt_in FROM client_marketing_preferences WHERE client_id = clients.id LIMIT 1)`,
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.fullName));

  return rows.map((r) => ({
    "First Name": r.firstName,
    "Last Name": r.lastName,
    "Full Name": r.fullName,
    "Email": r.primaryEmail ?? "",
    "Mobile Phone": r.primaryPhone ?? "",
    "Mobile Phone E.164": r.primaryPhoneE164 ?? "",
    "Alternate Phone": r.altPhone ?? "",
    "Alternate Phone E.164": r.altPhoneE164 ?? "",
    "Tags": r.tags ?? "",
    "Notes": r.notes ?? "",
    "Last Visit Date": r.lastVisitAt ? new Date(r.lastVisitAt).toISOString().split("T")[0] : "",
    "Total Visits": r.totalVisits ?? 0,
    "Lifetime Spend": r.totalSpentCents ? `$${(r.totalSpentCents / 100).toFixed(2)}` : "$0.00",
    "Marketing Opt-In SMS": r.smsOptIn ? "Yes" : "No",
    "Marketing Opt-In Email": r.emailOptIn ? "Yes" : "No",
    "Address": r.addressLine1 ?? "",
    "City": r.city ?? "",
    "State": r.state ?? "",
    "Postal Code": r.postalCode ?? "",
    "Country": r.country ?? "",
    "Status": r.clientStatus,
    "Source": r.source ?? "",
    "Created Date": r.createdAt ? new Date(r.createdAt).toISOString().split("T")[0] : "",
    "Last Updated": r.updatedAt ? new Date(r.updatedAt).toISOString().split("T")[0] : "",
  }));
}

router.post("/export", isAuthenticated, async (req, res) => {
  try {
    const { storeId, format = "csv", filter = {} } = req.body;
    if (!storeId) return res.status(400).json({ message: "storeId required" });
    if (!["csv", "xlsx", "json"].includes(format)) return res.status(400).json({ message: "format must be csv, xlsx, or json" });

    const userId = getUserId(req);

    // Log the export
    await auditLog(storeId, "exported", { actorUserId: userId, metadata: { format, filter } });

    const rows = await buildClientRows(storeId, filter);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="clients-${storeId}-${Date.now()}.json"`);
      return res.json(rows);
    }

    if (format === "csv") {
      const headers = Object.keys(rows[0] ?? {});
      const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
          headers.map((h) => {
            const val = String((r as any)[h] ?? "").replace(/"/g, '""');
            return `"${val}"`;
          }).join(",")
        ),
      ];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="clients-${storeId}-${Date.now()}.csv"`);
      return res.send(csvLines.join("\n"));
    }

    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clients");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="clients-${storeId}-${Date.now()}.xlsx"`);
      return res.send(buf);
    }
  } catch (err) {
    console.error("[clients] export error:", err);
    return res.status(500).json({ message: "Export failed" });
  }
});

// ─── IMPORT ───────────────────────────────────────────────────────────────────

router.post("/import/preview", isAuthenticated, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { storeId } = req.body;
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    let rows: any[] = [];

    if (req.file.originalname.endsWith(".xlsx") || req.file.originalname.endsWith(".xls")) {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws);
    } else {
      // CSV
      const text = req.file.buffer.toString("utf-8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return res.status(400).json({ message: "File is empty or has no data rows" });

      const headers = lines[0].split(",").map((h: string) => h.replace(/^"|"$/g, "").trim());
      rows = lines.slice(1).map((line: string) => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = vals[i] ? String(vals[i]).replace(/^"|"$/g, "").trim() : "";
        });
        return obj;
      });
    }

    const preview = rows.slice(0, 5);
    const detectedFields = Object.keys(rows[0] ?? {});

    // Auto-detect field mapping
    const fieldMap: Record<string, string> = {};
    const MAPPINGS: Record<string, string[]> = {
      firstName: ["first name", "firstname", "first_name", "given name"],
      lastName: ["last name", "lastname", "last_name", "surname", "family name"],
      fullName: ["full name", "fullname", "name", "client name", "customer name"],
      email: ["email", "email address", "e-mail"],
      phone: ["phone", "mobile", "mobile phone", "cell", "phone number", "telephone"],
      altPhone: ["alternate phone", "alt phone", "home phone", "work phone"],
      tags: ["tags", "labels", "categories"],
      notes: ["notes", "comments", "remarks"],
      city: ["city", "town"],
      state: ["state", "province", "region"],
      postalCode: ["postal code", "zip", "zip code", "postcode"],
      country: ["country"],
    };

    detectedFields.forEach((f) => {
      const lower = f.toLowerCase();
      for (const [target, patterns] of Object.entries(MAPPINGS)) {
        if (patterns.some((p) => lower === p || lower.includes(p))) {
          fieldMap[f] = target;
          break;
        }
      }
    });

    return res.json({
      totalRows: rows.length,
      preview,
      detectedFields,
      suggestedMapping: fieldMap,
    });
  } catch (err) {
    console.error("[clients] import preview error:", err);
    return res.status(500).json({ message: "Failed to preview file" });
  }
});

router.post("/import/execute", isAuthenticated, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { storeId, fieldMapping: fieldMappingRaw, duplicateStrategy = "skip" } = req.body;
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const fieldMapping = typeof fieldMappingRaw === "string" ? JSON.parse(fieldMappingRaw) : fieldMappingRaw;
    const storeIdNum = Number(storeId);

    let rows: any[] = [];
    if (req.file.originalname.endsWith(".xlsx") || req.file.originalname.endsWith(".xls")) {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } else {
      const text = req.file.buffer.toString("utf-8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",").map((h: string) => h.replace(/^"|"$/g, "").trim());
      rows = lines.slice(1).map((line: string) => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = vals[i] ? String(vals[i]).replace(/^"|"$/g, "").trim() : "";
        });
        return obj;
      });
    }

    let imported = 0, skipped = 0, errors = 0, duplicates = 0;
    const errorList: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Map fields
        const mapped: Record<string, string> = {};
        for (const [srcField, targetField] of Object.entries(fieldMapping)) {
          mapped[targetField as string] = row[srcField] ?? "";
        }

        let firstName = mapped.firstName ?? "";
        let lastName = mapped.lastName ?? "";
        const fullNameRaw = mapped.fullName ?? "";
        if (!firstName && !lastName && fullNameRaw) {
          const parts = fullNameRaw.trim().split(" ");
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ") ?? "";
        }
        const email = mapped.email ? normalizeEmail(mapped.email) : null;
        const phone = mapped.phone ? mapped.phone : null;

        // Skip completely empty rows
        if (!firstName && !lastName && !email && !phone) { skipped++; continue; }

        // Duplicate detection
        let existingClientId: number | null = null;
        if (email) {
          const hit = await db
            .select({ clientId: clientEmails.clientId })
            .from(clientEmails)
            .innerJoin(clients, eq(clientEmails.clientId, clients.id))
            .where(and(eq(clientEmails.emailAddress, email), eq(clients.storeId, storeIdNum)))
            .limit(1);
          if (hit[0]) existingClientId = hit[0].clientId;
        }
        if (!existingClientId && phone) {
          const { e164 } = normalizePhone(phone);
          if (e164) {
            const hit = await db
              .select({ clientId: clientPhones.clientId })
              .from(clientPhones)
              .innerJoin(clients, eq(clientPhones.clientId, clients.id))
              .where(and(eq(clientPhones.phoneNumberE164, e164), eq(clients.storeId, storeIdNum)))
              .limit(1);
            if (hit[0]) existingClientId = hit[0].clientId;
          }
        }

        if (existingClientId) {
          duplicates++;
          if (duplicateStrategy === "skip") { skipped++; continue; }
          if (duplicateStrategy === "update") {
            // Update existing
            await db.update(clients).set({ firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), updatedAt: new Date() }).where(eq(clients.id, existingClientId));
            imported++;
            continue;
          }
        }

        // Create new client
        const fullName = `${firstName} ${lastName}`.trim() || email || phone || "";
        const [client] = await db.insert(clients).values({ storeId: storeIdNum, firstName, lastName, fullName, dateOfBirth: mapped.dateOfBirth || null, source: "import" }).returning();

        if (email) {
          await db.insert(clientEmails).values({ clientId: client.id, emailAddress: email, isPrimary: true }).onConflictDoNothing();
        }
        if (phone) {
          const { e164, display } = normalizePhone(phone);
          if (e164) {
            let detectedType: "mobile" | "voip" | "landline" | "unknown" = "unknown";
            try {
              const { detectPhoneType } = await import("../lib/phoneTypeDetector");
              detectedType = detectPhoneType(e164).phoneType;
            } catch (e: any) {
              console.warn(`[clients-import] phone-type detection skipped: ${e?.message ?? e}`);
            }
            await db.insert(clientPhones).values({ clientId: client.id, phoneNumberE164: e164, displayPhone: display, phoneType: detectedType, isPrimary: true }).onConflictDoNothing();
          }
        }
        if (mapped.notes) {
          await db.insert(clientNotes).values({ clientId: client.id, storeId: storeIdNum, noteType: "import", noteContent: mapped.notes });
        }
        await db.insert(clientMarketingPreferences).values({ clientId: client.id }).onConflictDoNothing();

        imported++;
      } catch (rowErr) {
        errors++;
        errorList.push({ row: i + 2, error: String(rowErr) });
      }
    }

    await auditLog(storeIdNum, "imported", { actorUserId: getUserId(req), metadata: { imported, skipped, errors, duplicates } });

    return res.json({ totalRows: rows.length, imported, skipped, errors, duplicates, errorList: errorList.slice(0, 50) });
  } catch (err) {
    console.error("[clients] import execute error:", err);
    return res.status(500).json({ message: "Import failed" });
  }
});


// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

router.get("/audit-logs", isAuthenticated, async (req, res) => {
  try {
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const logs = await db
      .select()
      .from(clientAuditLogs)
      .where(eq(clientAuditLogs.storeId, storeId))
      .orderBy(desc(clientAuditLogs.createdAt))
      .limit(200);

    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

// ─── CLIENT APPOINTMENT HISTORY ───────────────────────────────────────────────

router.get("/:id/appointments", isAuthenticated, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const [clientRow] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!clientRow) return res.status(404).json({ message: "Client not found" });

    const rows = await db
      .select({
        id: appointments.id,
        date: appointments.date,
        status: appointments.status,
        totalPaid: appointments.totalPaid,
        tipAmount: appointments.tipAmount,
        staffName: staff.name,
        serviceName: services.name,
      })
      .from(appointments)
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(and(eq(appointments.customerId, clientId), eq(appointments.storeId, storeId)))
      .orderBy(desc(appointments.date))
      .limit(100);

    return res.json(rows);
  } catch (err) {
    console.error("[clients] appointments error:", err);
    return res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

export default router;
