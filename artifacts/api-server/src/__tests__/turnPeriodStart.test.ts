import { describe, it, expect, vi, beforeEach } from "vitest";

// The salon's last Day Close, as the database would answer.
let lastClose: Date | null = null;
vi.mock("../db", () => ({ pool: { query: async () => ({ rows: [{ closed: lastClose }] }) }, db: {} }));
const { turnPeriodStart } = await import("../lib/turnEngine");

const H = 3_600_000;
const dayStart = new Date(Date.now() - 10 * H); // today's turn day began 10 hours ago (4 AM)
const rules = (resetPeriod: "business_day" | "day_close" | "continuous") => ({ resetPeriod }) as any;

beforeEach(() => { lastClose = null; });

describe("when the turn counts start from 0", () => {
  it("at the start of the turn day, when the day hasn't been closed since", async () => {
    lastClose = new Date(dayStart.getTime() - 5 * H); // last night's close, before 4 AM
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(dayStart.getTime());
  });

  it("at the Day Close, once the day has been closed (the owner's rule)", async () => {
    lastClose = new Date(Date.now() - 1 * H); // closed an hour ago, tonight
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(lastClose.getTime());
  });

  it("each morning even when nobody closed the day", async () => {
    lastClose = new Date(dayStart.getTime() - 3 * 24 * H);
    expect((await turnPeriodStart(2, rules("business_day"), {}, dayStart)).getTime()).toBe(dayStart.getTime());
  });
});
