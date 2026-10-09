import { describe, expect, it } from "vitest";
import { canCreateConnectedPayout } from "./payoutControl";

describe("connected-account payout permissions", () => {
  it("does not treat payouts_enabled on OAuth Standard accounts as platform payout control", () => {
    expect(canCreateConnectedPayout("standard")).toBe(false);
    expect(canCreateConnectedPayout(null)).toBe(false);
    expect(canCreateConnectedPayout("unknown")).toBe(false);
  });

  it("allows platform-controlled Connect accounts", () => {
    expect(canCreateConnectedPayout("express")).toBe(true);
    expect(canCreateConnectedPayout("custom")).toBe(true);
  });
});
