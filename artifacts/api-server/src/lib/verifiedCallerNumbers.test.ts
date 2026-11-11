import { beforeEach, describe, expect, it, vi } from "vitest";

// Numbers an owner verified with a texted code (owner, 2026-11-11; migration 0348). No real database.
const state = vi.hoisted(() => ({ ownerPhone: "+15205550100", saved: [] as { phone: string; store: number }[], inserts: [] as unknown[][] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: any[]) => {
  if (sql.includes("FROM support_agents")) return { rows: [{ id: 816 }] };
  if (sql.includes("SELECT phone, first_name, last_name FROM users")) return { rows: [{ phone: state.ownerPhone, first_name: "Kevin", last_name: "Lee" }] };
  if (sql.includes("INSERT INTO verified_caller_numbers")) { state.inserts.push(values); state.saved.push({ phone: values[0], store: values[1] }); return { rows: [] }; }
  if (sql.includes("SELECT DISTINCT store_id FROM verified_caller_numbers")) return { rows: [...new Set(state.saved.filter((r) => r.phone.endsWith(values[0])).map((r) => r.store))].map((store_id) => ({ store_id })) };
  if (sql.includes("FROM users u JOIN LATERAL")) {
    const d = String(values[0]);
    if (sql.includes("u.id = (SELECT user_id FROM locations")) return { rows: [{ id: "u1", first_name: "Kevin", email: "k@x.com", phone: state.ownerPhone, account_type: null, store_id: 7, name: "Kevin's Cuts" }] };
    return { rows: state.ownerPhone.endsWith(d) ? [{ id: "u1", first_name: "Kevin", email: "k@x.com", phone: state.ownerPhone, account_type: null, store_id: 7, name: "Kevin's Cuts" }] : [] };
  }
  if (sql.includes("SELECT name FROM locations")) return { rows: [{ name: "Kevin's Cuts" }] };
  return { rows: [] };
} } }));
vi.mock("../sms", () => ({ sendTwilioSms: async () => undefined }));
vi.mock("../mail", () => ({ sendEmail: async () => undefined }));
vi.mock("../services/saas-billing", () => ({ retryFailedCharge: async () => undefined }));
vi.mock("../services/trial-expiration", () => ({ liftTrialSuspension: async () => undefined }));
vi.mock("./stripe", () => ({ stripe: {}, isStripeConfigured: () => false }));

import { ownerByCallerId, rememberVerifiedCaller } from "./marilAccountSupport";

const owner = { userId: "u1", firstName: "Kevin", email: "k@x.com", storeId: 7, businessName: "Kevin's Cuts", accountType: null };
beforeEach(() => { state.saved = []; state.inserts = []; });

describe("A number an owner verified by code", () => {
  it("is saved with their name and store, then recognised on the next call", async () => {
    expect(await ownerByCallerId("+15205550999")).toBeNull();
    expect(await rememberVerifiedCaller("+15205550999", owner, "CA1")).toBe(true);
    expect(state.inserts[0]).toEqual(["+15205550999", 7, "u1", "Kevin Lee", "CA1"]);
    expect(await ownerByCallerId("5205550999")).toMatchObject({ userId: "u1", storeId: 7, businessName: "Kevin's Cuts" });
  });

  it("isn't saved again when it's already the mobile on file", async () => {
    expect(await rememberVerifiedCaller("+15205550100", owner, "CA1")).toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it("isn't trusted when it was verified for two different accounts", async () => {
    state.saved = [{ phone: "+15205550999", store: 7 }, { phone: "+15205550999", store: 8 }];
    expect(await ownerByCallerId("+15205550999")).toBeNull();
  });
});
