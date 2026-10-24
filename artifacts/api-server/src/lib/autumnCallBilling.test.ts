import { describe, it, expect } from "vitest";
import { autumnCallCharge, includedCallsForPlan, isHandledCall } from "./autumnCallBilling";

describe("Autumn call billing", () => {
  it("gives each plan its monthly allowance", () => {
    expect(includedCallsForPlan("solo")).toBe(0);
    expect(includedCallsForPlan("professional")).toBe(20);
    expect(includedCallsForPlan("elite")).toBe(50);
    expect(includedCallsForPlan("enterprise")).toBe(100);
    expect(includedCallsForPlan("Elite")).toBe(50);
  });

  it("includes nothing for a plan with no stated allowance", () => {
    expect(includedCallsForPlan("free_trial")).toBe(0);
    expect(includedCallsForPlan(null)).toBe(0);
  });

  it("never charges a call of 30 seconds or less", () => {
    expect(isHandledCall(30)).toBe(false);
    expect(isHandledCall(31)).toBe(true);
    expect(autumnCallCharge(30, 999, 20)).toEqual({ charge: 0, reason: "short_call" });
  });

  it("covers calls up to the allowance and charges $0.50 after it", () => {
    expect(autumnCallCharge(120, 1, 20)).toEqual({ charge: 0, reason: "included" });
    expect(autumnCallCharge(120, 20, 20)).toEqual({ charge: 0, reason: "included" });
    expect(autumnCallCharge(120, 21, 20)).toEqual({ charge: 0.5, reason: "per_call" });
    expect(autumnCallCharge(1800, 51, 50)).toEqual({ charge: 0.5, reason: "per_call" });
  });

  it("charges every handled call when the plan includes none", () => {
    expect(autumnCallCharge(45, 1, 0)).toEqual({ charge: 0.5, reason: "per_call" });
  });
});
