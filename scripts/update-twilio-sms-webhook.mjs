#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    phone: "",
    appUrl: "",
    webhookPath: "/api/webhooks/twilio/incoming",
    envFile: "/etc/certxa.env",
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--phone") out.phone = String(argv[++i] ?? "");
    else if (a === "--app-url") out.appUrl = String(argv[++i] ?? "");
    else if (a === "--webhook-path") out.webhookPath = String(argv[++i] ?? "");
    else if (a === "--env-file") out.envFile = String(argv[++i] ?? "");
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return out;
}

function printUsage() {
  console.log(`\nUpdate Twilio inbound SMS webhooks for a phone number (and its Messaging Service, if attached).\n\nUsage:\n  node ./scripts/update-twilio-sms-webhook.mjs --phone +18888147623 [--app-url https://certxa.com] [--dry-run]\n\nOptions:\n  --phone         E.164 number to update (required), e.g. +18888147623\n  --app-url       Base app URL. Defaults to APP_URL from env/env-file.\n  --webhook-path  Defaults to /api/webhooks/twilio/incoming\n  --env-file      Defaults to /etc/certxa.env\n  --dry-run       Show what would change without writing to Twilio\n`);
}

function normalizePhone(phone) {
  const trimmed = String(phone || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  return `+${trimmed.replace(/\D/g, "")}`;
}

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const raw = fs.readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const exportStripped = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;

    const eq = exportStripped.indexOf("=");
    if (eq <= 0) continue;

    const key = exportStripped.slice(0, eq).trim();
    let val = exportStripped.slice(eq + 1).trim();

    if (
      (val.startsWith("\"") && val.endsWith("\"")) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    process.env[key] = val;
  }
}

function ensureHttpsBase(url) {
  const base = String(url || "").trim().replace(/\/$/, "");
  if (!base.startsWith("https://") && !base.startsWith("http://")) {
    throw new Error(`APP_URL must start with http:// or https://. Got: ${base || "(empty)"}`);
  }
  return base;
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnvFile(args.envFile);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN (env or env-file)");
  }

  const phone = normalizePhone(args.phone || process.env.TWILIO_PHONE_NUMBER || "");
  if (!phone) {
    throw new Error("Missing --phone (or TWILIO_PHONE_NUMBER)");
  }

  const appUrl = ensureHttpsBase(args.appUrl || process.env.APP_URL || "");
  const webhookPath = String(args.webhookPath || "/api/webhooks/twilio/incoming").startsWith("/")
    ? String(args.webhookPath || "/api/webhooks/twilio/incoming")
    : `/${String(args.webhookPath || "api/webhooks/twilio/incoming")}`;
  const webhookUrl = `${appUrl}${webhookPath}`;

  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  const twilioGet = async (url) => {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Twilio GET failed (${resp.status}): ${body || url}`);
    }
    return resp.json();
  };

  const twilioPostForm = async (url, params) => {
    const body = new URLSearchParams(params);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Twilio POST failed (${resp.status}): ${text || url}`);
    }
    return resp.json();
  };

  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}&PageSize=20`;
  const data = await twilioGet(listUrl);
  const numbers = Array.isArray(data?.incoming_phone_numbers) ? data.incoming_phone_numbers : [];
  if (!numbers.length) {
    throw new Error(`Phone number not found in Twilio account: ${phone}`);
  }

  const number = numbers[0];
  const numberSid = number.sid;
  const foundPhone = number.phoneNumber ?? number.phone_number ?? "(unknown)";
  const messagingServiceSid = number.messagingServiceSid ?? number.messaging_service_sid ?? "";

  console.log(`Found Twilio number: ${foundPhone} (sid=${numberSid})`);
  console.log(`Target inbound SMS webhook: ${webhookUrl}`);

  if (args.dryRun) {
    console.log("[dry-run] Would update IncomingPhoneNumber.smsUrl + smsMethod");
  } else {
    const updateNumberUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`;
    await twilioPostForm(updateNumberUrl, {
      SmsUrl: webhookUrl,
      SmsMethod: "POST",
    });
    console.log("Updated phone-number-level SMS webhook.");
  }

  if (messagingServiceSid) {
    console.log(`Number is attached to Messaging Service: ${messagingServiceSid}`);
    if (args.dryRun) {
      console.log("[dry-run] Would update Messaging Service inboundRequestUrl/inboundMethod/fallbackUrl/fallbackMethod");
    } else {
      const updateServiceUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}.json`;
      await twilioPostForm(updateServiceUrl, {
        InboundRequestUrl: webhookUrl,
        InboundMethod: "POST",
        FallbackUrl: webhookUrl,
        FallbackMethod: "POST",
      });
      console.log("Updated Messaging Service inbound webhook + fallback.");
    }
  } else {
    console.log("Number is not attached to a Messaging Service.");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
