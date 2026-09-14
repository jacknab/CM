/**
 * twilioLookup.ts
 *
 * Twilio Lookup v2 — Line Type Intelligence add-on. One paid API call per
 * phone number (~$0.005-0.01) that tells us definitively whether a number is
 * mobile, landline, or VoIP, instead of guessing from the area code.
 *
 * Every lookup runs a free plain Lookup request first to confirm the number
 * is actually valid, and only pays for the line-type add-on when it is — so
 * a typo'd or fake number never costs anything beyond the free check.
 *
 * Never throws — returns null on missing config or a failed/errored call so
 * callers can fall back to the free offline heuristic in phoneTypeDetector.ts.
 */

import Twilio from "twilio";
import type { PhoneType } from "./phoneTypeDetector";

function getTwilioClient(): ReturnType<typeof Twilio> | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return Twilio(accountSid, authToken);
}

export interface TwilioLookupResult {
  phoneType: PhoneType;
  carrierName: string | null;
}

// Twilio's line_type_intelligence.type values → our internal PhoneType.
// landline-adjacent non-mobile categories (premium/shared-cost/UAN/pager) are
// treated as landline since none of them can receive a two-way SMS.
const TYPE_MAP: Record<string, PhoneType> = {
  mobile: "mobile",
  landline: "landline",
  fixedVoip: "voip",
  nonFixedVoip: "voip",
  personal: "voip",
  tollFree: "voip",
  voicemail: "voip",
  premium: "landline",
  sharedCost: "landline",
  uan: "landline",
  pager: "landline",
};

/**
 * Plain Twilio Lookup v2 request with no add-on `fields` — this base check
 * (does the number parse as a real, validly-formatted number at all) is
 * free. Only numbers that pass it are worth paying for the line-type add-on,
 * so this always runs first and short-circuits the paid call for garbage
 * input (typos, fake numbers, etc).
 *
 * Returns true/false when Twilio gives a definitive answer, or null when the
 * call itself fails (network/auth issue) — callers should NOT treat null as
 * "invalid", since that would incorrectly block a real number over an infra
 * hiccup; it just means we couldn't get a free answer this time.
 */
async function isValidPhoneNumber(client: ReturnType<typeof Twilio>, e164: string): Promise<boolean | null> {
  try {
    const result = await client.lookups.v2.phoneNumbers(e164).fetch();
    return (result as any).valid ?? null;
  } catch (err: any) {
    // Twilio 404s a number it can't parse at all (e.g. too short/garbled) —
    // that's a definitive "invalid", not an infra failure.
    if (err?.status === 404) return false;
    console.warn(`[twilioLookup] Free validation check failed for ${e164}: ${err.message ?? err}`);
    return null;
  }
}

/**
 * Look up a single E.164 number's line type. Runs the free validation check
 * first and skips the paid line_type_intelligence add-on entirely when
 * Twilio confirms the number is invalid — no point paying to classify a
 * number that was never going to be reachable anyway.
 *
 * Returns null when Twilio isn't configured or a call errors — the caller
 * should fall back to detectPhoneType() in that case. A confirmed-invalid
 * number returns phoneType "unknown" (not null) so it's recorded as checked
 * and never gets re-validated on every backfill run.
 */
export async function lookupPhoneType(e164: string): Promise<TwilioLookupResult | null> {
  const client = getTwilioClient();
  if (!client) return null;

  const valid = await isValidPhoneNumber(client, e164);
  if (valid === false) {
    console.log(`[twilioLookup] Skipping paid line-type lookup — Twilio reports ${e164} as invalid`);
    return { phoneType: "unknown", carrierName: null };
  }

  try {
    const result = await client.lookups.v2
      .phoneNumbers(e164)
      .fetch({ fields: "line_type_intelligence" });

    const lti = (result as any).lineTypeIntelligence;
    const type = lti?.type as string | undefined;
    if (!type) return null;

    return {
      phoneType: TYPE_MAP[type] ?? "unknown",
      carrierName: lti.carrierName ?? null,
    };
  } catch (err: any) {
    console.warn(`[twilioLookup] Lookup failed for ${e164}: ${err.message ?? err}`);
    return null;
  }
}
