import { describe, expect, it } from "vitest";
import { tipInclusiveChargeCents } from "./cardCharge";

describe("frontdesk tip-inclusive card charge", () => {
  it("charges the remaining balance plus the newly confirmed tip, not the whole cart twice", () => {
    expect(tipInclusiveChargeCents(3500, 800)).toBe(4300);
    expect(tipInclusiveChargeCents(500, 0)).toBe(500);
  });

  it("rejects sub-minimum and malformed charges before launching NFC", () => {
    expect(tipInclusiveChargeCents(49, 0)).toBeNull();
    expect(tipInclusiveChargeCents(-100, 200)).toBeNull();
    expect(tipInclusiveChargeCents(Number.NaN, 100)).toBeNull();
    expect(tipInclusiveChargeCents(Number.MAX_SAFE_INTEGER, 100)).toBeNull();
  });
});
