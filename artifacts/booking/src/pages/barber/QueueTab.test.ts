import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The salon's feature switches (the Booking System hides the Appointments tile).
const flags = vi.hoisted(() => ({ bookingSystem: true }));
vi.mock("@/hooks/use-features", () => ({ useFeatureFlags: () => flags }));

import { Glance, QueueTab } from "./QueueTab";
import type { BoardMarker, BoardTicket } from "./barberApi";

const marker = (id: number): BoardMarker => ({
  id, clientId: id, clientName: `Guest ${id}`, phone: null, ticketNumber: id,
  createdAt: `2026-09-29T${String(12 + Math.floor(id / 60)).padStart(2, "0")}:${String(id % 60).padStart(2, "0")}:00Z`,
});

const ticket = (id: number, ticketNumber: number, status: BoardTicket["status"]): BoardTicket => ({
  id, ticketNumber, status, date: "2026-09-29T12:00:00Z", checkedInAt: "2026-09-29T12:00:00Z",
  startedAt: status === "started" ? "2026-09-29T12:05:00Z" : null, duration: 45,
  client: { id, name: `Client ${id}`, phone: null, loyaltyPoints: 0 }, service: { id: 1, name: "Gel Mani", price: 40 },
  addons: [], nail: null, customLines: [], staff: status === "started" ? { id: 9, name: "Mia Joy", color: null } : null, total: 40,
});

const render = (markers: BoardMarker[], tickets: BoardTicket[] = []) => renderToStaticMarkup(createElement(QueueTab, {
  techs: [], tickets, markers, dayBookings: [], glance: undefined,
  onTicket: () => {}, onAssignTicket: () => {}, onMarker: () => {}, onTechs: () => {},
}));

describe("waiting queue fixed grid", () => {
  it("uses the 8-slot card grid, keeping placeholders visible beside the first client", () => {
    const html = render([marker(1)]);
    const firstPage = html.split('data-testid="barber-queue-page-waiting-0"')[1]?.split('data-testid="barber-queue-page-service"')[0];
    expect(firstPage).toContain('data-testid="barber-queue-wait-grid"');
    expect(firstPage).toContain('data-testid="barber-queue-wait-marker-1"');
    expect(firstPage).toContain('data-testid="barber-queue-spotlight-action"');
    expect((firstPage?.match(/class="q-detail-ghost-card"/g) ?? []).length).toBe(7);
    expect(firstPage).not.toContain('class="q-spotlight-wrap"');
  });

  it("keeps extra clients on the next swipeable page rather than shrinking cards", () => {
    const html = render(Array.from({ length: 9 }, (_, i) => marker(i + 1)));
    const firstPage = html.split('data-testid="barber-queue-page-waiting-0"')[1]?.split('data-testid="barber-queue-page-waiting-1"')[0];
    const secondPage = html.split('data-testid="barber-queue-page-waiting-1"')[1]?.split('data-testid="barber-queue-page-service"')[0];
    expect((firstPage?.match(/data-testid="barber-queue-wait-marker-\d+"/g) ?? []).length).toBe(8);
    expect(secondPage).toContain('data-testid="barber-queue-wait-marker-9"');
    expect((secondPage?.match(/class="q-detail-ghost-card"/g) ?? []).length).toBe(7);
  });

  it("keeps waiting and in-service clients together in ticket-number order", () => {
    const html = render([marker(7)], [ticket(101, 9, "started"), ticket(102, 3, "confirmed"), ticket(103, 5, "started")]);
    const order = [...html.matchAll(/data-testid="(barber-queue-(?:wait|service)-(?:marker-)?\d+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["barber-queue-wait-102", "barber-queue-service-103", "barber-queue-wait-marker-7", "barber-queue-service-101"]);
    expect(html).toContain('data-state="service"');
  });

  it("shows UP NEXT on exactly one card, the lowest-numbered waiting client, across every page", () => {
    const html = render(Array.from({ length: 20 }, (_, i) => marker(i + 1)), [ticket(500, 0, "started")]);
    expect((html.match(/>UP NEXT</g) ?? []).length).toBe(1);
    expect((html.match(/data-testid="barber-queue-spotlight-action"/g) ?? []).length).toBe(1);
  });
});

describe("the glance strip with the booking system switched off", () => {
  it("has no Appointments tile (the upcoming list); the rest stay", () => {
    const strip = () => renderToStaticMarkup(createElement(Glance, { waitLabel: "5 min", checkedIn: 1, inService: 2, clockedInTechs: 3,
      glance: { appointments: 4, walkIns: 5, noShows: 0, completed: 6, avgTicket: 40 } as any }));
    flags.bookingSystem = true;
    expect(strip()).toContain("Appointments");
    flags.bookingSystem = false;
    expect(strip()).not.toContain("Appointments");
    expect(strip()).toContain("Walk-ins");
    flags.bookingSystem = true;
  });
});
