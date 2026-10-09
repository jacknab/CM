import { describe, expect, it } from "vitest";
import { paidByCard, ruleDeductionsFor, type DeductionRule } from "../lib/payrollDeductions";

const rule = (r: Partial<DeductionRule>): DeductionRule => ({ id: 1, name: "Fee", type: "fixed", amount: "0", appliesTo: "all", staffId: null, ...r });

describe("ruleDeductionsFor — recurring payroll deductions", () => {
  const cardFee = rule({ id: 1, name: "CC Processing Fee", type: "percentage", amount: "1.45" });
  const supply = rule({ id: 2, name: "Supply Fee", type: "fixed", amount: "12.00" });

  it("takes a percentage of commission and a flat amount", () => {
    const r = ruleDeductionsFor([cardFee, supply], { staffId: 7, commission: 270 });
    expect(r.detail).toEqual([{ ruleId: 1, name: "CC Processing Fee", amount: 3.92 }, { ruleId: 2, name: "Supply Fee", amount: 12 }]);
    expect(r.total).toBe(15.92);
  });

  it("charges nobody for a period with no commission", () => {
    expect(ruleDeductionsFor([cardFee, supply], { staffId: 7, commission: 0 })).toEqual({ total: 0, detail: [] });
  });

  it("applies a one-person rule only to that person", () => {
    const rent = rule({ id: 3, name: "Booth Rent", amount: "150", appliesTo: "specific", staffId: 4 });
    expect(ruleDeductionsFor([rent], { staffId: 4, commission: 500 }).total).toBe(150);
    expect(ruleDeductionsFor([rent], { staffId: 5, commission: 500 }).total).toBe(0);
  });

  it("skips a one-person rule that has no staff member, and junk amounts", () => {
    const orphan = rule({ id: 4, amount: "20", appliesTo: "specific", staffId: null });
    const junk = rule({ id: 5, amount: "abc" });
    expect(ruleDeductionsFor([orphan, junk], { staffId: 5, commission: 100 }).total).toBe(0);
  });
});

describe("card fee on tips", () => {
  const fee = rule({ id: 9, name: "CC Processing Fee", type: "card_tips", amount: "2.9", perTransaction: "0.30" });

  it("charges a percentage of each card tip plus the flat fee per transaction", () => {
    // $10.00 → 0.29 + 0.30 = 0.59; $20.00 → 0.58 + 0.30 = 0.88
    expect(ruleDeductionsFor([fee], { staffId: 1, commission: 300, cardTips: [10, 20] }).total).toBe(1.47);
  });

  it("charges nothing without card tips, whatever the commission", () => {
    expect(ruleDeductionsFor([fee], { staffId: 1, commission: 300, cardTips: [] }).total).toBe(0);
    expect(ruleDeductionsFor([fee], { staffId: 1, commission: 300 }).total).toBe(0);
  });

  it("still applies in a period with tips but no commission, and never takes more than the tip", () => {
    expect(ruleDeductionsFor([fee], { staffId: 1, commission: 0, cardTips: [0.15] }).total).toBe(0.15);
  });

  it("knows a card payment from cash and gift cards", () => {
    for (const pm of ["card:25.00", "m2", "m2:45.00,cash:10.00", "tap_to_pay", "cash:5.00,tap:20.00"]) expect(paidByCard(pm)).toBe(true);
    for (const pm of ["cash:30.00", "cash:10.00,gift:20.00", "", null, undefined]) expect(paidByCard(pm)).toBe(false);
  });
});
