#!/usr/bin/env node
/**
 * provision-twilio-webhook.mjs
 *
 * Configures the Certxa Twilio phone number to send inbound SMS webhooks to:
 *   https://certxa.com/api/webhooks/twilio/incoming
 *
 * Usage:
 *   node scripts/provision-twilio-webhook.mjs
 *
 * No dependencies — uses the Twilio REST API directly via fetch (Node 18+).
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER   (E.164 format, e.g. +15551234567)
 */

const INBOUND_WEBHOOK_URL = "https://certxa.com/api/webhooks/twilio/incoming";

// Load env vars from /etc/certxa.env if present
import { readFileSync } from "fs";
try {
  const envFile = readFileSync("/etc/certxa.env", "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // File not present — fall through to process.env only
}

const accountSid  = process.env.TWILIO_ACCOUNT_SID;
const authToken   = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !phoneNumber) {
  console.error(
    "❌  Missing required env vars.\n" +
    "    Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER before running."
  );
  process.exit(1);
}

const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
const baseUrl   = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

async function twilioGet(path) {
  // Insert .json before any query string so it doesn't end up appended to params
  const [resourcePath, qs] = path.split("?");
  const url = `${baseUrl}${resourcePath}.json${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function twilioPost(path, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${baseUrl}${path}.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function run() {
  console.log(`🔍  Looking up phone number ${phoneNumber} in account ${accountSid} …`);

  // Search for the number in this account
  const encoded = encodeURIComponent(phoneNumber);
  const data = await twilioGet(`/IncomingPhoneNumbers?PhoneNumber=${encoded}`);
  const numbers = data.incoming_phone_numbers ?? [];

  if (numbers.length === 0) {
    console.error(
      `❌  Phone number ${phoneNumber} not found in this Twilio account.\n` +
      `    Check that TWILIO_PHONE_NUMBER matches a number you own.`
    );
    process.exit(1);
  }

  const number = numbers[0];
  console.log(`✅  Found: ${number.friendly_name} (SID: ${number.sid})`);
  console.log(`    Current SMS URL:    ${number.sms_url || "(none)"}`);
  console.log(`    Current SMS Method: ${number.sms_method || "(none)"}`);

  if (number.sms_url === INBOUND_WEBHOOK_URL && number.sms_method === "POST") {
    console.log("\n✔   Already configured correctly — nothing to do.");
    return;
  }

  console.log(`\n🔧  Updating SMS webhook → ${INBOUND_WEBHOOK_URL} [POST] …`);

  const updated = await twilioPost(`/IncomingPhoneNumbers/${number.sid}`, {
    SmsUrl:    INBOUND_WEBHOOK_URL,
    SmsMethod: "POST",
  });

  console.log(`\n🎉  Done!`);
  console.log(`    SMS URL:    ${updated.sms_url}`);
  console.log(`    SMS Method: ${updated.sms_method}`);
}

run().catch((err) => {
  console.error("❌  Error:", err.message ?? err);
  process.exit(1);
});
