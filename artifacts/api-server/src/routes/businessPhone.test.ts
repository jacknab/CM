import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  query: vi.fn(), pushes: [] as { title: string; body: string }[], open: true, ring: "hours",
  calls: new Map<string, { store_id: number; direction: string; other_number: string; status: string; duration_seconds?: number }>(),
  texts: [] as unknown[],
  card: { customerId: "cus_1", paymentMethodId: "pm_1", brand: "visa", last4: "4242" } as Record<string, string> | null,
  charges: [] as unknown[], refunds: [] as unknown[], removed: [] as string[], line: { phone_number: "+15205550100", twilio_sid: "PN_OLD" },
  plusStores: [9] as number[], plusRing: "hours", noted: [] as unknown[][], convs: [] as unknown[][],
  buyFails: false, hasLine: false, inserted: [] as unknown[][], billing: "active", prepaid: null as string | null,
}));
vi.mock("twilio", async (importOriginal) => {
  const real = (await importOriginal<any>()).default;
  const fake: any = () => ({
    incomingPhoneNumbers: Object.assign((sid: string) => ({ remove: async () => { state.removed.push(sid); } }), {
      create: async (o: { phoneNumber: string }) => { if (state.buyFails) throw new Error("taken"); return { sid: "PN_NEW", phoneNumber: o.phoneNumber }; },
    }),
  });
  Object.assign(fake, real);
  return { default: fake };
});
vi.mock("../lib/stripe", () => ({ isStripeConfigured: () => true, stripe: {
  paymentIntents: { create: async (o: unknown) => { state.charges.push(o); return { id: "pi_1", status: "succeeded" }; }, retrieve: async () => ({ latest_charge: { refunded: false, amount_refunded: 0 } }) },
  refunds: { create: async (o: unknown) => { state.refunds.push(o); return {}; } },
} }));
vi.mock("./soloCredits", () => ({ savedCard: async () => state.card }));
vi.mock("../notifications", () => ({ broadcastNotification: () => undefined }));
// Plus calling: store 9 is a Plus pro with one client, +15205550111 (Jane, client 3).
vi.mock("../lib/plusLine", () => ({
  plusNumber: () => "+19497495557",
  isPlusStore: async (id: number) => state.plusStores.includes(id),
  isStoreClient: async (id: number, phone: string) => id === 9 && phone === "+15205550111",
  routePlusContact: async (phone: string) => (phone === "+15205550111" && state.plusStores.includes(9) ? { storeId: 9, clientId: 3, name: "Jane Smith" } : null),
  noteContact: async (...args: unknown[]) => { state.noted.push(args); },
}));
vi.mock("../db", () => ({ pool: { query: state.query, connect: async () => ({ query: state.query, release: () => undefined }) } }));
vi.mock("../auth", () => ({ isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../lib/sessionStore", () => ({ resolveSessionStoreId: async () => 7 }));
vi.mock("../lib/timezone", () => ({ getStoreTimezone: async () => "UTC" }));
vi.mock("../lib/ownerPush", () => ({ pushOwnerMessage: async (_s: number, m: { title: string; body: string }) => { state.pushes.push(m); } }));

import router from "./businessPhone";

const LINE = "+15205550100";
let server: Server;
let base: string;

async function hook(path: string, form: Record<string, string>, signed = true) {
  const response = await fetch(`${base}/api/webhook/twilio/pro-phone/${path}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(signed ? {} : {}) },
    body: new URLSearchParams(form).toString(),
  });
  return { status: response.status, text: await response.text() };
}

beforeAll(async () => {
  const app = express(); app.use(express.urlencoded({ extended: false })); app.use(express.json()); app.use(router);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  delete process.env.TWILIO_AUTH_TOKEN;  // signature check is skipped outside production without a token
  process.env.NODE_ENV = "test";
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  state.card = { customerId: "cus_1", paymentMethodId: "pm_1", brand: "visa", last4: "4242" };
  state.charges = []; state.refunds = []; state.removed = []; state.buyFails = false; state.hasLine = false; state.inserted = []; state.plusStores = [9]; state.plusRing = "hours"; state.noted = []; state.convs = []; state.billing = "active"; state.prepaid = null; state.line = { phone_number: "+15205550100", twilio_sid: "PN_OLD" };
  state.pushes = []; state.calls.clear(); state.texts = []; state.open = true; state.ring = "hours";
  state.query.mockReset().mockImplementation(async (sql: string, values: any[]) => {
    if (sql.includes("SELECT phone_number, twilio_sid, billing_status FROM business_phone_lines")) return { rows: [state.line] };
    if (sql.includes("DELETE FROM business_phone_prepaid")) { state.prepaid = null; return { rows: [] }; }
    if (sql.includes("INSERT INTO business_phone_prepaid")) { state.prepaid = values[1]; return { rows: [] }; }
    if (sql.includes("FROM business_phone_prepaid WHERE store_id")) return { rows: state.prepaid ? [{ payment_id: state.prepaid }] : [] };
    if (sql.includes("SELECT 1 FROM business_phone_lines WHERE store_id")) return { rows: state.hasLine ? [{}] : [] };
    if (sql.includes("SELECT phone_number FROM business_phone_lines WHERE store_id")) return { rows: state.hasLine ? [{ phone_number: LINE }] : [] };
    if (sql.includes("INSERT INTO business_phone_lines")) { state.inserted.push(values); return { rows: [] }; }
    if (sql.includes("FROM business_phone_lines WHERE phone_number")) return { rows: values[0] === LINE && !(sql.includes("<> 'held'") && state.billing === "held") ? [{ store_id: 7, ring: state.ring, billing_status: state.billing }] : [] };
    if (sql.includes("FROM business_phone_lines WHERE store_id")) return { rows: values[0] === 7 ? [{ phone_number: LINE, ring: state.ring }] : [] };
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("UPDATE business_phone_lines SET phone_number")) { state.line = { phone_number: values[1], twilio_sid: values[2] }; return { rows: [] }; }
    if (sql.includes("FROM store_settings")) return { rows: [{ preferences: JSON.stringify({ plusRing: state.plusRing }) }] };
    if (sql.includes("INSERT INTO sms_conversations")) { state.convs.push(values); return { rows: [] }; }
    if (sql.includes("FROM sms_conversations WHERE twilio_sid") || sql.includes("blocked_at IS NOT NULL") || sql.includes("INSERT INTO sms_opt_outs")) return { rows: [] };
    if (sql.includes("FROM business_phone_blocked")) return { rows: values[1] === "+15205550666" ? [{ "?column?": 1 }] : [] };
    if (sql.includes("FROM business_hours")) return { rows: [{ open_time: "00:00", close_time: state.open ? "23:59" : "00:00", is_closed: !state.open }] };
    if (sql.includes("INSERT INTO business_phone_calls")) { state.calls.set(values[1], { store_id: values[0], direction: sql.includes("'incoming'") ? "incoming" : "outgoing", other_number: values[2], status: "ringing" }); return { rows: [] }; }
    if (sql.includes("SELECT store_id, direction, other_number FROM business_phone_calls")) { const c = state.calls.get(values[0]); return { rows: c ? [c] : [] }; }
    if (sql.includes("UPDATE business_phone_calls SET status = 'missed'")) { state.calls.get(values[0])!.status = "missed"; return { rows: [] }; }
    if (sql.includes("UPDATE business_phone_calls SET status = 'answered'")) { Object.assign(state.calls.get(values[0])!, { status: "answered", duration_seconds: values[1] }); return { rows: [] }; }
    if (sql.includes("UPDATE business_phone_calls SET status = $2")) { state.calls.get(values[0])!.status = values[1]; return { rows: [] }; }
    if (sql.includes("FROM client_phones")) return { rows: values[1].includes("5205550111") ? [{ id: 3, ten: "5205550111", name: "Jane Smith" }] : [] };
    if (sql.includes("INSERT INTO business_phone_texts")) { state.texts.push(values); return { rows: [{ id: state.texts.length }] }; }
    throw new Error(`unexpected SQL: ${sql}`);
  });
});

describe("Business Phone webhooks", () => {
  it("refuses an unsigned webhook in production", async () => {
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    const r = await hook("incoming", { To: LINE, From: "+15205550111", CallSid: "CA1" });
    expect(r.status).toBe(403);
  });

  it("rings the pro's app during business hours", async () => {
    const r = await hook("incoming", { To: LINE, From: "+15205550111", CallSid: "CA1" });
    // The iPhone's incoming-call screen shows the client and their status instead of the bare number.
    expect(r.text).toContain('<Parameter name="DisplayName" value="Client: Jane Smith · Inactive"/>');
    expect(r.text).toContain("<Identity>store-7</Identity>");
    expect(state.calls.get("CA1")?.status).toBe("ringing");
  });

  it("makes a missed call after hours, with a push naming the client", async () => {
    state.open = false;
    const r = await hook("incoming", { To: LINE, From: "+15205550111", CallSid: "CA2" });
    expect(r.text).not.toContain("<Dial");
    expect(state.calls.get("CA2")?.status).toBe("missed");
    expect(state.pushes[0]).toMatchObject({ title: "Missed call", body: "Jane Smith called your business number." });
  });

  it("gives a blocked number a busy signal, with no call kept and no push", async () => {
    const r = await hook("incoming", { To: LINE, From: "+15205550666", CallSid: "CA9" });
    expect(r.text).toContain('<Reject reason="busy"/>');
    expect(state.calls.has("CA9")).toBe(false);
    expect(state.pushes).toHaveLength(0);
  });

  it("rings after hours when set to always", async () => {
    state.open = false; state.ring = "always";
    expect((await hook("incoming", { To: LINE, From: "+15205550111", CallSid: "CA3" })).text).toContain("<Identity>store-7</Identity>");
  });

  it("turns an unanswered ring into a missed call, and an answered one into its length", async () => {
    await hook("incoming", { To: LINE, From: "+15205550199", CallSid: "CA4" });
    await hook("dial-done", { CallSid: "CA4", DialCallStatus: "no-answer", CallStatus: "in-progress" });
    expect(state.calls.get("CA4")?.status).toBe("missed");
    expect(state.pushes[0].body).toBe("(520) 555-0199 called your business number.");
    await hook("incoming", { To: LINE, From: "+15205550199", CallSid: "CA5" });
    await hook("dial-done", { CallSid: "CA5", DialCallStatus: "completed", DialCallDuration: "42" });
    expect(state.calls.get("CA5")).toMatchObject({ status: "answered", duration_seconds: 42 });
  });

  it("always calls out from the business number, whatever the app sends", async () => {
    const r = await hook("outgoing", { From: "client:store-7", To: "(520) 555-0111", CallSid: "CA6", callerId: "+19999999999" });
    expect(r.text).toContain(`callerId="${LINE}"`);
    expect(r.text).toContain("<Number>+15205550111</Number>");
    expect(r.text).not.toContain("9999999999");
  });

  it("won't call out for a phone that isn't a business's", async () => {
    const r = await hook("outgoing", { From: "client:store-8", To: "5205550111", CallSid: "CA7" });
    expect(r.text).not.toContain("<Dial");
  });

  it("keeps a text to the business number and pushes it, without replying", async () => {
    const r = await hook("sms", { To: LINE, From: "+15205550111", MessageSid: "SM1", Body: "Running 5 min late", NumMedia: "0" });
    expect(r.text).not.toContain("<Message");
    expect(state.texts).toHaveLength(1);
    expect(state.pushes[0]).toMatchObject({ title: "Text from Jane Smith", body: "Running 5 min late" });
  });
});

async function change(phoneNumber: string, idempotencyKey = "key-12345678") {
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  const response = await fetch(`${base}/api/pro/phone/change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber, idempotencyKey }) });
  return { status: response.status, body: await response.json() as any };
}

describe("Changing the business number", () => {
  it("charges $5, buys and wires the new number, then releases the old one", async () => {
    const r = await change("+15205550200");
    expect(r).toMatchObject({ status: 200, body: { phoneNumber: "+15205550200" } });
    expect(state.charges).toEqual([expect.objectContaining({ amount: 500, customer: "cus_1", payment_method: "pm_1", off_session: true })]);
    expect(state.line).toEqual({ phone_number: "+15205550200", twilio_sid: "PN_NEW" });
    expect(state.removed).toEqual(["PN_OLD"]);
    expect(state.refunds).toHaveLength(0);
  });

  it("refunds and keeps the old number when the new one is taken", async () => {
    state.buyFails = true;
    const r = await change("+15205550200");
    expect(r.status).toBe(409);
    expect(state.refunds).toEqual([{ payment_intent: "pi_1" }]);
    expect(state.line.twilio_sid).toBe("PN_OLD");
    expect(state.removed).toHaveLength(0);
  });

  it("asks for a card when there is none, without charging or buying", async () => {
    state.card = null;
    const r = await change("+15205550200");
    expect(r).toMatchObject({ status: 409, body: { needsCard: true } });
    expect(state.charges).toHaveLength(0);
    expect(state.line.twilio_sid).toBe("PN_OLD");
  });

  it("does nothing again when the change already went through", async () => {
    const r = await change("+15205550100");
    expect(r.status).toBe(200);
    expect(state.charges).toHaveLength(0);
    expect(state.removed).toHaveLength(0);
  });
});

async function post(path: string, body: unknown) {
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}

describe("Getting a number ($10/month, paid before the numbers are shown)", () => {
  it("charges the first $10 once, and paying again doesn't charge again", async () => {
    const r = await post("/api/pro/phone/subscribe", { idempotencyKey: "sub-12345678" });
    expect(r).toMatchObject({ status: 200, body: { prepaid: true } });
    expect(state.charges).toEqual([expect.objectContaining({ amount: 1000, off_session: true })]);
    expect(state.prepaid).toBe("pi_1");
    await post("/api/pro/phone/subscribe", { idempotencyKey: "sub-87654321" });
    expect(state.charges).toHaveLength(1);
  });

  it("doesn't charge a business that already has a number", async () => {
    state.hasLine = true;
    const r = await post("/api/pro/phone/subscribe", { idempotencyKey: "sub-12345678" });
    expect(r.status).toBe(409);
    expect(state.charges).toHaveLength(0);
  });

  it("asks for a card without charging", async () => {
    state.card = null;
    const r = await post("/api/pro/phone/subscribe", { idempotencyKey: "sub-12345678" });
    expect(r).toMatchObject({ status: 402, body: { needsCard: true } });
    expect(state.prepaid).toBeNull();
  });

  it("won't show numbers or buy one before the month is paid", async () => {
    const lines = state.query.getMockImplementation()!;
    state.query.mockImplementation(async (sql: string, values: any[]) => (sql.includes("FROM business_phone_lines WHERE store_id") && !sql.includes("SELECT 1") ? { rows: [] } : lines(sql, values)));
    const search = await fetch(`${base}/api/pro/phone/available`).then(async (x) => ({ status: x.status, body: await x.json() as any }));
    expect(search).toMatchObject({ status: 402, body: { needsPayment: true } });
    const r = await post("/api/pro/phone/claim", { phoneNumber: "+15205550300", idempotencyKey: "claim-12345678" });
    expect(r).toMatchObject({ status: 402, body: { needsPayment: true } });
    expect(state.charges).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("buys the chosen number with the paid month, without charging again", async () => {
    state.prepaid = "pi_paid";
    const r = await post("/api/pro/phone/claim", { phoneNumber: "+15205550300", idempotencyKey: "claim-12345678" });
    expect(r.status).toBe(200);
    expect(state.charges).toHaveLength(0);
    expect(state.inserted[0]).toEqual([7, "+15205550300", "PN_NEW", "31", "pi_paid"]);
    expect(state.prepaid).toBeNull();
  });

  it("keeps the paid month when the chosen number is taken", async () => {
    state.prepaid = "pi_paid"; state.buyFails = true;
    const r = await post("/api/pro/phone/claim", { phoneNumber: "+15205550300", idempotencyKey: "claim-12345678" });
    expect(r.status).toBe(409);
    expect(state.refunds).toHaveLength(0);
    expect(state.prepaid).toBe("pi_paid");
  });

  it("tells an older app to update instead of giving a free number", async () => {
    const r = await post("/api/pro/phone/claim", { phoneNumber: "+15205550300" });
    expect(r.status).toBe(400);
    expect(state.charges).toHaveLength(0);
  });
});

describe("A held (unpaid) number", () => {
  it("doesn't ring, isn't kept, and its texts are ignored", async () => {
    state.billing = "held";
    delete process.env.TWILIO_AUTH_TOKEN;
    const call = await hook("incoming", { To: LINE, From: "+15205550111", CallSid: "CA20" });
    expect(call.text).not.toContain("<Dial");
    expect(state.calls.has("CA20")).toBe(false);
    await hook("sms", { To: LINE, From: "+15205550111", MessageSid: "SM20", Body: "hi", NumMedia: "0" });
    expect(state.texts).toHaveLength(0);
    expect(state.pushes).toHaveLength(0);
  });
});

describe("Plus calling and texting on the shared Plus number", () => {
  it("rings the Plus pro the caller is a client of", async () => {
    const r = await hook("plus-voice", { To: "+19497495557", From: "+15205550111", CallSid: "CA30" });
    expect(r.text).toContain('value="Client: Jane Smith · Inactive"');
    expect(r.text).toContain("<Identity>store-9</Identity>");
    expect(state.calls.get("CA30")).toMatchObject({ store_id: 9, direction: "incoming" });
  });

  it("outside business hours: a missed call, unless the Plus calling rule is Any time", async () => {
    state.open = false;
    const closed = await hook("plus-voice", { To: "+19497495557", From: "+15205550111", CallSid: "CA40" });
    expect(closed.text).not.toContain("<Dial");
    expect(state.calls.get("CA40")?.status).toBe("missed");
    state.plusRing = "always";
    const anyTime = await hook("plus-voice", { To: "+19497495557", From: "+15205550111", CallSid: "CA41" });
    expect(anyTime.text).toContain("<Identity>store-9</Identity>");
  });

  it("gives a busy signal to a caller who isn't a client of an active Plus pro", async () => {
    const r = await hook("plus-voice", { To: "+19497495557", From: "+15205550999", CallSid: "CA31" });
    expect(r.text).toContain('<Reject reason="busy"/>');
    expect(state.calls.has("CA31")).toBe(false);
  });

  it("gives a busy signal when the client's pro is no longer on Plus", async () => {
    state.plusStores = [];
    const r = await hook("plus-voice", { To: "+19497495557", From: "+15205550111", CallSid: "CA32" });
    expect(r.text).toContain('<Reject reason="busy"/>');
  });

  it("a missed Plus call opens the client's profile from the push", async () => {
    await hook("plus-voice", { To: "+19497495557", From: "+15205550111", CallSid: "CA33" });
    await hook("dial-done", { CallSid: "CA33", To: "+19497495557", DialCallStatus: "no-answer", CallStatus: "in-progress" });
    expect(state.pushes[0]).toMatchObject({ title: "Missed call", body: "Jane Smith called you." });
  });

  it("a Plus pro calls only their own clients, from the Plus number", async () => {
    const ok = await hook("outgoing", { From: "client:store-9", To: "5205550111", CallSid: "CA34" });
    expect(ok.text).toContain('callerId="+19497495557"');
    const no = await hook("outgoing", { From: "client:store-9", To: "5205550123", CallSid: "CA35" });
    expect(no.text).not.toContain("<Dial");
  });

  it("a pro on neither Plus nor Business Phone can't call out", async () => {
    state.plusStores = [];
    const r = await hook("outgoing", { From: "client:store-9", To: "5205550111", CallSid: "CA36" });
    expect(r.text).not.toContain("<Dial");
  });

  it("a text from a Plus client goes into the pro's Messages, with a push", async () => {
    await hook("plus-sms", { To: "+19497495557", From: "+15205550111", MessageSid: "SM30", Body: "Can I come at 3?" });
    expect(state.convs[0]).toEqual([9, "+15205550111", "Jane Smith", "Can I come at 3?", "SM30"]);
    expect(state.pushes[0]).toMatchObject({ title: "Text from Jane Smith" });
  });

  it("a text from someone who isn't a Plus client is dropped", async () => {
    await hook("plus-sms", { To: "+19497495557", From: "+15205550999", MessageSid: "SM31", Body: "hello" });
    expect(state.convs).toHaveLength(0);
  });
});
