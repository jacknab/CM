import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";

export async function aiReceptionist(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const settingsRes = await pool.query(
    `SELECT preferences FROM store_settings WHERE store_id = $1`,
    [accountId],
  );
  let prefs: Record<string, unknown> = {};
  const rawPrefs = settingsRes.rows[0]?.preferences;
  if (rawPrefs && typeof rawPrefs === "object") prefs = rawPrefs;
  else if (typeof rawPrefs === "string") { try { prefs = JSON.parse(rawPrefs); } catch {} }

  const enabled = !!prefs.aiReceptionistEnabled;

  // If AI Receptionist is not enabled, surface as informational
  if (!enabled) {
    checks.push(pass("ai_enabled", "AI Receptionist enabled", "AI Receptionist is not enabled on this account (informational)."));
    return {
      segmentId: "ai_receptionist",
      label: "AI Receptionist",
      status: "pass",
      runAt: new Date().toISOString(),
      checks,
    };
  }

  checks.push(pass("ai_enabled", "AI Receptionist enabled", "AI Receptionist is enabled."));

  // Phone number provisioned — saved as aiReceptionistPhone when the number is bought (routes/aiReceptionist.ts).
  const phoneNumber = (prefs.aiReceptionistPhone ?? prefs.twilioPhoneNumber) as string | undefined;
  if (!phoneNumber) {
    checks.push(fail("ai_phone", "Phone number provisioned", "AI Receptionist is enabled but no Twilio phone number is provisioned.", "Support Tools → AI Receptionist → Provision Number"));
  } else {
    checks.push(pass("ai_phone", "Phone number provisioned", `Phone: ${phoneNumber}`));
  }

  // Twilio voice webhook — the URL is set on the number at Twilio and not saved here, so ask Twilio (a free,
  // read-only lookup) and compare with the URL the site sets: APP_URL/api/webhook/twilio/<store id>.
  const expectedWebhook = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/webhook/twilio/${accountId}`;
  if (phoneNumber) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      checks.push(warn("ai_webhook", "Twilio voice webhook set", "Twilio is not configured on this server, so the webhook could not be checked."));
    } else {
      try {
        const twilio = (await import("twilio")).default;
        const [number] = await twilio(accountSid, authToken).incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
        if (!number) {
          checks.push(fail("ai_webhook", "Twilio voice webhook set", `${phoneNumber} is not in Certxa's Twilio account.`, "Support Tools → AI Receptionist → Provision Number"));
        } else if (number.voiceUrl !== expectedWebhook) {
          checks.push(fail("ai_webhook", "Twilio voice webhook set", `Calls to ${phoneNumber} go to ${number.voiceUrl || "nowhere"} instead of ${expectedWebhook}.`, "Support Tools → AI Receptionist → Set Webhook"));
        } else {
          checks.push(pass("ai_webhook", "Twilio voice webhook set", `Webhook: ${number.voiceUrl}`));
        }
      } catch (err: any) {
        checks.push(warn("ai_webhook", "Twilio voice webhook set", `Could not ask Twilio about ${phoneNumber}: ${err?.message ?? err}`));
      }
    }
  }

  // OpenAI key (platform-level)
  const openaiKeySet = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  if (!openaiKeySet) {
    checks.push(fail("openai_key", "OpenAI API key configured", "OPENAI_API_KEY is not set at the platform level — AI Receptionist calls will fail.", "Platform Configuration → OpenAI"));
  } else {
    checks.push(pass("openai_key", "OpenAI API key configured", "OpenAI API key is present."));
  }

  // Call stats
  let callCount = 0;
  let lastCall: string | null = null;
  try {
    const callRes = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(started_at) AS last_call FROM ai_call_log WHERE store_id = $1`,
      [accountId],
    );
    callCount = Number(callRes.rows[0]?.cnt ?? 0);
    lastCall = callRes.rows[0]?.last_call ?? null;
  } catch {
    // Table may not exist in all environments
  }

  if (callCount === 0) {
    checks.push(warn("ai_call_history", "AI Receptionist has received calls", "No call records found — the AI Receptionist has not received any calls yet.", undefined, false));
  } else {
    const lastStr = lastCall ? new Date(lastCall).toLocaleDateString() : "unknown";
    checks.push(pass("ai_call_history", "AI Receptionist has received calls", `${callCount} total call${callCount !== 1 ? "s" : ""}, last: ${lastStr}`, false));
  }

  return {
    segmentId: "ai_receptionist",
    label: "AI Receptionist",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
  };
}
