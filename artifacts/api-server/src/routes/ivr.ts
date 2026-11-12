/**
 * Certxa's phone menu (owner, 2026-11-12), on the sales line (888) 814-7623 and Account Services (602) 560-9931.
 *
 *   POST /api/webhook/twilio/ivr               open: the menu (1 Sales · 2 Account Services · 3 Technical Support · 9 again);
 *                                              closed: the after-hours message only, then goodbye (no keys)
 *   POST /api/webhook/twilio/ivr/choice        the key pressed → "please hold…" → that line's webhook
 *   POST /api/webhook/twilio/tech-support      Technical Support's own webhook. Until its AI agent exists it passes the
 *                                              call to Marel (Account Services), who opens a tech-support ticket.
 *   GET  /api/webhook/twilio/ivr/audio/:name   the owner's recorded prompts (menu, after-hours, please-hold), cut from
 *                                              /apps/CM/IVR.wav into booking/public/ivr/
 *
 * Open 7 days a week, 10 a.m.–9 p.m. Eastern (owner, 2026-11-12; as the after-hours recording says). Every webhook checks Twilio's signature.
 */
import path from "node:path";
import fs from "node:fs";
import twilio from "twilio";
import type { Express, Request, Response } from "express";

export const IVR_HOURS = { timeZone: "America/New_York", open: 10 * 60, close: 21 * 60 }; // minutes after midnight (owner, 2026-11-12: 10 a.m.–9 p.m., as the recording says)
const PROMPTS = new Set(["menu", "after-hours", "please-hold"]);
const LOG = "[IVR]";

function appUrl(): string { return (process.env.APP_URL || "https://certxa.com").replace(/\/$/, ""); }
function signed(req: Request): boolean {
  const token = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return process.env.NODE_ENV !== "production";
  const sig = String(req.headers["x-twilio-signature"] ?? "");
  return !!sig && twilio.validateRequest(token, sig, `${appUrl()}${req.originalUrl}`, req.body ?? {});
}
const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const twiml = (res: Response, body: string) => res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);
const audio = (name: string) => `${appUrl()}/api/webhook/twilio/ivr/audio/${name}.wav`;

/** Open now? Minutes since midnight in Eastern time against 10:00–21:00, every day. */
export function ivrOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: IVR_HOURS.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const mins = Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
  return mins >= IVR_HOURS.open && mins < IVR_HOURS.close;
}

/** Where each key goes (each line keeps its own webhook; `via=ivr` skips its own intro). */
export function ivrDestination(digit: string): string | null {
  const base = appUrl();
  if (digit === "1") return `${base}/api/webhook/twilio/sales?via=ivr`;
  if (digit === "2") return `${base}/api/webhook/twilio/sales/shavez?via=ivr`;
  if (digit === "3") return `${base}/api/webhook/twilio/tech-support`;
  return null;
}

export function setupIvrRoutes(app: Express): void {
  app.get("/api/webhook/twilio/ivr/audio/:name", (req: Request, res: Response) => {
    const name = String(req.params.name).replace(/\.wav$/, "");
    if (!PROMPTS.has(name)) return res.status(404).end();
    const file = path.resolve(process.cwd(), "dist", "public", "ivr", `${name}.wav`);
    if (!fs.existsSync(file)) return res.status(404).end();
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.sendFile(file);
  });

  app.post("/api/webhook/twilio/ivr", (req: Request, res: Response) => {
    if (!signed(req)) { console.warn(`${LOG} rejected an unsigned request`); return res.status(403).type("text/plain").send("Forbidden"); }
    const callSid = String(req.body?.CallSid ?? "");
    if (!ivrOpen()) {
      // After hours: the recording, then goodbye — no menu, no keys (owner, 2026-11-12).
      console.log(`${LOG} after hours call=${callSid}`);
      return twiml(res, `<Play>${xml(audio("after-hours"))}</Play><Hangup/>`);
    }
    // Nothing pressed after the menu twice: the call goes to Sales rather than being dropped.
    const again = String(req.query?.again ?? "");
    if (again === "2") {
      console.log(`${LOG} no choice call=${callSid} → sales`);
      return twiml(res, `<Play>${xml(audio("please-hold"))}</Play><Redirect method="POST">${xml(ivrDestination("1")!)}</Redirect>`);
    }
    const next = `${appUrl()}/api/webhook/twilio/ivr?again=${again === "1" ? "2" : "1"}`;
    return twiml(res,
      `<Gather input="dtmf" numDigits="1" timeout="6" action="${xml(`${appUrl()}/api/webhook/twilio/ivr/choice`)}" method="POST">`
      + `<Play>${xml(audio("menu"))}</Play></Gather><Redirect method="POST">${xml(next)}</Redirect>`);
  });

  app.post("/api/webhook/twilio/ivr/choice", (req: Request, res: Response) => {
    if (!signed(req)) { console.warn(`${LOG} rejected an unsigned choice`); return res.status(403).type("text/plain").send("Forbidden"); }
    const digit = String(req.body?.Digits ?? "").trim();
    const callSid = String(req.body?.CallSid ?? "");
    const to = ivrDestination(digit);
    console.log(`${LOG} call=${callSid} pressed ${digit || "(nothing)"}${to ? "" : " → menu again"}`);
    // 9, or a key that isn't on the menu: the menu again.
    if (!to) return twiml(res, `<Redirect method="POST">${xml(`${appUrl()}/api/webhook/twilio/ivr?again=1`)}</Redirect>`);
    return twiml(res, `<Play>${xml(audio("please-hold"))}</Play><Redirect method="POST">${xml(to)}</Redirect>`);
  });

  // Technical Support's webhook. Its AI agent comes later (owner, 2026-11-12); until then Marel takes the call.
  app.post("/api/webhook/twilio/tech-support", (req: Request, res: Response) => {
    if (!signed(req)) { console.warn(`${LOG} rejected an unsigned tech-support request`); return res.status(403).type("text/plain").send("Forbidden"); }
    return twiml(res, `<Redirect method="POST">${xml(`${appUrl()}/api/webhook/twilio/sales/shavez?via=ivr&topic=tech-support`)}</Redirect>`);
  });

  console.log(`${LOG} ready — POST /api/webhook/twilio/ivr (open ${IVR_HOURS.open / 60}:00–${IVR_HOURS.close / 60}:00 ${IVR_HOURS.timeZone})`);
}
