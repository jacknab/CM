import { describe, expect, it } from "vitest";
import { arrangedKeys, gridKeys, type CatalogGroup } from "./CatalogPanel";

const svc = (id: number) => ({ id, name: `Service ${id}`, duration: 30, price: 25 });
const group = (key: string, n: number): CatalogGroup => ({ key, name: key, services: Array.from({ length: n }, (_, i) => svc(i + 1)) });

describe("POS key grid — always 12 positions (2 × 6)", () => {
  it("shows the categories on the main grid and pads with blank keys", () => {
    const keys = gridKeys([group("mani", 5), group("pedi", 3)], null, 0);
    expect(keys).toHaveLength(12);
    expect(keys.slice(0, 2).map((k) => k.kind)).toEqual(["category", "category"]);
    expect(keys.slice(2).every((k) => k.kind === "empty")).toBe(true);
  });

  it("shows a category's services with Back as the last key", () => {
    const keys = gridKeys([group("mani", 5)], "mani", 0);
    expect(keys).toHaveLength(12);
    expect(keys.filter((k) => k.kind === "service")).toHaveLength(5);
    expect(keys[11].kind).toBe("back");
  });

  it("puts what doesn't fit behind a MORE key that cycles round", () => {
    const groups = [group("big", 25)];
    const first = gridKeys(groups, "big", 0);
    expect(first).toHaveLength(12);
    expect(first.filter((k) => k.kind === "service")).toHaveLength(10);
    expect(first[10].kind).toBe("more");
    expect(first[11].kind).toBe("back");
    expect(gridKeys(groups, "big", 1).filter((k) => k.kind === "service")).toHaveLength(10);
    expect(gridKeys(groups, "big", 2).filter((k) => k.kind === "service")).toHaveLength(5);
    expect(gridKeys(groups, "big", 3)).toEqual(first);
  });

  it("falls back to the main grid for a category that no longer exists", () => {
    expect(gridKeys([group("mani", 2)], "gone", 0)[0].kind).toBe("category");
  });
});

describe("arranged grid — new categories and add-on / function keys (2026-10-24)", () => {
  const groups = [group("cat:1", 2), group("cat:2", 2), group("cat:3", 1)];
  const layout = { grids: [{ id: "main", name: "Main", keys: [{ type: "category" as const, groupKey: "cat:1" }, null, { type: "addon" as const, addonId: 7 }, { type: "fn" as const, fn: "nosale" as const }] }] };
  const addons = [{ id: 7, name: "French Tip", price: 5, duration: null }];
  it("puts a category that is on no grid into the next empty position of the main grid", () => {
    const keys = arrangedKeys(layout.grids[0] as any, layout as any, groups, addons);
    expect(keys[0]).toMatchObject({ kind: "category", group: { key: "cat:1" } });
    expect(keys[1]).toMatchObject({ kind: "category", group: { key: "cat:2" } });
    expect(keys[2]).toMatchObject({ kind: "addon", addon: { id: 7 } });
    expect(keys[3]).toMatchObject({ kind: "fn", fn: "nosale" });
    expect(keys[4]).toMatchObject({ kind: "category", group: { key: "cat:3" } });
  });
  it("leaves the last position free when it is the way back to Payment", () => {
    const full = { grids: [{ id: "main", name: "Main", keys: Array.from({ length: 11 }, (_, i) => ({ type: "service" as const, serviceId: 900 + i })) }] };
    const keys = arrangedKeys(full.grids[0] as any, full as any, groups, [], true);
    expect(keys[11].kind).toBe("empty");
  });
});

describe("POS key grid — 3 across (2026-10-24)", () => {
  it("has 18 positions, with Back last inside a category", () => {
    expect(gridKeys([group("a", 3)], null, 0, false, 3)).toHaveLength(18);
    const inside = gridKeys([group("a", 3)], "a", 0, false, 3);
    expect(inside).toHaveLength(18);
    expect(inside[17].kind).toBe("back");
  });
});
