import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { db, pool } from "./db";
import { users } from "@shared/models/auth";
import { locations, staff, passwordResetTokens, storeSettings, staffAvailability } from "@shared/schema";
import { eq, and, gt, or } from "drizzle-orm";
import { sendEmail } from "./mail";
import { sendWelcomeEmail } from "./lib/systemEmails";
import { computePermissions, normalizeRole } from "@shared/permissions";
import { toE164US } from "./lib/phoneUtils";
import { logAuthEvent } from "./lib/authEvents";
import { TrialService } from "./services/trial-service";
import { emitPlatformEmailEvent } from "./services/platform-email-engine";
import { clientIntelligence } from "../shared/schema/intelligence";
import { runIntelligenceForStore } from "./intelligence/orchestrator";
import {
  getGoogleLoginAuthUrl,
  exchangeGoogleLoginCode,
  isGoogleLoginConfigured,
} from "./lib/googleLoginAuth";

function generateOwnerOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Boot the intelligence engine for a store on first login if it has never
 * been computed before. Runs entirely in the background — the login response
 * is NOT delayed by this work.
 */
async function maybeBootstrapIntelligence(userId: string): Promise<void> {
  try {
    const [store] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.userId, userId))
      .limit(1);

    if (!store) return;

    const [existing] = await db
      .select({ id: clientIntelligence.id })
      .from(clientIntelligence)
      .where(eq(clientIntelligence.storeId, store.id))
      .limit(1);

    if (!existing) {
      console.log(`[intelligence] First login for store ${store.id} — bootstrapping intelligence in background`);
      runIntelligenceForStore(store.id).catch(err =>
        console.error("[intelligence] Bootstrap error:", err)
      );
    }
  } catch (err) {
    // Non-fatal — never block login
    console.error("[intelligence] maybeBootstrapIntelligence error:", err);
  }
}

// ─── Per-IP brute-force guard for staff-otp-login ────────────────────────────
// An IP that submits 10 wrong OTP codes within 1 hour is locked out for 1 hour.
// The authLimiter (20 req/min) is the first line; this is the second.
interface OtpFailRecord { count: number; lockedUntil: number | null; }
const otpVerifyFailures = new Map<string, OtpFailRecord>();
const OTP_MAX_FAILURES  = 3;
const OTP_LOCKOUT_MS    = 60 * 60 * 1000;   // 1 hour

function recordOtpFailure(ip: string): void {
  const rec = otpVerifyFailures.get(ip) ?? { count: 0, lockedUntil: null };
  rec.count += 1;
  if (rec.count >= OTP_MAX_FAILURES) {
    rec.lockedUntil = Date.now() + OTP_LOCKOUT_MS;
    console.warn(`[staff-otp-login] IP locked after ${rec.count} OTP failures: ${ip}`);
  }
  otpVerifyFailures.set(ip, rec);
}

function isOtpIpLocked(ip: string): { locked: boolean; retryAfterSecs: number } {
  const rec = otpVerifyFailures.get(ip);
  if (!rec?.lockedUntil) return { locked: false, retryAfterSecs: 0 };
  const remaining = rec.lockedUntil - Date.now();
  if (remaining <= 0) { otpVerifyFailures.delete(ip); return { locked: false, retryAfterSecs: 0 }; }
  return { locked: true, retryAfterSecs: Math.ceil(remaining / 1000) };
}

// Holds the session middleware instance after setupAuth() runs.
// Exported so WebSocket upgrade handlers (which bypass app.use()) can
// call it directly to populate req.session before authenticating.
let exportedSessionMiddleware: ReturnType<typeof session> | null = null;
export function getSessionMiddleware(): ReturnType<typeof session> {
  if (!exportedSessionMiddleware) throw new Error("setupAuth() must be called before getSessionMiddleware()");
  return exportedSessionMiddleware;
}

export function setupAuth(app: Express) {
  // Trust exactly 1 proxy hop — required for Replit (proxied HTTPS) and
  // VPS setups where Nginx sits in front of Node.
  // Using `1` instead of `true` satisfies express-rate-limit's trust proxy
  // validation (ERR_ERL_PERMISSIVE_TRUST_PROXY) while still allowing correct
  // IP detection through a single reverse proxy layer.
  app.set("trust proxy", 1);

  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool: pool as any,
    createTableIfMissing: true,
    tableName: "sessions",
    errorLog: console.error,
  });

  // REPLIT_DEV_DOMAIN is only injected in the Replit dev workspace.
  // REPL_ID is present in both dev and deployed Replit environments.
  const isReplitDev = !!process.env.REPLIT_DEV_DOMAIN;
  const isReplit    = !!(process.env.REPLIT_DEV_DOMAIN || process.env.REPL_ID);

  // Use secure cookies whenever:
  //   • We are in production mode (VPS with TLS termination), OR
  //   • We are inside Replit (proxied HTTPS regardless of NODE_ENV).
  const secureCookies = process.env.NODE_ENV === "production" || isReplit;

  // Restrict the cookie domain only when COOKIE_DOMAIN is explicitly set (e.g. ".certxa.com").
  // Skip it in Replit dev — the proxied *.replit.dev origin doesn't need a shared domain.
  // In Replit production (custom domain) and on the VPS, honour the value so cookies are
  // shared across subdomains correctly.
  const cookieDomain =
    !isReplitDev && process.env.COOKIE_DOMAIN ? process.env.COOKIE_DOMAIN : undefined;

  // SameSite strategy:
  //   "none"  — required for Replit's proxied iframe (cookie crosses origins)
  //   "lax"   — correct for VPS / direct HTTPS; doesn't require Secure flag,
  //             works for all same-origin API calls and top-level navigations.
  const sameSitePolicy: "none" | "lax" = isReplit ? "none" : "lax";

  // Secure strategy:
  //   true    — Replit always serves HTTPS, and production VPS always terminates
  //             TLS at nginx. Set Secure flag unconditionally whenever we know
  //             the client connection is HTTPS. Avoids relying on req.secure
  //             detection which can be flaky across proxy configurations.
  //             Required when sameSite is "none" — browsers reject cookies that
  //             have sameSite=none without Secure.
  //   false   — development (plain HTTP, no proxy).
  const securePolicy: boolean = secureCookies;

  // Build the session middleware as a named variable so it can be exported
  // and reused for WebSocket upgrade requests (which bypass app.use()).
  const sessionMiddlewareInstance = session({
    name: "certxa.sid",
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh cookie expiration on every request — keeps active devices signed in
    cookie: {
      httpOnly: true,
      secure: securePolicy,
      sameSite: sameSitePolicy,
      maxAge: 1000 * 60 * 60 * 24 * 7, // Default: 7 days (overridden to 10 years for kiosk-mode logins)
      domain: cookieDomain,
    },
  });
  // Expose so WebSocket upgrade handlers can call it directly.
  exportedSessionMiddleware = sessionMiddlewareInstance;
  app.use(sessionMiddlewareInstance);

  // 10 years — practically "never expires", used for front-desk / kiosk devices
  const KIOSK_MAX_AGE = 1000 * 60 * 60 * 24 * 365 * 10;

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { password, firstName, lastName, keepSignedIn } = req.body;
      const email = typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : req.body.email;

      if (!email || !password) {
        res.status(400).json({ message: "Email and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
      }

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        res.status(409).json({ message: "An account with this email already exists" });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
        })
        .returning();

      // Start the 60-day free trial immediately on registration
      await TrialService.setupTrialForUser(user.id);

      // Log registration event
      logAuthEvent(user.id, "register", req, { email });

      // Welcome email (non-blocking)
      sendWelcomeEmail(email, firstName || null).catch(() => {});
      emitPlatformEmailEvent("signup", user.id, { source: "password" }).catch((err) =>
        console.warn("[PlatformEmail] signup event failed:", err?.message),
      );

      const { password: _, ...safeUser } = user;
      const role = normalizeRole(user.role);
      const permissions = Array.from(computePermissions(role, user.permissions ?? null));
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error("[register] Session regenerate ERROR:", regenErr);
          res.status(500).json({ message: "Session could not be created" });
          return;
        }
        (req.session as any).userId = user.id;
        if (keepSignedIn) {
          req.session.cookie.maxAge = KIOSK_MAX_AGE;
        }
        req.session.save((err) => {
          if (err) {
            console.error("[register] Session save ERROR:", err);
            res.status(500).json({ message: "Session could not be saved" });
            return;
          }
          res.status(201).json({ ...safeUser, role, permissions });
        });
      });
      return;
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, keepSignedIn } = req.body;

      if (!email || !password) {
        res.status(400).json({ message: "Email and password are required" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      // --- Check users table first ---
      const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));

      if (user) {
        const valid = await bcrypt.compare(password, user.password ?? "");
        if (valid) {
          const { password: _, ...safeUser } = user;
          // Regenerate session to invalidate any stale session/cookie from previous deploys.
          // This also prevents session-fixation attacks.
          req.session.regenerate((regenErr) => {
            if (regenErr) {
              console.error("[login] Session regenerate ERROR:", regenErr);
              res.status(500).json({ message: "Session could not be created" });
              return;
            }
            (req.session as any).userId = user.id;
            // If this user is a staff member, also set staffId so all
            // staff-scoped API endpoints (which check req.session.staffId)
            // work correctly when a staff member logs in via email/password.
            if (user.role === "staff" && user.staffId) {
              (req.session as any).staffId = user.staffId;
            }
            if (keepSignedIn) {
              req.session.cookie.maxAge = KIOSK_MAX_AGE;
            }
            req.session.save((err) => {
              if (err) {
                console.error("[login] Session save ERROR:", err);
                res.status(500).json({ message: "Session could not be saved" });
                return;
              }
              console.log("[login] Session regenerated OK — ID:", req.sessionID, "userId:", (req.session as any).userId);
              logAuthEvent(user.id, "login", req);
              maybeBootstrapIntelligence(user.id);
              const role = normalizeRole(user.role);
              const permissions = Array.from(computePermissions(role, user.permissions ?? null));
              res.json({ ...safeUser, role, permissions });
            });
          });
          return;
        }

        // User exists but password is wrong — don't fall through to staff table
        logAuthEvent(user.id, "failed_login", req, { email: normalizedEmail, reason: "wrong_password" });
        res.status(401).json({ message: "Invalid email or password" });
        return;
      }

      // User not found at all
      logAuthEvent(null, "failed_login", req, { email: normalizedEmail, reason: "user_not_found" });
      res.status(401).json({ message: "Invalid email or password" });
      return;
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
      return;
    }
  });

  /**
   * GET /api/auth/google
   * ────────────────────
   * Browser-redirect entry point for "Continue with Google" login/registration.
   * Completely isolated from the Google Business Profile OAuth flow — uses
   * openid/email/profile scopes only, a dedicated callback URL, and never
   * touches the business.manage token storage.
   *
   * Optional query params `redirect` and `plan` are round-tripped through the
   * OAuth `state` so the callback can send the browser back to the right place
   * (mirrors the ?redirect=/?plan= params the email/password flow already uses).
   */
  app.get("/api/auth/google", (req, res) => {
    if (!isGoogleLoginConfigured()) {
      console.error("[Google Login] /api/auth/google — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set");
      return res.redirect("/auth?error=google_not_configured");
    }

    const redirectTo = typeof req.query.redirect === "string" ? req.query.redirect : null;
    const plan = typeof req.query.plan === "string" ? req.query.plan : null;

    const csrf = crypto.randomBytes(16).toString("hex");
    const statePayload = Buffer.from(JSON.stringify({ csrf, redirectTo, plan })).toString("base64url");
    (req.session as any).googleLoginState = csrf;

    const authUrl = getGoogleLoginAuthUrl(statePayload);
    req.session.save(() => res.redirect(authUrl));
  });

  /**
   * GET /api/auth/google/callback
   * ──────────────────────────────
   * Google redirects here after the openid/email/profile consent screen.
   *   1. Verify CSRF state against the session
   *   2. Exchange the code for a verified id_token → { googleId, email, name, picture }
   *   3. Match an existing user by googleId, then by email (linking googleId on
   *      first Google sign-in for a pre-existing password account), else create one
   *   4. Regenerate the session and set userId (same pattern as /api/auth/login)
   *   5. Redirect back into the app, preserving ?redirect=/?plan= from step 1
   *
   * redirect_uri must match exactly what's registered in Google Cloud Console —
   * see GOOGLE_LOGIN_CALLBACK_URL in lib/googleLoginAuth.ts.
   */
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      console.warn("[Google Login] User denied access or Google returned an error:", oauthError);
      return res.redirect("/auth?error=google_denied");
    }

    if (!code || !state) {
      return res.redirect("/auth?error=google_oauth_failed");
    }

    let redirectTo: string | null = null;
    let plan: string | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      if (decoded.csrf !== (req.session as any)?.googleLoginState) {
        console.warn("[Google Login] callback — CSRF state mismatch");
        return res.redirect("/auth?error=google_oauth_failed");
      }
      redirectTo = decoded.redirectTo ?? null;
      plan = decoded.plan ?? null;
    } catch {
      console.warn("[Google Login] callback — could not decode state");
      return res.redirect("/auth?error=google_oauth_failed");
    }
    delete (req.session as any).googleLoginState;

    const query = new URLSearchParams();
    if (redirectTo) query.set("redirect", redirectTo);
    if (plan) query.set("plan", plan);
    const suffix = query.toString() ? `&${query.toString()}` : "";

    try {
      const profile = await exchangeGoogleLoginCode(code);

      // 1) Existing Google-linked account
      let [user] = await db.select().from(users).where(eq(users.googleId, profile.googleId));

      // 2) Existing password account with the same email — link it
      if (!user) {
        const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email));
        if (byEmail) {
          [user] = await db.update(users)
            .set({
              googleId: profile.googleId,
              profileImageUrl: byEmail.profileImageUrl ?? profile.profileImageUrl,
            })
            .where(eq(users.id, byEmail.id))
            .returning();
        }
      }

      // 3) Brand-new account — Google sign-up. Password column is NOT NULL, so we
      // fill it with a random bcrypt hash the user can never type; they can set a
      // real password later from account settings if they want email/password login too.
      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
        [user] = await db.insert(users).values({
          email: profile.email,
          password: unusablePassword,
          googleId: profile.googleId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profileImageUrl: profile.profileImageUrl,
        }).returning();

        await TrialService.setupTrialForUser(user.id);
        sendWelcomeEmail(profile.email, profile.firstName).catch(() => {});
        emitPlatformEmailEvent("signup", user.id, { source: "google" }).catch((err) =>
          console.warn("[PlatformEmail] Google signup event failed:", err?.message),
        );
      }

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error("[Google Login] Session regenerate ERROR:", regenErr);
          return res.redirect(`/auth?error=google_oauth_failed`);
        }
        (req.session as any).userId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error("[Google Login] Session save ERROR:", err);
            return res.redirect(`/auth?error=google_oauth_failed`);
          }
          console.log(`[Google Login] ${isNewUser ? "Registered" : "Logged in"} userId=${user.id} via Google`);
          logAuthEvent(user.id, isNewUser ? "register" : "google_oauth", req, { source: "google", email: user.email });
          if (!isNewUser) maybeBootstrapIntelligence(user.id);
          return res.redirect(`/auth?google=1${suffix}`);
        });
      });
    } catch (error) {
      console.error("[Google Login] callback — error exchanging code / creating session:", error);
      return res.redirect(`/auth?error=google_oauth_failed${suffix}`);
    }
  });

  /**
   * POST /api/auth/staff-otp-login
   * ──────────────────────────────
   * Passwordless login using an 8-digit one-time code sent via SMS invite.
   * Staff tap the code, we validate it against staff_sms_otps, create a
   * session, and mark the code used. No email or password required.
   */
  app.post("/api/auth/staff-otp-login", async (req, res) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || !/^\d{7,10}$/.test(code.trim())) {
        res.status(400).json({ message: "A valid access code is required." });
        return;
      }

      // Per-IP lockout: an IP that submits 10 wrong codes within 1 hour is blocked.
      // This is the second line of defence after authLimiter (20 req/min per IP).
      const clientIp = req.ip ?? "unknown";
      const otpLockStatus = isOtpIpLocked(clientIp);
      if (otpLockStatus.locked) {
        const mins = Math.ceil(otpLockStatus.retryAfterSecs / 60);
        res.status(429).json({
          code: "OTP_IP_LOCKED",
          retryAfterSecs: otpLockStatus.retryAfterSecs,
          message: `Too many incorrect codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
        });
        return;
      }

      // Find a matching, unexpired, unused OTP
      const { rows } = await pool.query<{
        id: number; staff_id: number; expires_at: string; used_at: string | null;
      }>(
        `SELECT id, staff_id, expires_at, used_at FROM staff_sms_otps
         WHERE code = $1 AND expires_at > NOW() AND used_at IS NULL
         LIMIT 1`,
        [code.trim()]
      );

      if (!rows.length) {
        recordOtpFailure(clientIp);
        res.status(401).json({ message: "Invalid or expired access code. Request a new one." });
        return;
      }

      const otpRow = rows[0]!;

      // Load the staff member
      const [staffMember] = await db.select().from(staff).where(eq(staff.id, otpRow.staff_id));
      if (!staffMember) {
        res.status(401).json({ message: "Staff account not found." });
        return;
      }

      if (staffMember.status === "removed" || staffMember.status === "deactivated") {
        res.status(403).json({ message: "Your account has been deactivated. Contact your manager." });
        return;
      }

      // Check whether this store has staff portal access enabled
      if (staffMember.storeId) {
        const [settingsRow] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, staffMember.storeId));
        if (settingsRow) {
          try {
            const prefs = JSON.parse(settingsRow.preferences as string);
            const features = prefs?.features ?? {};
            if (features.staffPortalEnabled === false) {
              res.status(403).json({ code: "PORTAL_DISABLED", message: "Your salon has disabled access to the staff portal." });
              return;
            }
          } catch { /* invalid JSON — treat as enabled */ }
        }
      }

      // Mark OTP as used
      await pool.query(`UPDATE staff_sms_otps SET used_at = NOW() WHERE id = $1`, [otpRow.id]);

      // Successful verification — clear this IP's failure counter
      otpVerifyFailures.delete(clientIp);

      // Mark staff as active/joined if still in invited state
      if (staffMember.status === "invited") {
        await db.update(staff)
          .set({ status: "active", joinedAt: new Date() })
          .where(eq(staff.id, staffMember.id));
      }

      // Check whether this staff member has a user account (completed onboarding)
      const [existingUserRow] = await db
        .select({ onboardingCompleted: users.onboardingCompleted })
        .from(users)
        .where(eq(users.staffId, staffMember.id))
        .limit(1);
      const onboardingDone = existingUserRow?.onboardingCompleted ?? false;

      const staffResponse = {
        id: `staff-${staffMember.id}`,
        email: staffMember.email ?? "",
        role: "staff" as const,
        staffId: staffMember.id,
        storeId: staffMember.storeId,
        firstName: staffMember.name?.split(" ")[0] ?? null,
        lastName: staffMember.name?.split(" ").slice(1).join(" ") || null,
        onboardingCompleted: onboardingDone,
        passwordChanged: onboardingDone,
        googleId: null,
        profileImageUrl: staffMember.avatarUrl ?? null,
        subscriptionStatus: "active",
        trialStartedAt: null,
        trialEndsAt: null,
        createdAt: null,
        updatedAt: null,
      };

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          res.status(500).json({ message: "Session could not be created" });
          return;
        }
        (req.session as any).staffId = staffMember.id;
        req.session.save((err) => {
          if (err) {
            res.status(500).json({ message: "Session could not be saved" });
            return;
          }
          console.log("[staff-otp-login] OK — staffId:", staffMember.id);
          res.json(staffResponse);
        });
      });
    } catch (error) {
      console.error("[staff-otp-login] Error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  /**
   * POST /api/auth/staff-request-otp
   * ──────────────────────────────────
   * Staff member (not yet logged in) requests a new access code via SMS.
   * Looks up the staff record by phone, generates a fresh 8-digit OTP,
   * stores it, and fires an SMS. Rate-limited to 1 per 2 minutes per phone.
   */
  app.post("/api/auth/staff-request-otp", async (req, res) => {
    try {
      const { phone } = req.body as { phone?: string };
      if (!phone?.trim()) {
        res.status(400).json({ message: "Phone number is required." });
        return;
      }

      // Normalize to E.164 for lookup — invalid numbers silently return "not found"
      const normalized = toE164US(phone);

      // Always respond with success to prevent phone enumeration
      const safeOk = () => res.json({ success: true, message: "If a matching account is found, a code will be sent." });

      if (!normalized) return safeOk();

      // Find staff by E.164 first, but also support legacy stored formats
      // (digits-only or missing +) so users can type a normal 10-digit number.
      const normalizedDigits = normalized.replace(/\D/g, "");
      const local10 = normalizedDigits.length === 11 && normalizedDigits.startsWith("1")
        ? normalizedDigits.slice(1)
        : normalizedDigits;
      const legacyWithCountry = `1${local10}`;

      const [staffMember] = await db
        .select()
        .from(staff)
        .where(or(
          eq(staff.phone, normalized),        // +1XXXXXXXXXX
          eq(staff.phone, normalizedDigits),  // 1XXXXXXXXXX
          eq(staff.phone, local10),           // XXXXXXXXXX
          eq(staff.phone, legacyWithCountry), // 1XXXXXXXXXX (explicit legacy variant)
        ))
        .limit(1)
        .catch(() => [null]);

      if (!staffMember) return safeOk();
      if (staffMember.status === "removed" || staffMember.status === "deactivated") return safeOk();
      if (!staffMember.storeId) return safeOk();

      // Check whether this store has staff portal access enabled
      const [settingsRow] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, staffMember.storeId));
      if (settingsRow) {
        try {
          const prefs = JSON.parse(settingsRow.preferences as string);
          const features = prefs?.features ?? {};
          if (features.staffPortalEnabled === false) {
            res.status(403).json({ code: "PORTAL_DISABLED", message: "Your salon has disabled access to the staff portal." });
            return;
          }
        } catch { /* invalid JSON — treat as enabled */ }
      }

      // Rate limit: max 1 OTP per 2 minutes per staff
      const { rows: recent } = await pool.query(
        `SELECT id FROM staff_sms_otps WHERE staff_id = $1 AND created_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
        [staffMember.id]
      );
      if (recent.length > 0) {
        res.status(429).json({ message: "A code was already sent recently. Please wait a moment before requesting again." });
        return;
      }

      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        `INSERT INTO staff_sms_otps (staff_id, phone, code, expires_at) VALUES ($1, $2, $3, $4)`,
        [staffMember.id, normalized, code, expiresAt]
      );

      // Staff portal OTP is a platform-cost message (not billed to a salon account).
      // sendTwilioSms supports both TWILIO_PHONE_NUMBER (direct) and
      // TWILIO_MESSAGING_SERVICE_SID (A2P 10DLC / toll-free pools).
      const otpBody = `${code} is your Certxa access code. Valid for 15 minutes. Do not share this code.`;
      const { sendTwilioSms } = await import("./sms");
      const twilioResult = await sendTwilioSms(normalized, otpBody);
      if (!twilioResult.success) {
        // Log the full reason so the VPS admin can diagnose quickly.
        // Common causes:
        //   • TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing → set in env
        //   • Neither TWILIO_PHONE_NUMBER nor TWILIO_MESSAGING_SERVICE_SID set → set one
        //   • Twilio API error (wrong number, carrier block, A2P rejection) → check Twilio console
        console.error(
          "[staff-request-otp] OTP SMS not delivered to",
          normalized,
          "— reason:", twilioResult.error,
          "| staffId:", staffMember.id,
          "| storeId:", staffMember.storeId,
        );
      }

      // Always return success to prevent phone enumeration.
      return safeOk();
    } catch (error) {
      console.error("[staff-request-otp] Error:", error);
      res.status(500).json({ message: "Failed to send code" });
    }
  });

  // ── Owner phone-OTP table bootstrap ──────────────────────────────────────────
  // Created idempotently on startup — no migration file required.
  pool.query(`
    CREATE TABLE IF NOT EXISTS owner_phone_otps (
      id         SERIAL PRIMARY KEY,
      phone      TEXT        NOT NULL,
      email      TEXT        NOT NULL,
      code       TEXT        NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS owner_phone_otps_phone_idx ON owner_phone_otps (phone);
  `).catch(err => console.error("[owner-otp] Table bootstrap error:", err));

  /**
   * GET /api/auth/check-availability
   *
   * Silently checks whether a phone number and/or email are already in use.
   * Returns { available: true } if both are free, { available: false } if
   * either is already taken. No error detail is returned to prevent enumeration.
   */
  app.get("/api/auth/check-availability", async (req, res) => {
    try {
      const rawPhone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
      const rawEmail = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";

      // Check email against users table
      if (rawEmail) {
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, rawEmail))
          .limit(1);
        if (existingUser) {
          res.json({ available: false });
          return;
        }
      }

      // Check phone against owner_phone_otps (used_at IS NOT NULL = completed a prior signup)
      if (rawPhone) {
        const normalized = toE164US(rawPhone);
        if (normalized) {
          const { rows } = await pool.query(
            `SELECT id FROM owner_phone_otps WHERE phone = $1 AND used_at IS NOT NULL LIMIT 1`,
            [normalized]
          );
          if (rows.length > 0) {
            res.json({ available: false });
            return;
          }
        }
      }

      res.json({ available: true });
    } catch (error) {
      console.error("[check-availability] Error:", error);
      // On error, allow the user to proceed — don't block on a check failure
      res.json({ available: true });
    }
  });

  /**
   * POST /api/auth/owner-request-otp
   *
   * Step 1 of owner signup phone verification. Generates a 6-digit code, stores
   * it in owner_phone_otps, and sends it via SMS to the supplied phone number.
   * Rate-limited to 1 per 2 minutes per phone to prevent abuse.
   */
  app.post("/api/auth/owner-request-otp", async (req, res) => {
    try {
      const { phone, email } = req.body as { phone?: string; email?: string };
      if (!phone?.trim() || !email?.trim()) {
        res.status(400).json({ message: "Phone and email are required." });
        return;
      }

      const normalized = toE164US(phone);
      if (!normalized) {
        res.status(400).json({ message: "Please enter a valid 10-digit US phone number." });
        return;
      }

      // Discard legacy non-6-digit signup codes so they cannot be reused by
      // the resend/email paths after the UI has moved to six digits.
      await pool.query(
        `UPDATE owner_phone_otps SET used_at = NOW()
         WHERE phone = $1 AND used_at IS NULL AND char_length(code) <> 6`,
        [normalized]
      );

      // Rate limit: 1 OTP per 2 minutes per phone
      const { rows: recent } = await pool.query(
        `SELECT id FROM owner_phone_otps
         WHERE phone = $1 AND created_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
        [normalized]
      );
      if (recent.length > 0) {
        res.status(429).json({ message: "A code was already sent recently. Please wait a moment before requesting again." });
        return;
      }

      const code      = generateOwnerOtp();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

      await pool.query(
        `INSERT INTO owner_phone_otps (phone, email, code, expires_at) VALUES ($1, $2, $3, $4)`,
        [normalized, email.trim().toLowerCase(), code, expiresAt]
      );

      const otpBody = `${code} is your Certxa verification code. Valid for 15 minutes. Do not share this code.`;
      const { sendTwilioSms } = await import("./sms");
      const result = await sendTwilioSms(normalized, otpBody);
      if (!result.success) {
        console.error(
          "[owner-request-otp] SMS delivery failed for", normalized,
          "— reason:", result.error,
          "| Ensure TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + (TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER) are set."
        );
      }

      res.json({ success: true, message: "Verification code sent." });
    } catch (error) {
      console.error("[owner-request-otp] Error:", error);
      res.status(500).json({ message: "Failed to send verification code. Please try again." });
    }
  });

  /**
   * POST /api/auth/owner-request-otp-email
   *
   * Fallback for owners who can't receive the SMS. Finds the most recent
   * unexpired OTP for the given phone (so SMS and email always share the same
   * code) and sends it to the owner's email address.
   */
  /**
   * POST /api/auth/owner-verify-otp
   *
   * Step 2 of owner signup phone verification. Validates the submitted code
   * against owner_phone_otps, marks it used, and returns success so the
   * frontend can advance to the password-creation step.
   */
  app.post("/api/auth/owner-verify-otp", async (req, res) => {
    try {
      const { phone, code } = req.body as { phone?: string; code?: string };
      if (!phone?.trim() || !code?.trim()) {
        res.status(400).json({ message: "Phone and code are required." });
        return;
      }

      const normalized = toE164US(phone);
      if (!normalized) {
        res.status(400).json({ message: "Invalid phone number." });
        return;
      }

      const trimmedCode = code.trim();
      if (!/^\d{6}$/.test(trimmedCode)) {
        res.status(400).json({ message: "Enter the 6-digit verification code." });
        return;
      }

      // Find a matching, unexpired, unused OTP
      const { rows } = await pool.query(
        `SELECT id FROM owner_phone_otps
         WHERE phone = $1
           AND code = $2
           AND expires_at > NOW()
           AND used_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [normalized, trimmedCode]
      );

      if (rows.length === 0) {
        res.status(400).json({ message: "Invalid or expired code. Please try again or request a new one." });
        return;
      }

      // Mark as used so it can't be replayed
      await pool.query(
        `UPDATE owner_phone_otps SET used_at = NOW() WHERE id = $1`,
        [rows[0].id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("[owner-verify-otp] Error:", error);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/auth/owner-request-otp-email", async (req, res) => {
    try {
      const { phone, email } = req.body as { phone?: string; email?: string };
      if (!phone?.trim() || !email?.trim()) {
        res.status(400).json({ message: "Phone and email are required." });
        return;
      }

      const normalized = toE164US(phone);
      if (!normalized) {
        res.status(400).json({ message: "Invalid phone number." });
        return;
      }
      const toEmail = email.trim().toLowerCase();

      // Rate limit email path: 1 per minute per phone
      const { rows: recentEmail } = await pool.query(
        `SELECT id FROM owner_phone_otps
         WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 minute'
         ORDER BY created_at DESC LIMIT 2`,
        [normalized]
      );
      if (recentEmail.length >= 2) {
        res.status(429).json({ message: "Too many requests. Please wait before requesting another code." });
        return;
      }

      // Reuse the most recent live OTP; generate a new one if all have expired
      const { rows } = await pool.query(
        `SELECT code FROM owner_phone_otps
         WHERE phone = $1 AND expires_at > NOW() AND used_at IS NULL
           AND char_length(code) = 6
         ORDER BY created_at DESC LIMIT 1`,
        [normalized]
      );
      let code: string;
      if (rows.length > 0) {
        code = rows[0].code as string;
      } else {
        code = generateOwnerOtp();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await pool.query(
          `INSERT INTO owner_phone_otps (phone, email, code, expires_at) VALUES ($1, $2, $3, $4)`,
          [normalized, toEmail, code, expiresAt]
        );
      }

      const year = new Date().getFullYear();
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#ffffff;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#f5f3ff;border-radius:16px;margin-bottom:16px;">
              <span style="font-size:28px;">🔐</span>
            </div>
            <h1 style="margin:0;font-size:24px;font-weight:800;color:#111827;letter-spacing:-0.03em;">Verify your account</h1>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">Your Certxa verification code</p>
          </div>
          <div style="background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Your verification code</p>
            <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:0.25em;color:#3B0764;font-family:'Courier New',monospace;">${code}</p>
            <p style="margin:12px 0 0;font-size:13px;color:#9ca3af;">Valid for 15 minutes · Do not share this code</p>
          </div>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 16px;">
            Enter this code on the Certxa signup page to verify your account. If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
          <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">© ${year} Certxa · <a href="https://certxa.com" style="color:#9ca3af;">certxa.com</a></p>
        </div>`;

      const result = await sendEmail(
        0,
        toEmail,
        `${code} is your Certxa verification code`,
        html,
        `Your Certxa verification code is: ${code} (valid for 15 minutes)`
      );

      if (!result.success) {
        console.error("[owner-request-otp-email] Email send failed:", result.error, "| to:", toEmail);
        res.status(500).json({ message: "Failed to send code to email. Please check your email address or try SMS again." });
        return;
      }

      res.json({ success: true, message: "Code sent to your email." });
    } catch (error) {
      console.error("[owner-request-otp-email] Error:", error);
      res.status(500).json({ message: "Failed to send code to email. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const logoutUserId: string | null = (req.session as any)?.userId ?? null;
    logAuthEvent(logoutUserId, "logout", req);
    req.session.destroy((err) => {
      if (err) {
          res.status(500).json({ message: "Logout failed" });
          return;
        }
        res.clearCookie("certxa.sid");
        res.json({ message: "Logged out" });
      });
    });

  /**
   * DELETE /api/auth/delete-account
   * Self-service account deletion. Requires the user to confirm their password.
   * Destroys the session and soft-deletes (deactivates) the account.
   * Hard-deletes after data-retention window per business rules.
   */
  app.delete("/api/auth/delete-account", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const { password, confirmPhrase } = req.body;
    if (!password) {
      res.status(400).json({ message: "Password is required to delete your account" });
      return;
    }
    if (confirmPhrase !== "DELETE") {
      res.status(400).json({ message: "Please type DELETE to confirm" });
      return;
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        res.status(404).json({ message: "Account not found" });
        return;
      }
      // Verify password
      const valid = await bcrypt.compare(password, user.password ?? "");
      if (!valid) {
        res.status(400).json({ message: "Incorrect password" });
        return;
      }
      // Deactivate the account (gates access without deleting data per retention policy)
      await db.update(users)
        .set({ subscriptionStatus: "canceled" } as any)
        .where(eq(users.id, userId));
      // Destroy session
      req.session.destroy(() => {
        res.clearCookie("certxa.sid");
        res.json({ message: "Account deleted successfully" });
      });
    } catch (err) {
      console.error("[delete-account] Error:", err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });
  app.get("/api/auth/user", async (req, res) => {
    const userId = (req.session as any)?.userId;
    const staffId = (req.session as any)?.staffId;

    if (!userId && !staffId) {
      res.status(200).json(null);
      return;
    }

    try {
      if (userId) {
        let [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
          res.status(401).json({ message: "Unauthorized" });
          return;
        }

        if (!user.onboardingCompleted) {
          const userStores = await db.select().from(locations).where(eq(locations.userId, userId));
          if (userStores.length > 0) {
            await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
            [user] = await db.select().from(users).where(eq(users.id, userId));
          }
        }

        const { password: _, ...safeUser } = user;
        const role = normalizeRole(user.role);
        const permissions = Array.from(computePermissions(role, user.permissions ?? null));
        res.json({ ...safeUser, role, permissions });
        return;
      }

      if (staffId) {
        const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));
        if (!staffMember) {
          res.status(401).json({ message: "Unauthorized" });
          return;
        }

        // Look up the linked users row to get real onboardingCompleted value
        const [staffUserRow] = await db
          .select({ onboardingCompleted: users.onboardingCompleted })
          .from(users)
          .where(eq(users.staffId, staffId))
          .limit(1);
        const onboardingDone = staffUserRow?.onboardingCompleted ?? false;

        const permissions = Array.from(computePermissions("staff", null));
        res.json({
          id: `staff-${staffMember.id}`,
          email: staffMember.email ?? "",
          role: "staff",
          permissions,
          staffId: staffMember.id,
          firstName: staffMember.name?.split(" ")[0] ?? null,
          lastName: staffMember.name?.split(" ").slice(1).join(" ") || null,
          onboardingCompleted: onboardingDone,
          passwordChanged: onboardingDone,
          googleId: null,
          profileImageUrl: staffMember.avatarUrl ?? null,
          subscriptionStatus: "active",
          trialStartedAt: null,
          trialEndsAt: null,
          createdAt: null,
          updatedAt: null,
        });
        return;
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
      return;
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ message: "Email is required" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));

      if (!user) {
        res.json({ message: "If that email is registered, a reset link has been sent." });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost:5000"}`;
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your Certxa password</h2>
          <p>Hi ${user.firstName || "there"},</p>
          <p>We received a request to reset your password. Click the link below to set a new one:</p>
          <p><a href="${resetUrl}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>`;

      await sendEmail(0, normalizedEmail, "Reset your Certxa password", html);
      logAuthEvent(user.id, "forgot_password", req, { email: normalizedEmail });
      res.json({ message: "If that email is registered, a reset link has been sent." });
      return;
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
      return;
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        res.status(400).json({ message: "Token and password are required" });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
      }

      const now = new Date();
      const [resetRecord] = await db
        .select()
        .from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.token, token), gt(passwordResetTokens.expiresAt, now)));

      if (!resetRecord) {
        res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
        return;
      }
      if (resetRecord.usedAt) {
        res.status(400).json({ message: "This reset link has already been used." });
        return;
      }

      const hashed = await bcrypt.hash(password, 10);
      await db.update(users).set({ password: hashed }).where(eq(users.id, resetRecord.userId));
      await db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, resetRecord.id));
      logAuthEvent(resetRecord.userId, "password_reset", req);
      res.json({ message: "Password updated successfully. You can now log in." });
      return;
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
      return;
    }
  });

  // ── Staff First-Time Onboarding Routes ───────────────────────────────────────

  /**
   * POST /api/staff/onboarding/account
   * Step 1 — staff sets their email address and creates a password.
   * Creates a users row with role='staff' + staffId link so they can log in
   * from the main /auth page on future visits.
   */
  app.post("/api/staff/onboarding/account", async (req, res) => {
    const rawStaffId = (req.session as any)?.staffId;
    if (!rawStaffId) { res.status(401).json({ message: "Unauthorized" }); return; }
    const staffId = Number(rawStaffId);

    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ message: "Email and password are required" }); return;
      }
      const normalEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail)) {
        res.status(400).json({ message: "Invalid email address" }); return;
      }
      if (password.length < 8) {
        res.status(400).json({ message: "Password must be at least 8 characters" }); return;
      }

      const [staffMember] = await db.select().from(staff).where(eq(staff.id, staffId));
      if (!staffMember) { res.status(404).json({ message: "Staff account not found" }); return; }

      // Ensure the email isn't already used by a DIFFERENT user account
      const [existingByEmail] = await db
        .select({ id: users.id, staffId: users.staffId })
        .from(users)
        .where(eq(users.email, normalEmail))
        .limit(1);
      if (existingByEmail && existingByEmail.staffId !== staffId) {
        res.status(409).json({ message: "That email address is already in use by another account" }); return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const firstName = staffMember.name?.split(" ")[0] ?? null;
      const lastName  = staffMember.name?.split(" ").slice(1).join(" ") || null;

      // Upsert users row (idempotent — safe to call again if step 1 is re-submitted)
      const [existingRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.staffId, staffId))
        .limit(1);

      if (existingRow) {
        await db.update(users)
          .set({ email: normalEmail, password: hashedPassword, updatedAt: new Date() })
          .where(eq(users.id, existingRow.id));
      } else {
        await db.insert(users).values({
          email:               normalEmail,
          password:            hashedPassword,
          role:                "staff",
          staffId,
          firstName,
          lastName,
          onboardingCompleted: false,
          passwordChanged:     true,
        });
      }

      // Keep staff.email in sync
      await db.update(staff).set({ email: normalEmail }).where(eq(staff.id, staffId));

      res.json({ success: true });
    } catch (err) {
      console.error("[staff/onboarding/account] Error:", err);
      res.status(500).json({ message: "Failed to save account details" });
    }
  });

  /**
   * POST /api/staff/onboarding/availability
   * Step 2 — staff sets their weekly availability windows.
   * Fully replaces any existing staff_availability rows for this staff member.
   */
  app.post("/api/staff/onboarding/availability", async (req, res) => {
    const rawStaffId = (req.session as any)?.staffId;
    if (!rawStaffId) { res.status(401).json({ message: "Unauthorized" }); return; }
    const staffId = Number(rawStaffId);

    try {
      const { slots } = req.body as {
        slots: Array<{ dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }>;
      };
      if (!Array.isArray(slots)) {
        res.status(400).json({ message: "slots array is required" }); return;
      }

      const enabled = slots.filter(s => s.enabled && s.startTime && s.endTime);

      await db.delete(staffAvailability).where(eq(staffAvailability.staffId, staffId));
      if (enabled.length > 0) {
        await db.insert(staffAvailability).values(
          enabled.map(s => ({
            staffId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime:   s.endTime,
          }))
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[staff/onboarding/availability] Error:", err);
      res.status(500).json({ message: "Failed to save availability" });
    }
  });

  /**
   * POST /api/staff/onboarding/complete
   * Final step — marks onboardingCompleted = true in the users row.
   * Must be called after /account has been completed.
   */
  app.post("/api/staff/onboarding/complete", async (req, res) => {
    const rawStaffId = (req.session as any)?.staffId;
    if (!rawStaffId) { res.status(401).json({ message: "Unauthorized" }); return; }
    const staffId = Number(rawStaffId);

    try {
      const [userRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.staffId, staffId))
        .limit(1);

      if (!userRow) {
        res.status(400).json({ message: "Account setup not completed yet — complete step 1 first." }); return;
      }

      await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userRow.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[staff/onboarding/complete] Error:", err);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  const staffId = (req.session as any)?.staffId;
  if (!userId && !staffId) {
    console.error("[auth] 401", {
      path: req.path,
      method: req.method,
      sessionID: req.sessionID ?? "(none)",
      hasCookie: !!req.headers.cookie,
      sessionKeys: Object.keys((req.session as any) ?? {}),
    });
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
  return;
};

export const isAdminAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Admin access required" });
    return;
  }

  try {
    const { users } = await import("@shared/models/auth");
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.isAdmin) {
      res.status(403).json({ message: "Forbidden — platform admin access required" });
      return;
    }
    next();
    return;
  } catch {
    res.status(500).json({ message: "Auth check failed" });
    return;
  }
};
