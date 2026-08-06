import { describe, expect, it } from "vitest";
import { getGbpPostcardReminderStage } from "./gbp-onboarding-reminder-policy";

const now = new Date("2026-07-31T12:00:00.000Z");
const base = {
  status: "postcard_sent",
  postcardSentAt: new Date("2026-07-22T12:00:00.000Z"),
  firstSentAt: null,
  secondSentAt: null,
  isConnected: false,
  abandonedAt: null,
};

describe("Google postcard onboarding reminder policy", () => {
  it("sends the first reminder around day 7", () => {
    expect(getGbpPostcardReminderStage(base, now)).toBe("day_7");
  });

  it("sends the second reminder around day 10", () => {
    expect(getGbpPostcardReminderStage({ ...base, postcardSentAt: new Date("2026-07-17T12:00:00.000Z"), firstSentAt: new Date("2026-07-27T12:00:00.000Z") }, now)).toBe("day_10");
  });

  it("does not repeat reminders already sent", () => {
    expect(getGbpPostcardReminderStage({ ...base, postcardSentAt: new Date("2026-07-17T12:00:00.000Z"), firstSentAt: new Date("2026-07-27T12:00:00.000Z"), secondSentAt: now }, now)).toBeNull();
  });

  it("stops after connection", () => {
    expect(getGbpPostcardReminderStage({ ...base, isConnected: true }, now)).toBeNull();
  });

  it("stops after abandonment or a non-pending lifecycle state", () => {
    expect(getGbpPostcardReminderStage({ ...base, abandonedAt: now }, now)).toBeNull();
    expect(getGbpPostcardReminderStage({ ...base, status: "failed" }, now)).toBeNull();
    expect(getGbpPostcardReminderStage({ ...base, status: "profile_found" }, now)).toBeNull();
  });
});
