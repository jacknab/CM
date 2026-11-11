import { describe, expect, it, vi } from "vitest";

// Marel's follow-up text (owner, 2026-11-11). No real database or texts.
const state = vi.hoisted(() => ({ today: 0, inserted: [] as unknown[][] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: unknown[]) => {
  if (sql.includes("count(*)")) return { rows: [{ n: state.today }] };
  if (sql.includes("INSERT INTO agent_follow_ups")) { state.inserted.push(values); return { rows: [{ id: 1 }] }; }
  return { rows: [] };
} } }));
vi.mock("../sms", () => ({ sendTwilioSms: async () => ({ success: true }) }));

import { followUpBody, scheduleFollowUp } from "./agentFollowUps";

describe("Marel's follow-up text", () => {
  it("is written by Certxa, not the AI: name, the check-in question, the Account Services number, no links", () => {
    const body = followUpBody("Kevin Lee", "did the password reset e-mail arrive https://evil.example ?");
    expect(body).toBe("Hi Kevin, it's Marel from Certxa Account Services. Just checking in: did the password reset e-mail arrive? If anything still isn't working, call us at (602) 560-9931.");
  });

  it("is sent 10-60 minutes later, and not more than twice a day to a number", async () => {
    state.today = 0; state.inserted = [];
    expect(await scheduleFollowUp({ callSid: "CA1", phoneE164: "+15205550111", storeId: 7, firstName: null, checkingOn: "did the payment go through", minutes: 300 })).toMatch(/60 minutes/);
    expect(state.inserted[0][4]).toBe("60");
    state.today = 2;
    expect(await scheduleFollowUp({ callSid: "CA2", phoneE164: "+15205550111", storeId: 7, firstName: null, checkingOn: "did the payment go through", minutes: 20 })).toMatch(/don't schedule another/);
  });
});
