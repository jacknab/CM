import { describe, it, expect } from "vitest";
import { sanitizeTipPresets, DEFAULT_TIP_PRESETS } from "@shared/tipPresets";

describe("sanitizeTipPresets", () => {
  it("keeps whole percentages, sorted, without repeats, at most four", () => {
    expect(sanitizeTipPresets([20, 10, 20, 15])).toEqual([10, 15, 20]);
    expect(sanitizeTipPresets([5, 10, 15, 20, 25])).toEqual([5, 10, 15, 20]);
    expect(sanitizeTipPresets(["18", 22.4])).toEqual([18, 22]);
  });
  it("falls back to the defaults for anything unusable", () => {
    expect(sanitizeTipPresets(undefined)).toEqual([...DEFAULT_TIP_PRESETS]);
    expect(sanitizeTipPresets([])).toEqual([...DEFAULT_TIP_PRESETS]);
    expect(sanitizeTipPresets([0, -5, 150, "x"])).toEqual([...DEFAULT_TIP_PRESETS]);
  });
});
