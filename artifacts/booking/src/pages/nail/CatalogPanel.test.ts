import { describe, expect, it } from "vitest";
import { gridKeys, type CatalogGroup } from "./CatalogPanel";

const svc = (id: number) => ({ id, name: `Service ${id}`, duration: 30, price: 25 });
const group = (key: string, n: number): CatalogGroup => ({ key, name: key, services: Array.from({ length: n }, (_, i) => svc(i + 1)) });

describe("POS key grid — always 18 positions", () => {
  it("shows the categories on the main grid and pads with blank keys", () => {
    const keys = gridKeys([group("mani", 5), group("pedi", 3)], null, 0);
    expect(keys).toHaveLength(18);
    expect(keys.slice(0, 2).map((k) => k.kind)).toEqual(["category", "category"]);
    expect(keys.slice(2).every((k) => k.kind === "empty")).toBe(true);
  });

  it("shows a category's services with Back as the last key", () => {
    const keys = gridKeys([group("mani", 5)], "mani", 0);
    expect(keys).toHaveLength(18);
    expect(keys.filter((k) => k.kind === "service")).toHaveLength(5);
    expect(keys[17].kind).toBe("back");
  });

  it("puts what doesn't fit behind a MORE key that cycles round", () => {
    const groups = [group("big", 30)];
    const first = gridKeys(groups, "big", 0);
    expect(first).toHaveLength(18);
    expect(first.filter((k) => k.kind === "service")).toHaveLength(16);
    expect(first[16].kind).toBe("more");
    expect(first[17].kind).toBe("back");
    const second = gridKeys(groups, "big", 1);
    expect(second.filter((k) => k.kind === "service")).toHaveLength(14);
    expect(gridKeys(groups, "big", 2)).toEqual(first);
  });

  it("falls back to the main grid for a category that no longer exists", () => {
    expect(gridKeys([group("mani", 2)], "gone", 0)[0].kind).toBe("category");
  });
});
