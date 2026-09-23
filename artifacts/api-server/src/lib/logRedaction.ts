/**
 * Keeps live secrets and PII out of the request logger (pm2 logs aren't rotated by this app, and anyone/anything that can
 * read them — backups, log shippers, support pastes — would otherwise see them in plain text). Two layers:
 *   NEVER_LOG_BODY_PREFIXES — endpoints whose response is skipped entirely (Stripe connection tokens / client secrets,
 *                             login and session data).
 *   redactForLog            — for everything else, replaces the VALUE of any key that looks sensitive, however deep it's
 *                             nested, so a field named e.g. "phone" or "clientSecret" never reaches the log.
 */
export const NEVER_LOG_BODY_PREFIXES = ["/api/payments", "/api/auth"];

export const REDACT_KEYS = /^(secret|clientsecret|client_secret|token|password|pin|apikey|api_key|authorization|phone|displayphone|phonenumber|phone_number|email|ssn|cvc|cvv|cardnumber|card_number|accountnumber|account_number)$/i;

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) && v != null ? "[redacted]" : redactForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Skip logging this response body at all (it's an endpoint that hands back short-lived secrets or session/login data). */
export const shouldSkipBodyLog = (path: string): boolean => NEVER_LOG_BODY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

/** The `:: {...}` suffix for a log line, or "" for nothing to append. Caps length so one giant payload can't flood the log. */
export function logBodySuffix(path: string, body: unknown): string {
  if (body == null) return shouldSkipBodyLog(path) ? " :: [body not logged]" : "";
  if (shouldSkipBodyLog(path)) return " :: [body not logged]";
  const redacted = JSON.stringify(redactForLog(body));
  return ` :: ${redacted.length > 500 ? redacted.slice(0, 497) + "…" : redacted}`;
}
