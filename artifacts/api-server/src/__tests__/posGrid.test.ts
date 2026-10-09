import { describe, expect, it } from "vitest";
import { POS_GRID_SLOTS, sanitizePosGridConfig } from "@shared/posGrid";

describe("sanitizePosGridConfig — what a manager's key grid may contain", () => {
  it("is null (automatic) without a main grid", () => {
    expect(sanitizePosGridConfig(null)).toBeNull();
    expect(sanitizePosGridConfig({ grids: [] })).toBeNull();
    expect(sanitizePosGridConfig({ grids: [{ id: "other", name: "x", keys: [] }] })).toBeNull();
  });

  it("pads every grid to 18 positions and puts the main grid first", () => {
    const c = sanitizePosGridConfig({ grids: [{ id: "extras", name: "Extras", keys: [{ type: "back" }] }, { id: "main", name: "Main", keys: [{ type: "service", serviceId: 5, label: "  Mani  ", color: "#FF8BD4" }] }] })!;
    expect(c.grids.map((g) => g.id)).toEqual(["main", "extras"]);
    expect(c.grids.every((g) => g.keys.length === POS_GRID_SLOTS)).toBe(true);
    expect(c.grids[0].keys[0]).toEqual({ type: "service", serviceId: 5, label: "Mani", color: "#ff8bd4" });
    expect(c.grids[1].keys[0]).toEqual({ type: "back" });
  });

  it("drops keys that point nowhere, a Back key on the main grid, and junk", () => {
    const c = sanitizePosGridConfig({ grids: [{ id: "main", name: "", keys: [
      { type: "grid", gridId: "missing" }, { type: "grid", gridId: "main" }, { type: "back" }, { type: "service", serviceId: "abc" },
      { type: "category", groupKey: "cat:3", color: "red" }, "nonsense",
    ] }] })!;
    expect(c.grids[0].name).toBe("Main");
    expect(c.grids[0].keys.slice(0, 6)).toEqual([null, null, null, null, { type: "category", groupKey: "cat:3" }, null]);
  });

  it("ignores duplicate and badly named grids", () => {
    const c = sanitizePosGridConfig({ grids: [{ id: "main", keys: [] }, { id: "main", keys: [] }, { id: "Bad Id!", keys: [] }, { id: "g1", name: "One", keys: [] }] })!;
    expect(c.grids.map((g) => g.id)).toEqual(["main", "g1"]);
  });
});
