import { describe, it, expect, vi, beforeEach } from "vitest";

// The salon's last Day Close, as the database would answer.
let lastClose: Date | null = null;
const closeQueries: string[] = [];
vi.mock("../db", () => ({ pool: { query: async (sql: string) => {
  closeQueries.push(sql);
  return { rows: [{ closed: lastClose }] };
} }, db: {} }));
const { turnPeriodStart } = await import("../lib/turnEngine");

const H = 3_600_000;
const dayStart = new Date(Date.now() - 10 * H); // today's turn day began 10 hours ago (4 AM)
const rules = (resetPeriod: "business_day" | "day_close" | "continuous") => ({ resetPeriod }) as any;

beforeEach(() => { lastClose = null; closeQueries.length = 0; });

describe("when the turn counts start from 0", () => {
  it("starts at Day Close when it happened after the business-day boundary", async () => {
    lastClose = new Date(Date.now() - 1 * H);
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(lastClose.getTime());
    expect(closeQueries[0]).toContain("close_action.reason = 'Day Close'");
    expect(closeQueries[0]).toContain("open_action.reason = 'Auto-opened by Day Close'");
  });

  it("uses the last Day Close even when it was before 4 AM", async () => {
    lastClose = new Date(dayStart.getTime() - 5 * H); // last night's close, before 4 AM
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(lastClose.getTime());
  });

  it("uses the last Day Close when day_close reset is configured", async () => {
    lastClose = new Date(Date.now() - 1 * H); // closed an hour ago, tonight
    expect((await turnPeriodStart(2, rules("day_close"), {}, dayStart)).getTime()).toBe(lastClose.getTime());
  });

  it("continues from Day Close even when the 4 AM boundary has passed", async () => {
    lastClose = new Date(dayStart.getTime() - 1 * H);
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(lastClose.getTime());
  });

  it("falls back to the business-day start before the first Day Close", async () => {
    lastClose = null;
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(dayStart.getTime());
  });
});
