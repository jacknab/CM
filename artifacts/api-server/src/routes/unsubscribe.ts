/**
 * routes/unsubscribe.ts — One-click email unsubscribe
 *
 * Public GET /api/unsubscribe?uid=...&pref=...&sig=...
 *
 * The token is an HMAC-SHA256 signature over "userId:prefKey" keyed with
 * SESSION_SECRET so it cannot be forged or reused across preference types.
 */

import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../db";
import { userEmailPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const VALID_PREFS = ["billingReceipts", "lowBalanceAlerts", "dataOperations", "trialReminders"] as const;
type PrefKey = typeof VALID_PREFS[number];

const PREF_LABELS: Record<PrefKey, string> = {
  billingReceipts:  "billing receipt emails",
  lowBalanceAlerts: "low balance alert emails",
  dataOperations:   "data operation emails",
  trialReminders:   "trial reminder emails",
};

const DEFAULT_PREFS = {
  billingReceipts:  true,
  lowBalanceAlerts: true,
  dataOperations:   true,
  trialReminders:   true,
};

function hmacSecret(): string {
  return process.env.SESSION_SECRET || "certxa-email-unsub-secret";
}

function verifyToken(userId: string, pref: string, sig: string): boolean {
  const expected = createHmac("sha256", hmacSecret())
    .update(`${userId}:${pref}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

function htmlPage(title: string, message: string, success: boolean): string {
  const accentColor = success ? "#22c55e" : "#ef4444";
  const icon        = success ? "✓" : "✕";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — Certxa</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:480px;width:100%;margin:32px 16px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="background:${accentColor};padding:28px 40px;">
      <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Certxa</span>
    </div>
    <div style="padding:40px;">
      <p style="font-size:36px;margin:0 0 16px;">${icon}</p>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1e293b;">${title}</h1>
      <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">${message}</p>
      <a href="/mail-settings" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">Manage email preferences</a>
    </div>
  </div>
</body>
</html>`;
}

// GET /api/unsubscribe?uid=...&pref=...&sig=...
router.get("/", async (req: any, res: any) => {
  const uid  = String(req.query.uid  ?? "");
  const pref = String(req.query.pref ?? "");
  const sig  = String(req.query.sig  ?? "");

  if (!uid || !pref || !sig) {
    return res.status(400).send(htmlPage("Invalid link", "This unsubscribe link is missing required parameters.", false));
  }

  if (!(VALID_PREFS as readonly string[]).includes(pref)) {
    return res.status(400).send(htmlPage("Invalid link", "This unsubscribe link references an unknown email category.", false));
  }

  if (!verifyToken(uid, pref, sig)) {
    return res.status(403).send(htmlPage("Invalid link", "This unsubscribe link is invalid or has been tampered with. Please use the original link from your email.", false));
  }

  try {
    const [existing] = await db
      .select({ id: userEmailPreferences.id })
      .from(userEmailPreferences)
      .where(eq(userEmailPreferences.userId, uid))
      .limit(1);

    if (existing) {
      await db
        .update(userEmailPreferences)
        .set({ [pref]: false, updatedAt: new Date() } as any)
        .where(eq(userEmailPreferences.userId, uid));
    } else {
      await db
        .insert(userEmailPreferences)
        .values({ userId: uid, ...DEFAULT_PREFS, [pref]: false } as any);
    }

    const label = PREF_LABELS[pref as PrefKey];
    console.log(`[unsubscribe] userId=${uid} unsubscribed from ${pref}`);
    return res.send(htmlPage(
      "Unsubscribed",
      `You've been unsubscribed from ${label}. You can re-enable these emails at any time from your account settings.`,
      true
    ));
  } catch (err: any) {
    console.error("[unsubscribe] DB error:", err?.message);
    return res.status(500).send(htmlPage("Error", "Something went wrong. Please try again or contact support@certxa.com.", false));
  }
});

export default router;
