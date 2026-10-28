import { describe, expect, it } from "vitest";
import { groupCartLines, type TicketLine } from "./ticketDraft";

const svc = (key: string, serviceId: number, price = 25): TicketLine => ({ key, kind: key.startsWith("svc-") ? "service" : "custom", label: `S${serviceId}`, duration: 30, price, serviceId });
const addon = (key: string, addonId: number, lineNo: number | null = null, price = 10): TicketLine => ({ key, kind: "addon", label: `A${addonId}`, duration: 5, price, addonId, addonLineNo: lineNo });

describe("the cart shows identical items as one line with a quantity", () => {
  it("the same add-on under the same service: one line ×2 with both prices", () => {
    const rows = groupCartLines([svc("svc-1", 1), addon("a1", 7), addon("a2", 7)]);
    expect(rows.map((r) => [r.label, r.qty, r.price])).toEqual([["S1", 1, 25], ["A7", 2, 20]]);
    expect(rows[1].members.map((m) => m.key)).toEqual(["a1", "a2"]);
  });

  it("the same service three times (QTY 3): one line ×3", () => {
    const rows = groupCartLines([svc("svc-1", 1), svc("custom-1", 1), svc("custom-2", 1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 3, price: 75, duration: 90 });
  });

  it("copies of a service with add-ons under them: one service line, their add-ons together under it", () => {
    const rows = groupCartLines([svc("svc-1", 1), addon("a1", 7, null), svc("custom-1", 1), addon("a2", 7, 0), svc("custom-2", 1)]);
    expect(rows.map((r) => [r.label, r.qty, r.price])).toEqual([["S1", 3, 75], ["A7", 2, 20]]);
    expect(rows[1].members.map((m) => m.key)).toEqual(["a1", "a2"]);
  });

  it("different add-ons stay on their own lines", () => {
    const rows = groupCartLines([svc("svc-1", 1), addon("a1", 7), addon("a2", 8), addon("a3", 7)]);
    expect(rows.map((r) => [r.label, r.qty])).toEqual([["S1", 1], ["A7", 2], ["A8", 1]]);
  });

  it("another technician's ticket is never merged with this one", () => {
    const visit: TicketLine = { ...svc("visit-9", 1), kind: "service", ownerTicketId: 9 };
    expect(groupCartLines([svc("svc-1", 1), visit])).toHaveLength(2);
  });
});
