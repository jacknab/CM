import { beforeEach, describe, expect, it, vi } from "vitest";

// Marel's trial extension (owner, 2026-11-11): up to 14 days, never past 74 days, ended trials too. No real database.
const DAY = 86_400_000;
const state = vi.hoisted(() => ({ user: { trial_ends_at: new Date(), subscription_status: "trial" } as any, started: new Date(), updates: [] as unknown[][], lifted: [] as number[] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: unknown[]) => {
  if (sql.includes("FROM support_agents")) return { rows: [{ id: 816 }] };
  if (sql.includes("SELECT trial_ends_at, subscription_status FROM users")) return { rows: [state.user] };
  if (sql.includes("trial_started_at")) return { rows: [{ started: state.started }] };
  if (sql.startsWith("UPDATE users") || sql.startsWith("UPDATE store_subscriptions")) { state.updates.push(values); return { rows: [] }; }
  return { rows: [] };
} } }));
vi.mock("../sms", () => ({ sendTwilioSms: async () => undefined }));
vi.mock("../mail", () => ({ sendEmail: async () => undefined }));
vi.mock("../services/saas-billing", () => ({ retryFailedCharge: async () => undefined }));
vi.mock("../services/trial-expiration", () => ({ liftTrialSuspension: async (id: number) => { state.lifted.push(id); } }));
vi.mock("./stripe", () => ({ stripe: {}, isStripeConfigured: () => false }));

import { extendTrial } from "./marilAccountSupport";

const owner = { userId: "u1", storeId: 5, businessName: "Test Nails", firstName: "Ann" } as any;
const newEnd = () => (state.updates[0][0] as Date).getTime();

beforeEach(() => { state.updates = []; state.lifted = []; });

describe("Marel extends a free trial", () => {
  it("adds the days asked for while the trial is running", async () => {
    state.started = new Date(Date.now() - 50 * DAY);
    state.user = { trial_ends_at: new Date(Date.now() + 10 * DAY), subscription_status: "trial" };
    const said = await extendTrial(owner, 7, "staff training next week");
    expect(said).toMatch(/^Added 7 days/);
    expect(Math.round((newEnd() - Date.now()) / DAY)).toBe(17);
  });

  it("gives what's left under the 74-day limit instead of refusing", async () => {
    state.started = new Date(Date.now() - 65 * DAY);
    state.user = { trial_ends_at: new Date(Date.now() + 2 * DAY), subscription_status: "trial" };
    const said = await extendTrial(owner, 14, "waiting on the card reader");
    expect(said).toMatch(/^Added 7 days \(asked for 14/);
    expect(newEnd()).toBeLessThanOrEqual(state.started.getTime() + 74 * DAY);
  });

  it("restarts an ended trial from today and reopens the account", async () => {
    state.started = new Date(Date.now() - 62 * DAY);
    state.user = { trial_ends_at: new Date(Date.now() - 2 * DAY), subscription_status: "expired" };
    const said = await extendTrial(owner, 5, "was travelling");
    expect(said).toContain("open again now");
    expect(Math.round((newEnd() - Date.now()) / DAY)).toBe(5);
    expect(state.lifted).toEqual([5]);
  });

  it("explains the limit and changes nothing once 74 days are used", async () => {
    state.started = new Date(Date.now() - 80 * DAY);
    state.user = { trial_ends_at: new Date(Date.now() - 6 * DAY), subscription_status: "expired" };
    const said = await extendTrial(owner, 7, "needs more time");
    expect(said).toMatch(/No days left/);
    expect(state.updates).toHaveLength(0);
  });

  it("won't touch an account on a paid plan", async () => {
    state.user = { trial_ends_at: new Date(Date.now() + 5 * DAY), subscription_status: "active" };
    expect(await extendTrial(owner, 7, "more time please")).toMatch(/isn't on a free trial/);
    expect(state.updates).toHaveLength(0);
  });
});
