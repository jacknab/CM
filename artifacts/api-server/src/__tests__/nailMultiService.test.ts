import { describe, expect, it } from "vitest";
import { priceTicket, sanitizeCustomLines, technicianCanDo, type TicketDeps } from "../lib/nailTickets";

// One ticket holds every service of a visit (owner, 2026-10-21): the further ones are service lines on it.
describe("a ticket's service lines", () => {
  it("keep their service and time; a service may be free, a keypad amount may not", () => {
    expect(sanitizeCustomLines([
      { label: "Deluxe Pedicure", price: 75, serviceId: 12, duration: 50 },
      { label: "Free Polish Change", price: 0, serviceId: 13, duration: 10 },
      { label: "Custom Amount", price: 0 },
      { label: "Custom Amount", price: 5 },
    ])).toEqual([
      { label: "Deluxe Pedicure", price: 75, serviceId: 12, duration: 50 },
      { label: "Free Polish Change", price: 0, serviceId: 13, duration: 10 },
      { label: "Custom Amount", price: 5 },
    ]);
  });

  it("make the ticket long enough for every service (keypad amounts take no time)", () => {
    const p = priceTicket({ serviceDuration: 30, servicePrice: 35, addons: [], customPrice: 75 + 5, customDuration: 50 });
    expect(p).toEqual({ duration: 80, price: 115 });
  });
});

describe("whether the visit's technician can also do another service", () => {
  const deps = (tech: Record<string, unknown> | null) => ({
    getTurnEligibility: async () => ({ technicians: tech ? [{ id: 7, ...tech }] : [], eligibleTechnicians: [] }),
  }) as unknown as TicketDeps;
  const can = (tech: Record<string, unknown> | null) => technicianCanDo(deps(tech), 2, 7, 12);

  it("yes when they're busy with this same client", async () => {
    expect(await can({ clockedIn: true, exclusionReasons: ["currently_busy"] })).toBe(true);
  });
  it("no when they don't do the service, aren't in, are on break or have an appointment coming up", async () => {
    expect(await can({ clockedIn: true, exclusionReasons: ["service_not_supported"] })).toBe(false);
    expect(await can({ clockedIn: false, exclusionReasons: [] })).toBe(false);
    expect(await can({ clockedIn: true, exclusionReasons: ["paused"] })).toBe(false);
    expect(await can({ clockedIn: true, exclusionReasons: ["appointment_within_exclusion_window"] })).toBe(false);
    expect(await can(null)).toBe(false);
  });
});

// A Catalog package on a ticket (owner, 2026-10-21): its price line may be below zero, and only the server keeps one.
describe("a package's price line", () => {
  const lines = [
    { label: "Mani-Pedi package", price: -10, packageId: 4 },
    { label: "Custom Amount", price: 5 },
  ];
  it("is dropped from what a tablet sends", () => {
    expect(sanitizeCustomLines(lines)).toEqual([{ label: "Custom Amount", price: 5 }]);
  });
  it("is kept, with its sign, where the server saved it", () => {
    expect(sanitizeCustomLines(lines, true)).toEqual(lines);
  });
  it("brings the ticket to the package price", () => {
    // Pedicure $40 (the ticket's service) + Manicure $25 (service line) − $10 → Mani-Pedi $55.
    const p = priceTicket({ serviceDuration: 45, servicePrice: 40, addons: [], customPrice: 25 - 10, customDuration: 30 });
    expect(p).toEqual({ duration: 75, price: 55 });
  });
});
