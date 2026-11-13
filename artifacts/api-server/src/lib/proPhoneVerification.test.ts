import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner of a number, as account_phone_numbers would say; no database.
const state = vi.hoisted(() => ({ owner: null as string | null, lookups: 0 }));
vi.mock("../db", () => ({
  pool: {
    query: async (sql: string) => {
      if (sql.includes("FROM account_phone_numbers WHERE phone")) return { rows: state.owner ? [{ user_id: state.owner }] : [] };
      if (sql.includes("FROM pro_phone_verifications")) return { rows: [{ recent: 0, phone_day: 0, ip_hour: 0 }] };
      return { rows: [], rowCount: 0 };
    },
  },
}));
// The line-type check is the step after the ownership rule: reaching it means the number was allowed to get a code.
vi.mock("./twilioLookup", () => ({ lookupPhoneType: async () => { state.lookups++; return null; } }));

import { startPhoneVerification } from "./proPhoneVerification";

describe("account mobile number rule (owner, 2026-11-13)", () => {
  beforeEach(() => { state.owner = null; state.lookups = 0; });

  it("refuses a number another account has ever had — for a sign-up and for a change", async () => {
    state.owner = "user-b";
    expect(await startPhoneVerification("5551234567", "1.1.1.1")).toMatchObject({ ok: false, status: 409 });
    expect(await startPhoneVerification("5551234567", "1.1.1.1", undefined, "user-a")).toMatchObject({ ok: false, status: 409 });
    expect(state.lookups).toBe(0);
  });

  it("a sign-up can't reuse any account's number, even its own earlier one", async () => {
    state.owner = "user-a";
    expect(await startPhoneVerification("5551234567", "1.1.1.1")).toMatchObject({ ok: false, status: 409 });
  });

  it("switching back to the account's own earlier number still goes through the code step", async () => {
    state.owner = "user-a";
    const r = await startPhoneVerification("5551234567", "1.1.1.1", undefined, "user-a");
    expect(state.lookups).toBe(1); // went on to check the line and text a code (the lookup is stubbed out here)
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("a brand-new number goes through the code step", async () => {
    await startPhoneVerification("5551234567", "1.1.1.1", undefined, "user-a");
    expect(state.lookups).toBe(1);
  });
});
