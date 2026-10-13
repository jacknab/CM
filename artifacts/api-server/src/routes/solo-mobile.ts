/**
 * Login for the certxa-solo native app (solo professionals).
 *
 * Verifies the same email/password as the web app's /api/auth/login against
 * the existing `users` table, but returns a stateless JWT (see lib/soloAuth.ts)
 * instead of a session cookie — the native app has no cookie jar. Every other
 * endpoint the app needs (appointments, services, customers, payments/terminal)
 * is unchanged: middleware/permissions.ts's attachAuthContext bridges this
 * token into the same req.session fields a cookie login would set.
 */

import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { signSoloToken } from "../lib/soloAuth";
import { pool } from "../db";
import { isExpoPushToken } from "../lib/ownerPush";
import { isProAccount } from "@shared/proAccount";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password ?? "");
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    // The app is for accounts that were created in the app. Every other Certxa account uses the website.
    if (!isProAccount(user.accountType)) {
      res.status(403).json({
        code: "NOT_AN_APP_ACCOUNT",
        message: "This account was created on the Certxa website, so it signs in at certxa.com. To use this app, create an account here.",
      });
      return;
    }

    const token = signSoloToken({
      userId: user.id,
      staffId: user.role === "staff" && user.staffId ? user.staffId : undefined,
    });

    const { password: _pw, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error("[solo/login] Error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ── Push notifications ───────────────────────────────────────────────────────
// The app registers this phone after sign-in and removes it at sign-out. The session fields are
// filled in from the Bearer token by attachAuthContext, the same as every other app request.

router.post("/push-token", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
    const token = req.body?.token;
    if (!isExpoPushToken(token)) { res.status(400).json({ message: "Invalid push token" }); return; }
    const store = await pool.query<{ id: number }>(`SELECT id FROM locations WHERE user_id = $1 ORDER BY id LIMIT 1`, [userId]);
    if (!store.rows[0]) { res.status(400).json({ message: "No business was found for this account" }); return; }
    const platform = req.body?.platform === "android" ? "android" : "ios";
    // A phone belongs to whoever signed in on it last.
    await pool.query(
      `INSERT INTO owner_push_devices (store_id, user_id, token, platform) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET store_id = EXCLUDED.store_id, user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [store.rows[0].id, userId, token, platform],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[solo/push-token] Error:", err);
    res.status(500).json({ message: "Could not register this phone for notifications" });
  }
});

router.delete("/push-token", async (req, res) => {
  try {
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
    const token = req.body?.token;
    if (!isExpoPushToken(token)) { res.status(400).json({ message: "Invalid push token" }); return; }
    await pool.query(`DELETE FROM owner_push_devices WHERE token = $1 AND user_id = $2`, [token, userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[solo/push-token] Error:", err);
    res.status(500).json({ message: "Could not remove this phone" });
  }
});

export default router;
