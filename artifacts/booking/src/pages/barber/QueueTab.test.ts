import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueTab } from "./QueueTab";
import type { BoardMarker, BoardTicket } from "./barberApi";

const marker = (id: number): BoardMarker => ({
  id, clientId: id, clientName: `Guest ${id}`, phone: null, ticketNumber: id,
  createdAt: `2026-09-29T${String(12 + Math.floor(id / 60)).padStart(2, "0")}:${String(id % 60).padStart(2, "0")}:00Z`,
});

const ticket = (id: number, ticketNumber: number, status: BoardTicket["status"]): BoardTicket => ({
  id, ticketNumber, status, date: "2026-09-29T12:00:00Z", checkedInAt: "2026-09-29T12:00:00Z",
  startedAt: status === "started" ? "2026-09-29T12:05:00Z" : null, duration: 45,
  client: { id, name: `Client ${id}`, phone: null, loyaltyPoints: 0 }, service: { id: 1, name: "Skin Fade", price: 40 },
  addons: [], nail: null, customLines: [], staff: status === "started" ? { id: 9, name: "Mia Joy", color: null } : null, total: 40,
});

const render = (markers: BoardMarker[], tickets: BoardTicket[] = []) => renderToStaticMarkup(createElement(QueueTab, {
  techs: [], tickets, markers, dayBookings: [], glance: undefined,
  onTicket: () => {}, onAssignTicket: () => {}, onMarker: () => {}, onTechs: () => {},
}));

describe("waiting queue fixed grid", () => {
  it("uses the 16-slot card grid and marks the first waiting client up next", () => {
    const html = render([marker(1)]);
    const firstPage = html.split('data-testid="barber-queue-page-waiting-0"')[1]?.split('data-testid="barber-queue-page-service"')[0];
    expect(firstPage).toContain('data-testid="barber-queue-wait-grid"');
    expect(firstPage).toContain('data-testid="barber-queue-wait-marker-1"');
    expect(firstPage).toContain('data-testid="barber-queue-spotlight-action"');
    expect((firstPage?.match(/class="q-detail-ghost-card"/g) ?? []).length).toBe(15);
    expect(firstPage).not.toContain('class="q-spotlight-wrap"');
  });

  it("keeps extra clients on the next swipeable page rather than shrinking cards", () => {
    const html = render(Array.from({ length: 17 }, (_, i) => marker(i + 1)));
    const firstPage = html.split('data-testid="barber-queue-page-waiting-0"')[1]?.split('data-testid="barber-queue-page-waiting-1"')[0];
    const secondPage = html.split('data-testid="barber-queue-page-waiting-1"')[1]?.split('data-testid="barber-queue-page-service"')[0];
    expect((firstPage?.match(/data-testid="barber-queue-wait-marker-\d+"/g) ?? []).length).toBe(16);
    expect(secondPage).toContain('data-testid="barber-queue-wait-marker-17"');
    expect((secondPage?.match(/class="q-detail-ghost-card"/g) ?? []).length).toBe(15);
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

  it("shows a client a barber has taken as in the chair, with no remove control, though no ticket exists yet", () => {
    const html = renderToStaticMarkup(createElement(QueueTab, {
      techs: [], tickets: [], markers: [{ ...marker(1), staffId: 9, staffName: "Mia Joy" }, marker(2)], dayBookings: [], glance: undefined,
      onTicket: () => {}, onAssignTicket: () => {}, onMarker: () => {}, onMarkerRemove: () => {}, onTechs: () => {},
    }));
    const taken = html.split('data-testid="barber-queue-wait-marker-1"')[1]?.split('data-testid="barber-queue-wait-marker-2"')[0];
    expect(html).toMatch(/data-testid="barber-queue-wait-marker-1" data-state="service"/);
    expect(taken).toContain("Mia Joy");
    expect(taken).not.toContain('data-testid="barber-queue-wait-marker-1-remove"');
    expect(html).toContain('data-testid="barber-queue-wait-marker-2-remove"');
    // the still-waiting client, not the taken one, is up next
    expect(html.split('data-testid="barber-queue-wait-marker-2"')[1]).toContain(">UP NEXT<");
  });
});
