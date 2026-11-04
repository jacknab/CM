import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as { sql: string; values: unknown[] }[], pushes: [] as { title: string }[], removed: [] as string[],
  declined: false, card: { customerId: "cus_1", paymentMethodId: "pm_1" } as Record<string, string> | null,
  rows: {} as Record<string, unknown[]>,
}));
vi.mock("../db", () => {
  const query = async (sql: string, values: unknown[] = []) => {
    state.queries.push({ sql, values });
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ got: true }] };
    for (const [key, rows] of Object.entries(state.rows)) if (sql.includes(key)) return { rows };
    return { rows: [] };
  };
  return { pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
vi.mock("./stripe", () => ({ isStripeConfigured: () => true, stripe: {
  paymentIntents: {
    create: async () => { if (state.declined) throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError" }); return { id: "pi_9", status: "succeeded" }; },
    retrieve: async () => ({ latest_charge: { refunded: false, amount_refunded: 0 } }),
  },
  refunds: { create: async () => ({}) },
} }));
vi.mock("../routes/soloCredits", () => ({ savedCard: async () => state.card }));
vi.mock("./ownerPush", () => ({ pushOwnerMessage: async (_s: number, m: { title: string }) => { state.pushes.push(m); } }));
vi.mock("twilio", () => ({ default: () => ({ incomingPhoneNumbers: (sid: string) => ({ remove: async () => { state.removed.push(sid); } }) }) }));

import { renewLine, runBusinessPhoneBilling } from "./businessPhoneBilling";

const now = new Date("2026-12-05T12:00:00Z");
const line = (failed: number) => ({ store_id: 7, phone_number: "+15205550100", billing_status: failed ? "past_due" : "active", paid_until: new Date("2026-12-05T00:00:00Z"), failed_attempts: failed });
const update = () => state.queries.find((q) => q.sql.startsWith("UPDATE business_phone_lines"))!;

beforeEach(() => {
  state.queries = []; state.pushes = []; state.removed = []; state.declined = false; state.rows = {};
  state.card = { customerId: "cus_1", paymentMethodId: "pm_1" };
  process.env.TWILIO_ACCOUNT_SID = "AC"; process.env.TWILIO_AUTH_TOKEN = "t";
});

describe("Business Phone renewals", () => {
  it("a paid renewal runs the line 31 days on from where it was paid to", async () => {
    expect(await renewLine(line(0), now)).toBe("charged");
    expect(update().values[1]).toEqual(new Date("2027-01-05T00:00:00Z"));
  });

  it("a decline is retried 1, 3 and 5 days later, with a push each time", async () => {
    state.declined = true;
    expect(await renewLine(line(0), now)).toBe("declined");
    expect(update().sql).toContain("'past_due'");
    expect(update().values[2]).toEqual(new Date("2026-12-06T12:00:00Z"));
    expect(state.pushes[0].title).toBe("Business Phone payment failed");
  });

  it("after the last retry fails, the number is held for 14 days", async () => {
    state.declined = true;
    expect(await renewLine(line(3), now)).toBe("held");
    expect(update().sql).toContain("'held'");
    expect(update().values[2]).toEqual(new Date("2026-12-19T12:00:00Z"));
    expect(state.pushes[0].title).toBe("Business Phone paused");
  });

  it("no card on file counts as a decline", async () => {
    state.card = null;
    expect(await renewLine(line(0), now)).toBe("declined");
  });

  it("releases a cancelled number at the end of its month and a held one after 14 days, in any billing mode", async () => {
    process.env.SAAS_BILLING_MODE = "off";
    state.rows["CASE WHEN billing_status = 'held'"] = [{ store_id: 7, why: "canceled" }];
    state.rows["DELETE FROM business_phone_lines"] = [{ phone_number: "+15205550100", twilio_sid: "PN_7" }];
    await runBusinessPhoneBilling(now);
    expect(state.removed).toEqual(["PN_7"]);
    expect(state.pushes[0].title).toBe("Business number released");
  });

  it("charges nothing while SAAS_BILLING_MODE is dry_run", async () => {
    process.env.SAAS_BILLING_MODE = "dry_run";
    state.rows["ORDER BY paid_until"] = [line(0)];
    await runBusinessPhoneBilling(now);
    expect(state.queries.some((q) => q.sql.startsWith("UPDATE business_phone_lines"))).toBe(false);
  });
});
