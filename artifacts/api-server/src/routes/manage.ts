import { Router } from "express";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import { locations } from "../../shared/schema";
import { users } from "../../shared/models/auth";
import { eq } from "drizzle-orm";

const router = Router();

// Lightweight auth guard — returns 401 if no session
function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET /api/manage/overview
// Returns the logged-in user's profile, SalonOS stores, and LaunchSite websites.
router.get("/overview", requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.session.userId;

    // User profile
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        profileImageUrl: users.profileImageUrl,
        subscriptionStatus: users.subscriptionStatus,
        trialEndsAt: users.trialEndsAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return res.status(404).json({ error: "User not found" });

    // SalonOS stores owned by this user
    const stores = await db
      .select({
        id: locations.id,
        name: locations.name,
        bookingSlug: locations.bookingSlug,
        timezone: locations.timezone,
        phone: locations.phone,
        address: locations.address,
      })
      .from(locations)
      .where(eq(locations.userId, userId));

    // LaunchSite websites linked to user's email
    let websites: any[] = [];
    try {
      const result = await pool.query(
        `SELECT os.id, os.business_name, os.template_id, os.status,
                os.domain_type, os.custom_domain, os.domain_payment_status,
                COALESCE(os.contact_email, os.email) AS email,
                s.slug
         FROM   onboarding_submissions os
         LEFT   JOIN subdomains s ON s.submission_id = os.id
         WHERE  COALESCE(os.contact_email, os.email) = $1
         ORDER  BY os.id DESC`,
        [user.email]
      );
      websites = result.rows;
    } catch {
      // Table may not exist in this environment — gracefully return empty
      websites = [];
    }

    const activeCount = websites.filter((w) => w.status === "active").length;

    res.json({ user, salonos: { stores }, launchsite: { websites, activeCount } });
  } catch (err: any) {
    console.error("[Manage] overview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/manage/logout — shared logout that clears the cross-subdomain session
router.post("/logout", (req: any, res) => {
  req.session.destroy((err: any) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    // Cookie domain: in production restrict to the configured app domain so the
    // cookie is cleared across all subdomains. On Replit / local dev, omit the
    // domain so the browser clears the cookie for the current origin only.
    const _cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    res.clearCookie("connect.sid", {
      domain: _cookieDomain,
      path: "/",
    });
    res.json({ ok: true });
  });
});

// PATCH /api/manage/profile — update the account owner's personal details.
// Email is intentionally NOT editable here (changing the login email needs a
// verification flow).
router.patch("/profile", requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.session.userId;
    const b = req.body ?? {};
    const updates: Record<string, string | null> = {};

    if (typeof b.firstName === "string") updates.firstName = b.firstName.trim().slice(0, 100);
    if (typeof b.lastName === "string") updates.lastName = b.lastName.trim().slice(0, 100);
    if (typeof b.phone === "string") updates.phone = b.phone.trim().slice(0, 40) || null;
    if (typeof b.profileImageUrl === "string") updates.profileImageUrl = b.profileImageUrl.trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const [row] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        profileImageUrl: users.profileImageUrl,
      });

    if (!row) return res.status(404).json({ error: "User not found" });
    return res.json(row);
  } catch (err: any) {
    console.error("[Manage] profile update error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/manage/change-password — verify current password, set a new one.
router.post("/change-password", requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.session.userId;
    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ error: "Current password is required." });
    }

    const [user] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password ?? "");
    if (!ok) return res.status(400).json({ error: "Current password is incorrect." });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ password: hashed, passwordChanged: true }).where(eq(users.id, userId));

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[Manage] change-password error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
