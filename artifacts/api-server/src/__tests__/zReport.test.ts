import { describe, expect, test } from "vitest";
import { aggregate, type ApptRow } from "../lib/zReport";

const row = (over: Partial<ApptRow>): ApptRow => ({
  id: 1, staffId: 1, serviceId: 1, status: "completed", date: new Date("2026-09-24T20:00:00Z"),
  totalPaid: "0", tipAmount: "0", discountAmount: "0", servicePrice: null,
  serviceRevenue: null, productRevenue: null, commissionRate: null, paymentMethod: "cash",
  ...over,
});

const staffById = new Map([
  [1, { name: "Amy", commissionRate: 60, productCommissionRate: 40, commissionEnabled: true }],
  [2, { name: "Linda", commissionRate: 55, productCommissionRate: 40, commissionEnabled: true }],
]);
const categoryByServiceId = new Map([[1, "Manicures"], [2, "Pedicures"]]);
const svcPriceById = new Map([[1, 50], [2, 60]]);

function agg(rows: ApptRow[], addonRevByAppt = new Map<number, number>()) {
  return aggregate({ rows, staffById, categoryByServiceId, addonRevByAppt, svcPriceById });
}

describe("zReport aggregate — financial summary invariants", () => {
  test("gross - discounts = net, and totalCollected = net + tips (no tax)", () => {
    // subtotal $100, $10 discount, $15 tip -> total paid = 100-10+15 = 105
    const r = agg([row({ totalPaid: "105", tipAmount: "15", discountAmount: "10" })]);
    expect(r.grossSales).toBe(100);
    expect(r.discounts).toBe(10);
    expect(r.netSales).toBe(90);
    expect(r.totalPaidSum).toBe(105);
    // net + tips must equal totalPaid when tax is always 0
    expect(r.netSales + r.tips).toBe(r.totalPaidSum);
  });

  test("avgTicket is net sales divided by ticket count, matching the spec's worked example shape", () => {
    const r = agg([
      row({ id: 1, totalPaid: "50", discountAmount: "0", tipAmount: "0" }),
      row({ id: 2, totalPaid: "40", discountAmount: "0", tipAmount: "0" }),
    ]);
    expect(r.tickets).toBe(2);
    expect(r.avgTicket).toBe(45);
  });

  test("only completed, paid appointments count — pending/cancelled/no-show and $0 tickets are excluded", () => {
    const r = agg([
      row({ id: 1, status: "cancelled", totalPaid: "50" }),
      row({ id: 2, status: "completed", totalPaid: "0" }),
      row({ id: 3, status: "completed", totalPaid: "40" }),
    ]);
    expect(r.tickets).toBe(1);
    expect(r.totalPaidSum).toBe(40);
  });
});

describe("zReport aggregate — payment breakdown", () => {
  test("splits a compound cash+card ticket into its tender amounts", () => {
    const r = agg([row({ totalPaid: "35", paymentMethod: "cash:20.00,card:15.00" })]);
    expect(r.paymentBreakdown.cash).toBe(20);
    expect(r.paymentBreakdown.card).toBe(15);
  });

  test("classifies a ticket's whole tip as cash or card by whether cash appears in its tender string", () => {
    const r = agg([
      row({ id: 1, totalPaid: "50", tipAmount: "10", paymentMethod: "cash" }),
      row({ id: 2, totalPaid: "50", tipAmount: "8", paymentMethod: "m2" }),
    ]);
    expect(r.cashTips).toBe(10);
    expect(r.cardTips).toBe(8);
  });
});

describe("zReport aggregate — commission (must match @shared/commissionBasis exactly)", () => {
  test("frozen serviceRevenue/commissionRate on the ticket wins over the staff member's CURRENT rate", () => {
    // Amy's current rate is 60%, but this ticket was completed when she was at 50% — the
    // historical commission must stay 50%, proving a later rate change can't rewrite it.
    const r = agg([row({ staffId: 1, serviceRevenue: "100", productRevenue: "0", commissionRate: "50", totalPaid: "100" })]);
    const amy = r.staffAgg.get(1)!;
    expect(amy.serviceCommission).toBe(50); // 100 * 50%, NOT 100 * 60%
  });

  test("falls back to the staff member's current rate only when no rate was frozen on the ticket", () => {
    const r = agg([row({ staffId: 1, serviceRevenue: "100", productRevenue: "0", commissionRate: null, totalPaid: "100" })]);
    expect(r.staffAgg.get(1)!.serviceCommission).toBe(60); // Amy's current 60% rate
  });

  test("commission basis is pre-discount — a discount never reduces what staff earn", () => {
    const r = agg([row({ staffId: 1, serviceRevenue: "100", commissionRate: "60", discountAmount: "30", totalPaid: "70" })]);
    expect(r.staffAgg.get(1)!.serviceCommission).toBe(60); // 100 * 60%, discount ignored
  });

  test("retail product revenue is commissioned at the product rate, service revenue at the service rate", () => {
    const r = agg([row({ staffId: 1, serviceRevenue: "80", productRevenue: "20", commissionRate: "60", totalPaid: "100" })]);
    const amy = r.staffAgg.get(1)!;
    expect(amy.serviceCommission).toBe(48); // 80 * 60%
    expect(amy.productCommission).toBe(8);  // 20 * 40% (Amy's product rate)
  });

  test("a staff member with commissionEnabled=false earns nothing regardless of their stored rate", () => {
    const disabledStaff = new Map([[3, { name: "Trainee", commissionRate: 50, productCommissionRate: 50, commissionEnabled: false }]]);
    const r = aggregate({
      rows: [row({ staffId: 3, serviceRevenue: "100", commissionRate: "50", totalPaid: "100" })],
      staffById: disabledStaff, categoryByServiceId, addonRevByAppt: new Map(), svcPriceById,
    });
    expect(r.staffAgg.get(3)!.serviceCommission).toBe(0);
  });
});

describe("zReport aggregate — service category revenue", () => {
  test("groups service revenue by category and separates out add-on revenue", () => {
    const addonRev = new Map([[1, 20]]);
    const r = agg([row({ id: 1, serviceId: 1, serviceRevenue: "120", productRevenue: "0", totalPaid: "120" })], addonRev);
    // 120 total service-basis revenue, 20 of which is add-ons -> 100 stays under the category, 20 goes to Add-ons
    expect(r.categoryRevenue["Manicures"]).toBe(100);
    expect(r.addonRevenueTotal).toBe(20);
  });

  test("a service with no category falls under Uncategorized rather than being dropped", () => {
    const r = agg([row({ serviceId: 99, serviceRevenue: "40", totalPaid: "40" })]);
    expect(r.categoryRevenue["Uncategorized"]).toBe(40);
  });
});
