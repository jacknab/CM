import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  orders: new Map<string, any>(), emails: [] as string[], pushes: [] as string[], gift: [] as unknown[][], credits: [] as unknown[][],
  created: 0, intents: [] as any[], prefs: JSON.stringify({ siteGiftCards: true }), left: 3, used: new Set<number>(), apptCustomer: 5, connected: true as boolean,
}));
const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ pool: { query, connect: async () => ({ query, release: () => undefined }) } }));
vi.mock("../auth", () => ({ isAuthenticated: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../lib/sessionStore", () => ({ resolveSessionStoreId: async () => 7 }));
vi.mock("../lib/stripe", () => ({ isStripeConfigured: () => true, getStripe: () => ({ paymentIntents: {
  create: async (o: any) => { state.intents.push(o); return { id: "pi_new", client_secret: "secret" }; },
  retrieve: async () => ({ status: "succeeded", metadata: { type: "site_order", certxa_store_id: "7" } }),
} }) }));
vi.mock("../lib/stripeConnect", () => ({ PLATFORM_CONNECTION_FEE_CENTS: 60 }));
vi.mock("../lib/ownerPush", () => ({ pushOwnerMessage: async (_s: number, m: { title: string }) => { state.pushes.push(m.title); } }));
vi.mock("../lib/storePreferences", () => ({ mutateStorePreferences: async () => ({}) }));
vi.mock("../mail", () => ({ sendEmail: async (_s: number, to: string) => { state.emails.push(to); return true; } }));
vi.mock("../storage", () => ({ storage: { createCustomer: async () => { state.created++; return { id: 99 }; } } }));

import router, { fulfilSiteOrder } from "./siteShop";

let server: Server; let base: string;
const post = async (path: string, body: unknown) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };

beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router);
  server = await new Promise((resolve) => { const l = app.listen(0, "127.0.0.1", () => resolve(l)); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => {
  state.orders.clear(); state.emails = []; state.pushes = []; state.gift = []; state.credits = []; state.created = 0; state.intents = [];
  state.prefs = JSON.stringify({ siteGiftCards: true }); state.left = 3; state.used.clear(); state.connected = true;
  query.mockReset().mockImplementation(async (sql: string, v: any[] = []) => {
    if (sql.includes("FROM locations l LEFT JOIN store_settings")) return { rows: [{ id: 7, name: "Toby's", preferences: state.prefs }] };
    if (sql.includes("FROM store_payment_accounts")) return { rows: state.connected ? [{ provider_account_id: "acct_1" }] : [] };
    if (sql.includes("FROM prepaid_packages p JOIN services")) return { rows: [{ id: 1, name: "Gel Six", description: null, service_id: 2, visits: 6, price_cents: 15000, is_active: true, service_name: "Gel", service_price: "40" }] };
    if (sql.includes("INSERT INTO site_orders")) return { rows: [{ id: 11 }] };
    if (sql.includes("UPDATE site_orders SET status = 'paid'")) {
      const o = state.orders.get(v[0]);
      if (!o || o.status !== "open") return { rows: [] };
      o.status = "paid"; return { rows: [o] };
    }
    if (sql.startsWith("SELECT result FROM site_orders")) return { rows: [{ result: state.orders.get(v[0])?.result ?? null }] };
    if (sql.includes("UPDATE site_orders SET result")) { for (const o of state.orders.values()) if (o.id === v[0]) o.result = JSON.parse(v[1]); return { rows: [] }; }
    if (sql.includes("SELECT name FROM locations")) return { rows: [{ name: "Toby's" }] };
    if (sql.includes("INSERT INTO gift_cards")) { state.gift.push(v); return { rows: [] }; }
    if (sql.includes("SELECT * FROM prepaid_packages")) return { rows: [{ id: 1, name: "Gel Six", service_id: 2, visits: 6 }] };
    if (sql.includes("FROM client_phones p JOIN clients c")) return { rows: [] };
    if (sql.includes("INSERT INTO client_packages")) { state.credits.push(v); return { rows: [] }; }
    if (sql.includes("SELECT customer_id FROM appointments")) return { rows: [{ customer_id: state.apptCustomer }] };
    if (sql.includes("UPDATE client_packages SET visits_left = visits_left - 1")) {
      if (state.left <= 0 || v[2] !== 5) return { rows: [] };
      state.left--; return { rows: [{ visits_left: state.left }] };
    }
    if (sql.includes("INSERT INTO client_package_uses")) { if (state.used.has(v[1])) return { rows: [] }; state.used.add(v[1]); return { rows: [{ id: 1 }] }; }
    if (/^(BEGIN|COMMIT)$/.test(sql)) return { rows: [] };
    if (sql === "ROLLBACK") { state.left = state.left + 0; return { rows: [] }; }
    return { rows: [] };
  });
});

const giftOrder = (over = {}) => ({ id: 11, store_id: 7, kind: "gift_card", amount_cents: 5000, status: "open", details: { buyerName: "Ann", buyerEmail: "ann@x.co", recipientEmail: "bea@x.co", message: "Enjoy" }, ...over });

describe("Website gift cards", () => {
  it("opens the card form on the pro's own Stripe account, with the connection fee", async () => {
    const r = await post("/api/public/store/tobys/shop/order", { kind: "gift_card", amountCents: 5000, buyerName: "Ann", buyerEmail: "ann@x.co" });
    expect(r).toMatchObject({ status: 200, body: { clientSecret: "secret" } });
    expect(state.intents[0]).toMatchObject({ amount: 5000, application_fee_amount: 60, metadata: { type: "site_order", site_order_id: "11" } });
  });
  it("refuses when the pro hasn't switched gift cards on, or with no card payments", async () => {
    state.prefs = "{}";
    expect((await post("/api/public/store/tobys/shop/order", { kind: "gift_card", amountCents: 5000, buyerName: "Ann", buyerEmail: "ann@x.co" })).status).toBe(409);
    state.prefs = JSON.stringify({ siteGiftCards: true }); state.connected = false;
    expect((await post("/api/public/store/tobys/shop/order", { kind: "gift_card", amountCents: 5000, buyerName: "Ann", buyerEmail: "ann@x.co" })).status).toBe(409);
  });
  it("refuses an amount outside the limits", async () => {
    expect((await post("/api/public/store/tobys/shop/order", { kind: "gift_card", amountCents: 100, buyerName: "Ann", buyerEmail: "ann@x.co" })).status).toBe(400);
  });
  it("delivers once, whichever of the page and the webhook comes first", async () => {
    state.orders.set("pi_1", giftOrder());
    const first = await fulfilSiteOrder("pi_1");
    const second = await fulfilSiteOrder("pi_1");
    expect(first?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(second?.code).toBe(first?.code);
    expect(state.gift).toHaveLength(1);
    expect(state.emails.sort()).toEqual(["ann@x.co", "bea@x.co"]);
    expect(state.pushes).toEqual(["Gift card sold"]);
  });
});

describe("Prepaid packages", () => {
  it("charges the package's own price, whatever the page sends", async () => {
    await post("/api/public/store/tobys/shop/order", { kind: "package", packageId: 1, buyerName: "Ann", buyerEmail: "ann@x.co", buyerPhone: "5205550111" });
    expect(state.intents[0].amount).toBe(15000);
  });
  it("saves the visits on a client, made from the buyer when new", async () => {
    state.orders.set("pi_2", giftOrder({ kind: "package", amount_cents: 15000, details: { packageId: 1, buyerName: "Ann", buyerEmail: "ann@x.co", buyerPhone: "+15205550111" } }));
    await fulfilSiteOrder("pi_2");
    expect(state.created).toBe(1);
    expect(state.credits[0]).toEqual([7, 1, 99, "Gel Six", 2, 6, 15000]);
  });
  it("uses one visit per booking, only for that client, and none when used up", async () => {
    const use = (appointmentId: number) => post("/api/pro/packages/use", { clientPackageId: 1, appointmentId });
    expect(await use(20)).toMatchObject({ status: 200, body: { visitsLeft: 2 } });
    expect((await use(20)).status).toBe(409);
    state.left = 0;
    expect((await use(21)).status).toBe(409);
  });
});
