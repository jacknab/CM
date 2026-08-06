import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_TYPE = 8;
const SIMILARITY_THRESHOLD = 0.1;

router.get("/", isAuthenticated, async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";
  const rawStoreId = req.query.store_id as string | undefined;

  if (!q || q.length < MIN_QUERY_LENGTH) {
    res.json({ results: [], query: q, totalCount: 0 });
    return;
  }

  if (!rawStoreId) {
    res.status(400).json({ message: "store_id is required" });
    return;
  }

  const storeId = parseInt(rawStoreId, 10);
  if (isNaN(storeId)) {
    res.status(400).json({ message: "Invalid store_id" });
    return;
  }

  const userId = (req.session as any)?.userId;
  const [store] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!store) {
    res.status(404).json({ message: "Store not found" });
    return;
  }

  const pattern = `%${q}%`;

  const [customers, staff, services, appointments, products] = await Promise.all([
    db.execute(sql`
      SELECT
        c.id,
        c.full_name AS name,
        (SELECT email_address FROM client_emails WHERE client_id = c.id AND is_primary = true LIMIT 1) AS email,
        (SELECT display_phone FROM client_phones WHERE client_id = c.id AND is_primary = true LIMIT 1) AS phone,
        'customer' AS entity_type,
        GREATEST(
          COALESCE(similarity(c.full_name, ${q}), 0),
          COALESCE(similarity(
            (SELECT email_address FROM client_emails WHERE client_id = c.id AND is_primary = true LIMIT 1),
            ${q}
          ), 0),
          COALESCE(similarity(
            (SELECT display_phone FROM client_phones WHERE client_id = c.id AND is_primary = true LIMIT 1),
            ${q}
          ), 0)
        ) AS score
      FROM clients c
      WHERE c.store_id = ${storeId}
        AND c.archived_at IS NULL
        AND (
          c.full_name ILIKE ${pattern}
          OR EXISTS (SELECT 1 FROM client_emails WHERE client_id = c.id AND email_address ILIKE ${pattern})
          OR EXISTS (SELECT 1 FROM client_phones WHERE client_id = c.id AND display_phone ILIKE ${pattern})
          OR similarity(c.full_name, ${q}) > ${SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${MAX_RESULTS_PER_TYPE}
    `),

    db.execute(sql`
      SELECT
        s.id,
        s.name,
        s.email,
        s.role,
        'staff' AS entity_type,
        GREATEST(
          COALESCE(similarity(s.name, ${q}), 0),
          COALESCE(similarity(s.email, ${q}), 0)
        ) AS score
      FROM staff s
      WHERE s.store_id = ${storeId}
        AND (
          s.name ILIKE ${pattern}
          OR s.email ILIKE ${pattern}
          OR similarity(s.name, ${q}) > ${SIMILARITY_THRESHOLD}
          OR similarity(s.email, ${q}) > ${SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${MAX_RESULTS_PER_TYPE}
    `),

    db.execute(sql`
      SELECT
        sv.id,
        sv.name,
        sv.duration_minutes,
        sv.price,
        'service' AS entity_type,
        COALESCE(similarity(sv.name, ${q}), 0) AS score
      FROM services sv
      WHERE sv.store_id = ${storeId}
        AND (
          sv.name ILIKE ${pattern}
          OR similarity(sv.name, ${q}) > ${SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${MAX_RESULTS_PER_TYPE}
    `),

    db.execute(sql`
      SELECT
        a.id,
        a.start_time,
        a.status,
        c.full_name AS customer_name,
        sv.name AS service_name,
        'appointment' AS entity_type,
        GREATEST(
          COALESCE(similarity(c.full_name, ${q}), 0),
          COALESCE(similarity(sv.name, ${q}), 0)
        ) AS score
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.customer_id
      LEFT JOIN services sv ON sv.id = a.service_id
      WHERE a.store_id = ${storeId}
        AND (
          c.full_name ILIKE ${pattern}
          OR sv.name ILIKE ${pattern}
          OR similarity(c.full_name, ${q}) > ${SIMILARITY_THRESHOLD}
          OR similarity(sv.name, ${q}) > ${SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC, a.start_time DESC
      LIMIT ${MAX_RESULTS_PER_TYPE}
    `),

    db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.price,
        p.stock_quantity,
        'product' AS entity_type,
        COALESCE(similarity(p.name, ${q}), 0) AS score
      FROM products p
      WHERE p.store_id = ${storeId}
        AND (
          p.name ILIKE ${pattern}
          OR similarity(p.name, ${q}) > ${SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${MAX_RESULTS_PER_TYPE}
    `),
  ]);

  const toRows = (result: any) =>
    Array.isArray(result) ? result : (result?.rows ?? []);

  const allResults = {
    customers: toRows(customers),
    staff: toRows(staff),
    services: toRows(services),
    appointments: toRows(appointments),
    products: toRows(products),
  };

  const totalCount =
    allResults.customers.length +
    allResults.staff.length +
    allResults.services.length +
    allResults.appointments.length +
    allResults.products.length;

  res.json({ results: allResults, query: q, totalCount });
});

export default router;
