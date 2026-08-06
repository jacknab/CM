/**
 * lib/stripe.ts — Stripe SDK singleton (lazy, guards against missing key)
 *
 * Never construct `new Stripe(...)` anywhere else.
 * Always call `getStripe()` or check `isStripeConfigured()` before use.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Returns the Stripe SDK singleton, or null if STRIPE_SECRET_KEY is not set.
 * Use `isStripeConfigured()` to guard before calling this.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set — cannot use Stripe");
  _stripe = new Stripe(secret, { apiVersion: "2026-05-27.dahlia" as any, typescript: true });
  return _stripe;
}

/**
 * Convenience proxy that behaves like the old `stripe` export.
 * Throws if called when Stripe is not configured.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const s = getStripe();
    const val = (s as any)[prop];
    return typeof val === "function" ? val.bind(s) : val;
  },
});

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PUBLISHABLE_KEY;
}

/**
 * Derives the public base URL to use for Stripe return/refresh callbacks.
 *
 * Priority:
 *   1. APP_URL env var (explicit config — always wins)
 *   2. Incoming request host + x-forwarded-proto headers (works automatically
 *      behind any reverse proxy, including the production VPS nginx setup)
 *   3. Fallback to http://localhost:5000 (dev only)
 *
 * Pass `req` whenever you have it so production gets the correct https:// URL
 * even when APP_URL is not explicitly set.
 */
export function getReturnBaseUrl(req?: { get(header: string): string | undefined }): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (req) {
    const host = req.get("host");
    if (host) {
      const proto = req.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:5000";
}
