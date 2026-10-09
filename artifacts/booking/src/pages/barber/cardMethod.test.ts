import { describe, expect, it } from "vitest";
import { frontdeskReaderMethod, readNailCardMethod } from "./cardMethod";

describe("nail POS card reader settings", () => {
  it("migrates the previously saved Tap to Pay choice to the local M2 reader", () => {
    expect(readNailCardMethod("tap")).toBe("m2");
    expect(readNailCardMethod(null)).toBe("m2");
    expect(readNailCardMethod("m2")).toBe("m2");
  });

  it("retains the front desk tip workflow but selects the M2 reader for payment", () => {
    expect(readNailCardMethod("frontdesk")).toBe("frontdesk");
    expect(frontdeskReaderMethod()).toBe("m2");
  });
});
