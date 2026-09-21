import { describe, expect, test } from "vitest";
import { commissionAmount, commissionBasis } from "@shared/commissionBasis";

describe("commissionBasis", () => {
  test("frozen split wins: services+add-ons vs retail products", () => {
    expect(commissionBasis({ serviceRevenue: "75.00", productRevenue: "20.00", totalPaid: "999", tipAmount: "5" }))
      .toEqual({ service: 75, product: 20 });
  });

  test("a split with only one side present treats the other as zero", () => {
    expect(commissionBasis({ serviceRevenue: "40" })).toEqual({ service: 40, product: 0 });
    expect(commissionBasis({ productRevenue: "12.5" })).toEqual({ service: 0, product: 12.5 });
  });

  test("discounts never reduce the frozen basis (it is pre-discount by construction)", () => {
    expect(commissionBasis({ serviceRevenue: "100", discountAmount: "30", totalPaid: "70" }).service).toBe(100);
  });

  test("legacy row: everything paid before discount minus tip, at the service rate", () => {
    expect(commissionBasis({ totalPaid: "90", discountAmount: "10", tipAmount: "15" })).toEqual({ service: 85, product: 0 });
  });

  test("legacy row never goes negative", () => {
    expect(commissionBasis({ totalPaid: "5", tipAmount: "20" }).service).toBe(0);
  });

  test("nothing collected: frozen price, else catalogue price, plus add-ons", () => {
    expect(commissionBasis({ servicePrice: "65" }, { addonTotal: 10 })).toEqual({ service: 75, product: 0 });
    expect(commissionBasis({}, { catalogPrice: 40, addonTotal: 5 })).toEqual({ service: 45, product: 0 });
    expect(commissionBasis({ servicePrice: "0" }, { catalogPrice: 40 }).service).toBe(0);
  });

  test("garbage numbers are treated as zero", () => {
    expect(commissionBasis({ serviceRevenue: "abc", productRevenue: null })).toEqual({ service: 0, product: 0 });
  });
});

describe("commissionAmount", () => {
  test("service basis at the service rate, product basis at the product rate", () => {
    const r = commissionAmount({ service: 75, product: 20 }, "50", "10");
    expect(r.service).toBe(37.5);
    expect(r.product).toBe(2);
    expect(r.total).toBe(39.5);
  });

  test("the Cindy example: $65 Gel X + $10 Chrome at 50% is $37.50", () => {
    expect(commissionAmount(commissionBasis({ serviceRevenue: 75, productRevenue: 0 }), 50, 15).total).toBe(37.5);
  });

  test("a zero product rate pays nothing on products", () => {
    expect(commissionAmount({ service: 0, product: 30 }, 50, 0).total).toBe(0);
  });
});
