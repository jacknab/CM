import { describe, expect, it } from "vitest";
import { boardAfterCloseSQL, findEarliestCompatibleWaitingClient, isFrontDeskId, nextTechnicianForCategory, priceTicket, sanitizeCustomLines, staffScreenAllowed } from "../lib/nailTickets";

describe("nail board Day Close boundary", () => {
  it("uses checkout time for completed visits, not the scheduled appointment time", () => {
    const sql = boardAfterCloseSQL("a");
    expect(sql).toContain("a.status = 'completed' THEN a.completed_at > $3::timestamptz");
  });

  it("does not carry pre-close walk-ins forward just because their appointment was scheduled later", () => {
    const sql = boardAfterCloseSQL("a");
    expect(sql).toContain("THEN (a.created_at AT TIME ZONE 'UTC') > $3::timestamptz");
    expect(sql).toContain("ELSE a.date > $3::timestamptz");
  });
});

describe("sanitizeCustomLines", () => {
  it("keeps valid lines, trims labels, rounds to the cent", () => {
    expect(sanitizeCustomLines([{ label: "  Repair  ", price: 12.345 }, { price: 5 }])).toEqual([
      { label: "Repair", price: 12.35 },
      { label: "Custom Amount", price: 5 },
    ]);
  });
  it("drops junk, zero/negative and absurd amounts", () => {
    expect(sanitizeCustomLines([{ label: "x", price: 0 }, { label: "x", price: -3 }, { label: "x", price: "abc" }, { label: "x", price: 10000 }, null])).toEqual([]);
    expect(sanitizeCustomLines("nope")).toEqual([]);
    expect(sanitizeCustomLines(undefined)).toEqual([]);
  });
  it("caps at 20 lines", () => {
    expect(sanitizeCustomLines(Array.from({ length: 30 }, () => ({ label: "a", price: 1 })))).toHaveLength(20);
  });
});

describe("priceTicket with custom amounts", () => {
  it("adds custom money to the price but no time", () => {
    const base = priceTicket({ serviceDuration: 45, servicePrice: 40, addons: [{ duration: 10, price: 5 }] });
    const withCustom = priceTicket({ serviceDuration: 45, servicePrice: 40, addons: [{ duration: 10, price: 5 }], customPrice: 12.5 });
    expect(withCustom.duration).toBe(base.duration);
    expect(withCustom.price).toBeCloseTo(base.price + 12.5, 2);
  });
});

describe("findEarliestCompatibleWaitingClient", () => {
  const manicure = 10;
  const pedicure = 20;
  const nailArt = 30;

  it("does not match a pedicure-only technician to a manicure client", () => {
    const queue = [{ id: 1, requiredServiceIds: [manicure] }];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]))).toBeNull();
  });

  it("skips an incompatible client and matches the first later compatible client", () => {
    const queue = [
      { id: 1, requiredServiceIds: [manicure] },
      { id: 2, requiredServiceIds: [pedicure] },
    ];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]))?.id).toBe(2);
  });

  it("matches a manicure technician to a manicure client", () => {
    const queue = [{ id: 1, requiredServiceIds: [manicure] }];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([manicure]))?.id).toBe(1);
  });

  it("requires every qualification-bearing service for a multiple-service client", () => {
    const queue = [{ id: 1, requiredServiceIds: [manicure, nailArt] }];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([manicure]))).toBeNull();
    expect(findEarliestCompatibleWaitingClient(queue, new Set([manicure, nailArt]))?.id).toBe(1);
  });

  it("does not mutate or reorder incompatible clients", () => {
    const queue = [
      { id: 1, requiredServiceIds: [manicure] },
      { id: 2, requiredServiceIds: [pedicure] },
      { id: 3, requiredServiceIds: [manicure] },
    ];
    const before = queue.map((client) => client.id);
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]))?.id).toBe(2);
    expect(queue.map((client) => client.id)).toEqual(before);
  });

  it("leaves the technician unmatched when no compatible client exists", () => {
    const queue = [
      { id: 1, requiredServiceIds: [manicure] },
      { id: 2, requiredServiceIds: [nailArt] },
    ];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]))).toBeNull();
  });

  it("keeps existing TURN or station constraints in addition to service matching", () => {
    const queue = [
      { id: 1, requiredServiceIds: [pedicure] },
      { id: 2, requiredServiceIds: [pedicure] },
    ];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]), (client) => client.id !== 1)?.id).toBe(2);
  });

  it("ignores clients already assigned to another technician", () => {
    const queue = [
      { id: 1, requiredServiceIds: [pedicure], assignedStaffId: 99 },
      { id: 2, requiredServiceIds: [pedicure], assignedStaffId: null },
    ];
    expect(findEarliestCompatibleWaitingClient(queue, new Set([pedicure]))?.id).toBe(2);
  });
});

describe("staffScreenAllowed — /nail and /barber share the ticket engine, not the door", () => {
  it("lets a barbershop use /api/barber/* only", () => {
    expect(staffScreenAllowed("/api/barber/board?storeId=38", "Barbershop")).toBe(true);
    expect(staffScreenAllowed("/api/nail/board", "Barbershop")).toBe(false);
    expect(staffScreenAllowed("/api/nail/checkout", "Barbershop")).toBe(false);
  });

  it("lets a nail salon use /api/nail/* only", () => {
    expect(staffScreenAllowed("/api/nail/board", "Nail Salon")).toBe(true);
    expect(staffScreenAllowed("/api/barber/board", "Nail Salon")).toBe(false);
    expect(staffScreenAllowed("/api/barber/checkout", "Nail Salon")).toBe(false);
  });

  it("refuses every other business type, and a store with no category, on both", () => {
    for (const category of ["Hair Salon", "Spa", "", null, undefined]) {
      expect(staffScreenAllowed("/api/nail/board", category)).toBe(false);
      expect(staffScreenAllowed("/api/barber/board", category)).toBe(false);
    }
  });

  it("treats a missing URL as the nail door", () => {
    expect(staffScreenAllowed(undefined, "Barbershop")).toBe(false);
    expect(staffScreenAllowed(undefined, "Nail Salon")).toBe(true);
  });
});

describe("isFrontDeskId — receptionists sign in with 90–99, the same rule for every salon", () => {
  it("counts 90 to 99 as front desk", () => {
    for (const id of [90, 95, 99]) expect(isFrontDeskId(id)).toBe(true);
  });
  it("counts 1 to 89 as technicians", () => {
    for (const id of [1, 14, 89]) expect(isFrontDeskId(id)).toBe(false);
  });
});

describe("nextTechnicianForCategory — front desk check-in by category", () => {
  // TURN order as the turn system hands it over: already filtered to in / free, already in line order.
  const sarah = { id: 1, name: "Sarah" }, lisa = { id: 2, name: "Lisa" }, maria = { id: 3, name: "Maria" }, anna = { id: 4, name: "Anna" };
  const line = [sarah, lisa, maria, anna];
  const manicure = new Set([1, 3]), pedicure = new Set([2, 3]), waxing = new Set([4]);

  it("gives a manicure to the first manicure technician in line", () => {
    expect(nextTechnicianForCategory(line, manicure)).toBe(sarah);
  });
  it("passes over technicians who don't do pedicures instead of taking the next in line", () => {
    expect(nextTechnicianForCategory(line, pedicure)).toBe(lisa);
  });
  it("matches a waxing client only with a waxing technician", () => {
    expect(nextTechnicianForCategory(line, waxing)).toBe(anna);
  });
  it("leaves the client waiting when no qualified technician is free — never an unqualified one", () => {
    expect(nextTechnicianForCategory([sarah], pedicure)).toBeNull();
    expect(nextTechnicianForCategory(line, new Set<number>())).toBeNull();
    expect(nextTechnicianForCategory([], manicure)).toBeNull();
  });
  it("keeps the turn system's order and does not touch the line it was given", () => {
    const rotated = [maria, anna, sarah, lisa];
    const before = [...rotated];
    expect(nextTechnicianForCategory(rotated, manicure)).toBe(maria);
    expect(nextTechnicianForCategory(rotated, pedicure)).toBe(maria);
    expect(rotated).toEqual(before);
  });
});
