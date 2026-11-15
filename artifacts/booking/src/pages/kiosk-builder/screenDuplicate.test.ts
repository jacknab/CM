import { describe, expect, it } from "vitest";
import { withNewScreen, withNewWorkflow, withScreenDuplicated } from "./ScreensEditor";
import type { KioskLayout } from "@shared/kiosk/layout";

describe("withScreenDuplicated", () => {
  it("copies every setting with new ids, right after the original in its workflow", () => {
    let d = { menus: [], workflows: [], startMenuId: null, menuMode: "catalog", builder: "picture" } as unknown as KioskLayout;
    const w = withNewWorkflow(d); d = w.layout;
    const a = withNewScreen(d, "Length", w.id); d = a.layout;
    const b = withNewScreen(d, "Shape", w.id); d = b.layout;
    d = { ...d, menus: d.menus.map((m) => (m.id === a.id
      ? { ...m, imageUrl: "/pic.jpg", choose: "one", mustChoose: true, spots: [{ id: "spot-1", x: 1, y: 2, w: 3, h: 4, action: { kind: "menu", menuId: b.id } }] as any }
      : m)) };
    const r = withScreenDuplicated(d, a.id);
    expect(r.layout.menus.map((m) => m.name)).toEqual(["Length", "Length copy", "Shape"]);
    const orig = r.layout.menus[0], copy = r.layout.menus[1];
    expect(copy.id).toBe(r.id);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.workflowId).toBe(w.id);
    expect(copy.imageUrl).toBe("/pic.jpg");
    expect(copy.choose).toBe("one");
    expect(copy.mustChoose).toBe(true);
    expect(copy.spots[0].action).toEqual(orig.spots[0].action);
    expect(copy.spots[0].id).not.toBe(orig.spots[0].id);
  });
});
