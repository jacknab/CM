/**
 * server/lib/pagination.ts — Cursor-based pagination for Certxa SalonOS
 *
 * Replaces OFFSET pagination which becomes slow on large tables because
 * PostgreSQL must scan and skip all prior rows.
 *
 * Cursor strategy:
 *   - Cursor encodes {id, createdAt} (or any sortable pair) as base64 JSON
 *   - Queries use WHERE (created_at, id) < (cursor.createdAt, cursor.id)
 *     to skip already-seen rows using the index directly
 *   - Works with any compound DESC index on (storeId, createdAt DESC)
 *
 * Usage:
 *   const { items, nextCursor, hasMore } = await paginateDesc({
 *     query: db.select().from(invoiceRecords).where(eq(invoiceRecords.salonId, id)),
 *     cursor,
 *     limit: 25,
 *     cursorFields: { date: 'created_at', id: 'id' },
 *   });
 */

import { and, lt, lte, sql, type SQL } from "drizzle-orm";

// ── Cursor encoding ────────────────────────────────────────────────────────

export interface PageCursor {
  id: number;
  ts: string; // ISO-8601 timestamp
}

export function encodeCursor(id: number, ts: Date | string): string {
  const payload: PageCursor = { id, ts: new Date(ts).toISOString() };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): PageCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as PageCursor;
    if (typeof parsed.id !== "number" || typeof parsed.ts !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── Paginated response type ────────────────────────────────────────────────

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

// ── Core helper ────────────────────────────────────────────────────────────

export interface PaginateOptions {
  /** Already-filtered base query (WHERE storeId = X etc.) */
  items: any[];
  /** Decoded cursor from the request (null = first page) */
  cursor: PageCursor | null;
  /** Page size (default 25, max 100) */
  limit?: number;
  /** Field name in the row that holds the timestamp used for sorting */
  tsField?: string;
}

/**
 * Apply in-memory cursor slicing to an already-loaded result set.
 * For most tables this is fine because Drizzle WHERE clauses already
 * limit the DB scan. Use the SQL-level variant below for very large tables.
 */
export function sliceByIdCursor<T extends { id: number; createdAt?: any }>(
  rows: T[],
  cursor: PageCursor | null,
  limit = 25,
): PageResult<T> {
  const pageSize = Math.min(limit, 100);

  let filtered = rows;
  if (cursor) {
    // rows are assumed DESC order by (createdAt, id)
    filtered = rows.filter((r) => {
      const rowTs = new Date(r.createdAt ?? 0).getTime();
      const curTs = new Date(cursor.ts).getTime();
      if (rowTs !== curTs) return rowTs < curTs;
      return r.id < cursor.id;
    });
  }

  const page = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;
  const last = page[page.length - 1];

  return {
    items: page,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor(last.id, last.createdAt ?? new Date())
        : null,
  };
}

/**
 * Build a SQL WHERE fragment for cursor pagination.
 * Use this when pushing the cursor filter all the way to the DB query
 * (recommended for large tables like billing_activity_logs, invoice_records).
 *
 * Requires a compound index on (tenant_id, created_at DESC, id DESC).
 *
 * Example:
 *   const cursorWhere = buildCursorWhere(cursor, invoiceRecords.createdAt, invoiceRecords.id);
 *   db.select().from(invoiceRecords)
 *     .where(and(eq(invoiceRecords.salonId, id), cursorWhere))
 *     .orderBy(desc(invoiceRecords.createdAt), desc(invoiceRecords.id))
 *     .limit(limit + 1)
 */
export function buildCursorWhere(
  cursor: PageCursor | null,
  tsColumn: any,
  idColumn: any,
): SQL | undefined {
  if (!cursor) return undefined;
  // (ts, id) < (cursor.ts, cursor.id)  — row-value comparison uses the compound index
  return sql`(${tsColumn}, ${idColumn}) < (${new Date(cursor.ts)}::timestamptz, ${cursor.id})`;
}

/**
 * Parse cursor from a query-string parameter.
 * Returns null (= first page) if missing or invalid.
 */
export function parseCursorParam(raw: string | undefined): PageCursor | null {
  if (!raw) return null;
  return decodeCursor(raw);
}

/**
 * Standard page-size parser: clamp between 1 and 100.
 */
export function parseLimitParam(raw: string | undefined, defaultVal = 25): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  if (Number.isNaN(n)) return defaultVal;
  return Math.max(1, Math.min(100, n));
}
