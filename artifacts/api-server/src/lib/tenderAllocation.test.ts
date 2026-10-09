import { describe, expect, it } from "vitest";
import { allocateTenders, type TenderRow } from "./tenderAllocation";

const at = (min: number) => new Date(Date.UTC(2026, 8, 30, 18, min));
const row = (id: number, totalPaid: number, paymentMethod: string | null, min = 0): TenderRow =>
  ({ id, totalPaid: totalPaid.toFixed(2), paymentMethod, date: at(min) });

describe("allocateTenders", () => {
  it("takes cash change back out of the drawer", () => {
    // $43 ticket paid with a $50 bill: $7 change went back to the client.
    expect(allocateTenders([row(1, 43, "cash:50.00")]).get(1)).toEqual({ cash: 43 });
  });

  it("keeps card at face value and nets change from cash on a mixed payment", () => {
    // $60 ticket: $20 on card, $50 cash handed over, $10 change.
    expect(allocateTenders([row(1, 60, "card:20.00,cash:50.00")]).get(1)).toEqual({ card: 20, cash: 40 });
  });

  it("splits a group payment across its tickets instead of counting the whole tender on each", () => {
    const out = allocateTenders([
      row(1, 60, "cash:100.00,card:50.00"),
      row(2, 90, "cash:100.00,card:50.00"),
    ]);
    expect(out.get(1)).toEqual({ cash: 40, card: 20 });
    expect(out.get(2)).toEqual({ cash: 60, card: 30 });
  });

  it("handles a group payment that also gave change", () => {
    // Two tickets totalling $90, paid with $100 cash → $10 change.
    const out = allocateTenders([row(1, 40, "cash:100.00"), row(2, 50, "cash:100.00", 1)]);
    expect(out.get(1)!.cash + out.get(2)!.cash).toBe(90);
  });

  it("does not merge two separate checkouts whose tender strings happen to match", () => {
    const out = allocateTenders([row(1, 43, "cash:50.00"), row(2, 45, "cash:50.00", 1)]);
    expect(out.get(1)).toEqual({ cash: 43 });
    expect(out.get(2)).toEqual({ cash: 45 });
  });

  it("does not merge matching tickets checked out far apart", () => {
    const out = allocateTenders([row(1, 20, "card:20.00"), row(2, 20, "card:20.00", 30)]);
    expect(out.get(1)).toEqual({ card: 20 });
    expect(out.get(2)).toEqual({ card: 20 });
  });

  it("gives the whole ticket to a legacy method with no amounts, and treats a missing method as card", () => {
    const out = allocateTenders([row(1, 35, "cash"), row(2, 20, null)]);
    expect(out.get(1)).toEqual({ cash: 35 });
    expect(out.get(2)).toEqual({ card: 20 });
  });

  it("does not let a $0 tender part claim the whole ticket", () => {
    expect(allocateTenders([row(1, 35, "cash:0.00,card:35.00")]).get(1)).toEqual({ cash: 0, card: 35 });
  });
  it("works when the checkout time arrives as text (a computed SQL column), as Day Close gets it", () => {
    // Two itemised tickets is what makes the sort run — this used to throw and fail every Day Close.
    const rows = [
      { id: 1, totalPaid: "127.00", paymentMethod: "m2:1.15,cash:125.85", date: "2026-09-30 10:50:01.465891+00" },
      { id: 2, totalPaid: "25.00", paymentMethod: "cash:25.00", date: "2026-10-01 18:02:11+00" },
    ] as unknown as TenderRow[];
    const out = allocateTenders(rows);
    expect(out.get(1)).toEqual({ m2: 1.15, cash: 125.85 });
    expect(out.get(2)).toEqual({ cash: 25 });
  });
});
