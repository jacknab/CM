/**
 * Google reCAPTCHA v3 (owner, 2026-11-07; plans/pro-messages.md): an invisible check on website message forms — no
 * checkbox, no puzzle. The page asks Google for a token when the client sends; the server asks Google how human the
 * visit looked (score 0 to 1) and refuses below RECAPTCHA_MIN_SCORE (default 0.5).
 *
 * Keys in /etc/certxa.env: RECAPTCHA_SITE_KEY (public, sent to the page) and RECAPTCHA_SECRET_KEY (server only).
 * Without them the check is off. If Google can't be reached the message is let through: the other spam rules
 * (routes/proMessages.ts) still apply, and a real client's message isn't lost to an outage.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export const recaptchaSiteKey = (): string | null => process.env.RECAPTCHA_SITE_KEY?.trim() || null;
const minScore = () => { const n = Number(process.env.RECAPTCHA_MIN_SCORE); return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.5; };
/** Pages on Certxa's own addresses only (certxa.com and every <slug>.certxa.com). */
const ourHost = (h: string) => h === "certxa.com" || h.endsWith(".certxa.com") || h === "localhost";

export type RecaptchaResult = { ok: true; score: number | null; skipped?: boolean } | { ok: false; reason: string; score?: number };

export async function checkRecaptcha(token: unknown, action: string, ip?: string): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret || !recaptchaSiteKey()) return { ok: true, score: null, skipped: true };
  if (typeof token !== "string" || token.length < 20 || token.length > 4000) return { ok: false, reason: "missing-token" };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    const j: any = await res.json();
    if (!j?.success) return { ok: false, reason: (j?.["error-codes"] ?? []).join(",") || "not-verified" };
    if (j.action && j.action !== action) return { ok: false, reason: `action:${j.action}`, score: j.score };
    if (j.hostname && !ourHost(String(j.hostname))) return { ok: false, reason: `hostname:${j.hostname}`, score: j.score };
    if (typeof j.score === "number" && j.score < minScore()) return { ok: false, reason: "low-score", score: j.score };
    return { ok: true, score: typeof j.score === "number" ? j.score : null };
  } catch (err: any) {
    console.warn("[recaptcha] Google not reached, message allowed:", err?.message ?? err);
    return { ok: true, score: null, skipped: true };
  }
}
