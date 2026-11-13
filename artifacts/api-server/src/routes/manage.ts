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
// The account email can never be changed, and the mobile number changes only with a text code (owner, 2026-11-13).
router.patch("/profile", requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.session.userId;
    const b = req.body ?? {};
    const updates: Record<string, string | null> = {};

    if (typeof b.firstName === "string") updates.firstName = b.firstName.trim().slice(0, 100);
    if (typeof b.lastName === "string") updates.lastName = b.lastName.trim().slice(0, 100);
    if (typeof b.phone === "string") {
      // The account's mobile number only ever changes through POST /api/account/phone/send-code + verify, with a code
      // texted to the new number (lib/proPhoneVerification.ts) — never by typing it here, for any account
      // (owner, 2026-11-13: stops free-trial abuse).
      const phone = b.phone.trim().slice(0, 40) || null;
      const { rows: [own] } = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      if (phone !== (own?.phone ?? null)) return res.status(409).json({ error: "Change your mobile number with a text code." });
    }
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

// ─── Extra account e-mails (owner, 2026-11-13; lib/accountEmails.ts) ────────────────────────────────────────────────
// The login e-mail never changes. The owner adds other addresses; each confirms by link, then gets every account e-mail.
//   GET    /api/manage/emails                 { login, extras: [{ id, email, confirmed }] }
//   POST   /api/manage/emails  { email }      add + e-mail the confirmation link (also re-sends it for an unconfirmed one)
//   DELETE /api/manage/emails/:id             remove an added address (the login e-mail can't be removed)
//   GET    /api/manage/emails/confirm?token=  the link in the confirmation e-mail (no sign-in needed)
router.get("/emails", requireAuth, async (req: any, res) => {
  try {
    const { listExtraEmails } = await import("../lib/accountEmails");
    const { rows: [me] } = await pool.query(`SELECT email FROM users WHERE id = $1`, [req.session.userId]);
    return res.json({ login: me?.email ?? null, extras: await listExtraEmails(req.session.userId) });
  } catch (err) {
    console.error("[manage] emails list:", err);
    return res.status(500).json({ error: "Could not load the e-mail addresses" });
  }
});

router.post("/emails", requireAuth, async (req: any, res) => {
  try {
    const { addExtraEmail } = await import("../lib/accountEmails");
    const r = await addExtraEmail(req.session.userId, String(req.body?.email ?? ""));
    if (!r.ok) return res.status(r.status).json({ error: r.message });
    const appUrl = (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
    const link = `${appUrl}/api/manage/emails/confirm?token=${r.token}`;
    const { sendEmail } = await import("../mail");
    const { rows: [me] } = await pool.query(`SELECT email FROM users WHERE id = $1`, [req.session.userId]);
    const sent = await sendEmail(0, r.email, "Confirm this e-mail for your Certxa account", `
      <p>Someone signed in to the Certxa account <strong>${String(me?.email ?? "").replace(/[<>&"]/g, "")}</strong> asked to also send its account e-mails to this address.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#3f2a66;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Confirm this e-mail</a></p>
      <p>The link works for 48 hours. If this wasn't you, ignore this e-mail and nothing will be sent here.</p>`);
    if (!sent.success) return res.status(502).json({ error: "We couldn't send the confirmation e-mail. Check the address and try again." });
    return res.status(201).json({ id: r.id, email: r.email, confirmed: false });
  } catch (err) {
    console.error("[manage] emails add:", err);
    return res.status(500).json({ error: "Could not add the e-mail address" });
  }
});

router.delete("/emails/:id", requireAuth, async (req: any, res) => {
  try {
    const { removeExtraEmail } = await import("../lib/accountEmails");
    const ok = await removeExtraEmail(req.session.userId, Number(req.params.id));
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("[manage] emails remove:", err);
    return res.status(500).json({ error: "Could not remove the e-mail address" });
  }
});

router.get("/emails/confirm", async (req, res) => {
  const page = (title: string, body: string) => res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f5fb;margin:0;padding:48px 16px;color:#1f1b2e">
    <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 6px 24px rgba(0,0,0,.06)">
    <h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.5;margin:0">${body}</p></div></body></html>`);
  try {
    const { confirmExtraEmail } = await import("../lib/accountEmails");
    const r = await confirmExtraEmail(String(req.query.token ?? ""));
    if (!r) return page("This link has expired", "Add the e-mail again in Settings → Personal Details to get a new link.");
    return page("E-mail confirmed", `Certxa account e-mails will now also be sent to ${r.email.replace(/[<>&"]/g, "")}.`);
  } catch (err) {
    console.error("[manage] emails confirm:", err);
    return page("Something went wrong", "Please try the link again in a moment.");
  }
});

export default router;
