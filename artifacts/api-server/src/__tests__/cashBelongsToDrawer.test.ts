import { describe, expect, it } from "vitest";
import { cashBelongsToDrawer } from "../lib/stationDrawer";

describe("whose Day Close counts a cash sale", () => {
  it("a sale counts in the drawer that took it, and only there", () => {
    expect(cashBelongsToDrawer(3, 3, 1)).toBe(true);
    expect(cashBelongsToDrawer(3, 1, 1)).toBe(false);
  });
  it("cash no station claimed counts in the main drawer only", () => {
    expect(cashBelongsToDrawer(null, 1, 1)).toBe(true);
    expect(cashBelongsToDrawer(null, 3, 1)).toBe(false);
  });
  it("the old shared drawer (no drawer on the session) counts every sale", () => {
    expect(cashBelongsToDrawer(3, null, 1)).toBe(true);
    expect(cashBelongsToDrawer(null, null, null)).toBe(true);
  });
});
