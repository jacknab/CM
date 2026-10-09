import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

/**
 * The checkout's "same sale" fingerprint (lib/nailCheckoutSettlement.ts) must not change when the time the
 * cash was collected is added: one checkout can be tried online first (no time) and arrive again later from
 * a tablet's offline queue (with it). If the fingerprint differed, the server would refuse the second copy
 * with "key already used with different details" even though the sale had closed.
 */
const fingerprint = (a: Record<string, unknown>) => {
  const { collectedAt, ...sameSale } = a;
  void collectedAt;
  return createHash("sha256").update(JSON.stringify(sameSale)).digest("hex");
};

describe("checkout fingerprint", () => {
  const sale = { storeId: 2, appointmentId: 900, idempotencyKey: "k-1234567890abcdef", tip: 0, discount: 0, totalPaid: 45, serviceRevenue: 45, productRevenue: 0, paymentMethod: "cash", tenders: [{ method: "cash", amount: 45 }] };
  it("is the same with and without the collected time", () => {
    expect(fingerprint({ ...sale, collectedAt: new Date("2026-10-09T21:15:00Z") })).toBe(fingerprint(sale));
    expect(fingerprint({ ...sale, collectedAt: null })).toBe(fingerprint(sale));
  });
  it("still changes when the sale itself differs", () => {
    expect(fingerprint({ ...sale, totalPaid: 50 })).not.toBe(fingerprint(sale));
  });
});
