import type { Request } from "express";
import { pool } from "../db";
import { validateMobileToken } from "./mobileTokens";

/**
 * Resolves the authenticated user's store (location) ID from the session.
 * Handles both user sessions (userId → locations table) and staff sessions
 * (staffId → staff.store_id).
 *
 * Security model: the client may hint a storeId via ?storeId= or req.body.storeId,
 * but we ALWAYS validate ownership against the DB before accepting it.
 * If the hinted storeId is invalid or not owned by this user we fall back to
 * their first store (single-store users are unaffected).
 *
 * Returns the numeric storeId, or null if unresolvable.
 */
export async function resolveSessionStoreId(req: Request): Promise<number | null> {
  // ── Native app Bearer token (Certxa Terminal) ─────────────────────────────
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const native = validateMobileToken(authHeader.slice(7));
    if (native) return native.storeId;
  }

  const userId = (req.session as any)?.userId;

  if (userId) {
    // Accept a client-supplied storeId only after ownership validation.
    const rawHint = req.query?.storeId ?? (req.body as any)?.storeId;
    if (rawHint !== undefined && rawHint !== null && rawHint !== "") {
      const hinted = Number(rawHint);
      if (Number.isFinite(hinted) && hinted > 0) {
        const owned = await pool.query<{ id: number }>(
          `SELECT id FROM locations WHERE id = $1 AND user_id = $2 LIMIT 1`,
          [hinted, userId]
        );
        if (owned.rows[0]?.id) return owned.rows[0].id;
        // Hinted storeId not owned — fall through to first-store fallback.
      }
    }

    // Default: first store for this user.
    const result = await pool.query<{ id: number }>(
      `SELECT id FROM locations WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    // Return the owned location if found. If not found, fall through to the
    // staffId check below — staff members who log in via email/password at /auth
    // have both userId AND staffId set in the session, but own no locations.
    if (result.rows[0]?.id) return result.rows[0].id;
  }

  const staffId = (req.session as any)?.staffId;
  if (staffId) {
    const result = await pool.query<{ store_id: number }>(
      `SELECT store_id FROM staff WHERE id = $1 LIMIT 1`,
      [staffId]
    );
    return result.rows[0]?.store_id ?? null;
  }

  return null;
}
