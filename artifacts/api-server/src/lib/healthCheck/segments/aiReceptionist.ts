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
  if (settingsRes.rows[0]?.preferences) {
    try { prefs = JSON.parse(settingsRes.rows[0].preferences); } catch {}
  }

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

  // Phone number provisioned
  const phoneNumber = prefs.twilioPhoneNumber as string | undefined;
  if (!phoneNumber) {
    checks.push(fail("ai_phone", "Phone number provisioned", "AI Receptionist is enabled but no Twilio phone number is provisioned.", "Support Tools → AI Receptionist → Provision Number"));
  } else {
    checks.push(pass("ai_phone", "Phone number provisioned", `Phone: ${phoneNumber}`));
  }

  // Twilio webhook format
  const webhookUrl = prefs.twilioWebhookUrl as string | undefined;
  if (!webhookUrl) {
    checks.push(fail("ai_webhook", "Twilio voice webhook set", "No Twilio voice webhook URL found in store settings.", "Support Tools → AI Receptionist → Set Webhook"));
  } else if (!webhookUrl.includes("/api/webhook/twilio/")) {
    checks.push(warn("ai_webhook", "Twilio voice webhook set", `Webhook URL format looks unexpected: ${webhookUrl}`, "Support Tools → AI Receptionist → Verify Webhook"));
  } else {
    checks.push(pass("ai_webhook", "Twilio voice webhook set", `Webhook: ${webhookUrl}`));
  }

  // OpenAI key (platform-level)
  const openaiKeySet = !!(process.env.OPENAI_API_KEY);
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
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_call FROM ai_call_logs WHERE store_id = $1`,
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
