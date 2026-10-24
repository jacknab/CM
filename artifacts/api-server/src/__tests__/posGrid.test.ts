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

describe("sanitizePosGridConfig — add-on / function keys and after a selection (2026-10-24)", () => {
  it("keeps add-on and function keys, drops unknown functions", () => {
    const c = sanitizePosGridConfig({ grids: [{ id: "main", name: "Main", keys: [{ type: "addon", addonId: 4 }, { type: "fn", fn: "discount" }, { type: "fn", fn: "format_disk" }] }] })!;
    expect(c.grids[0].keys.slice(0, 3)).toEqual([{ type: "addon", addonId: 4 }, { type: "fn", fn: "discount" }, null]);
  });
  it("keeps a jump to a grid that exists, drops one to a missing grid or to itself", () => {
    const c = sanitizePosGridConfig({
      afterService: { to: "grid", gridId: "extras" },
      grids: [{ id: "main", name: "Main", keys: [], after: { to: "grid", gridId: "nope" } }, { id: "extras", name: "Extras", keys: [], after: { to: "grid", gridId: "extras" } }, { id: "x", name: "X", keys: [], after: { to: "main" } }],
    })!;
    expect(c.afterService).toEqual({ to: "grid", gridId: "extras" });
    expect(c.grids[0].after).toBeUndefined();
    expect(c.grids[1].after).toBeUndefined();
    expect(c.grids[2].after).toEqual({ to: "main" });
  });
});
