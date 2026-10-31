/**
 * One-time passes for the Twilio audio WebSockets (owner, 2026-10-31).
 *
 * The audio connections (/media-stream for Autumn, /support-agent-stream for the support line) each open a paid
 * OpenAI voice session. Before this, anyone could connect to them directly — no phone call — and spend credits.
 * Now the Twilio webhook, which checks Twilio's signature, puts a pass in the stream address
 * (wss://…/media-stream/<pass>; Twilio forbids query strings, a path is fine) and the WebSocket upgrade is refused
 * without a valid one, before any OpenAI session opens.
 *
 * A pass is an HMAC over kind · storeId · expiry · nonce (works in every pm2 worker), lives 2 minutes, and is used once.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type StreamKind = "autumn" | "support";

const TTL_MS = 2 * 60 * 1000;
const used = new Map<string, number>(); // nonce → expiry, so a pass works once

function secret(): string {
  const s = process.env.STREAM_PASS_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error("STREAM_PASS_SECRET or SESSION_SECRET must be configured");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** A pass for one call's audio connection. `storeId` is 0 for the support line. */
export function issueStreamPass(kind: StreamKind, storeId: number): string {
  const body = `${kind}.${storeId}.${Date.now() + TTL_MS}.${randomBytes(9).toString("base64url")}`;
  return `${body}.${sign(body)}`;
}

/** The pass's storeId when it is valid, unexpired, of this kind and not used yet; otherwise null. Uses it up. */
export function redeemStreamPass(kind: StreamKind, pass: string | null | undefined): number | null {
  if (!pass) return null;
  const parts = pass.split(".");
  if (parts.length !== 5) return null;
  const [k, store, exp, nonce, mac] = parts;
  const body = `${k}.${store}.${exp}.${nonce}`;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = Buffer.from(sign(body));
    given = Buffer.from(mac);
  } catch {
    return null;
  }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (k !== kind) return null;
  const expiry = Number(exp);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;
  const now = Date.now();
  for (const [n, e] of used) if (e < now) used.delete(n);
  if (used.has(nonce)) return null;
  used.set(nonce, expiry);
  const storeId = Number(store);
  return Number.isInteger(storeId) && storeId >= 0 ? storeId : null;
}

/** The pass in an upgrade path like "/media-stream/<pass>". */
export function passFromPath(pathname: string, base: string): string | null {
  if (!pathname.startsWith(base + "/")) return null;
  const rest = pathname.slice(base.length + 1);
  return rest && !rest.includes("/") ? decodeURIComponent(rest) : null;
}
