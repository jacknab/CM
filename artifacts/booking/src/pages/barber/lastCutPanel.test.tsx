import { afterEach, describe, expect, it, vi } from "vitest";
// TicketPopup needs only ticketNo from barberApi; the real module starts the offline sync engine (browser only).
vi.mock("./barberApi", () => ({ ticketNo: (t: { ticketNumber: number | null; id: number }) => String(t.ticketNumber ?? t.id) }));
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LastCutView, type LastCutState } from "./LastCutPanel";
import { ReferencesView } from "./HairstyleReferences";
import { MarkerPopup } from "./MarkerPopup";
import { TicketPopup } from "./TicketPopup";
import { primeFormulasEnabled, type FormulaVersion } from "./haircutFormulaApi";

afterEach(() => primeFormulasEnabled(null));

const version: FormulaVersion = {
  id: 3001, formulaId: 4001, versionNumber: 2, clientId: 7301, appointmentId: 6301, staffId: 8301, staffName: "Marcus", visitAt: "2026-10-20T15:30:00Z",
  spec: { v: 1, sides: { guard: ["#1"] }, fade: { type: "skin", height: "mid" }, top: { length: { value: 2, unit: "in" }, technique: ["scissor"] },
    neckline: { shape: ["tapered"] }, sideburns: { length: "short" }, beard: { guard: "#2", lineUp: true }, instructions: "Keep the crown full" },
  templateId: 5301, hairstyleName: "Mid Skin Fade", categoryName: "Fades and Tapers", notes: null, source: "checkout", correctsVersionId: null, createdAt: "2026-10-20T15:31:00Z",
};
const ready = (over: Partial<Extract<LastCutState, { status: "ready" }>> = {}): LastCutState =>
  ({ status: "ready", clientId: 7301, latest: version, today: null, images: [], ...over });
const html = (el: ReactElement) => renderToStaticMarkup(el);
const NO_CONTROLS = /Repeat Last Cut|Edit|Save|role="tablist"|Today&#x27;s cut/;

describe("Last Cut Formula panel (read-only)", () => {
  it("shows the previous haircut: style, every section, notes and the date", () => {
    const out = html(<LastCutView state={ready()} />);
    expect(out).toContain("Mid Skin Fade");
    for (const s of ["Sides", "#1", "Fade", "Skin fade", "Mid height", "Top", "2 in", "Scissor", "Neckline", "Tapered", "Sideburns", "Short", "Beard", "#2", "Line up", "Barber notes", "Keep the crown full", "Last haircut", "Marcus"]) {
      expect(out).toContain(s);
    }
    expect(out).toMatch(/Oct 20, 2026/);
  });
  it("has no repeat, edit, save or formula-choice controls", () => {
    expect(html(<LastCutView state={ready({ images: [{ view: "front", url: "https://r2/x.webp", altText: null }] })} />)).not.toMatch(NO_CONTROLS);
  });
  it("says so when there is no previous haircut (and never shows today's record as the previous one)", () => {
    expect(html(<LastCutView state={ready({ latest: null })} />)).toContain("No previous haircut formula.");
    expect(html(<LastCutView state={ready({ latest: null, today: version })} />)).toContain("No previous haircut formula.");
    expect(html(<LastCutView state={{ status: "ready", clientId: null, latest: null, today: null, images: [] }} />)).toContain("No previous haircut formula.");
  });
  it("shows the loading and error states (with a retry)", () => {
    expect(html(<LastCutView state={{ status: "loading" }} />)).toContain("Loading the last haircut");
    const err = html(<LastCutView state={{ status: "error", message: "Could not reach the haircut formula service." }} onRetry={() => {}} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain("Try again");
  });
  it("shows only the approved reference images it is given, marked as illustrations", () => {
    const withImages = html(<LastCutView state={ready({ images: [{ view: "front", url: "https://r2.example/hairstyles/5301/front-1.webp", altText: null }] })} />);
    expect(withImages).toContain("hairstyles/5301/front-1.webp");
    expect(withImages).toContain("not a photo of this client");
    expect(withImages.match(/<img /g)?.length).toBe(1);
    expect(html(<LastCutView state={ready()} />)).not.toContain("<img");
  });
});

describe("reference viewer", () => {
  it("offers only the views that have approved images and labels them as illustrations", () => {
    const out = html(<ReferencesView view={null} onView={() => {}} onClose={() => {}} style={{
      id: 5301, slug: "mid-skin-fade", name: "Mid Skin Fade", scope: "global", category: { slug: "fades-and-tapers", name: "Fades and Tapers" },
      description: null, defaultSpec: { v: 1 }, images: [{ view: "front", url: "https://r2/f.webp", altText: null }, { view: "back", url: "https://r2/b.webp", altText: null }],
    }} />);
    expect(out).toContain("Illustrative reference of the style — not a photo of this client.");
    expect(out).toMatch(/data-testid="lcf-view-left"[^>]*disabled|disabled[^>]*data-testid="lcf-view-left"/);
    expect(out).toContain("https://r2/f.webp");
    expect(out).not.toContain("https://r2/b.webp"); // one view at a time
  });
});

const marker = { id: 55, ticketNumber: 12, clientId: 7301, clientName: "Andre Jones", phone: null, createdAt: "2026-11-12T14:00:00Z" };

describe("queue popup", () => {
  it("switch on: buttons on the left, the full-height panel on the right", () => {
    primeFormulasEnabled(true);
    const out = html(<MarkerPopup marker={marker} busy={false} onAssign={() => {}} onCancelCheckin={() => {}} onClose={() => {}} />);
    expect(out).toContain("mp-card-lcf");
    expect(out).toContain('data-testid="lcf-panel"');
    for (const id of ["barber-marker-assign", "barber-marker-cancel", "barber-marker-close"]) expect(out).toContain(id);
    expect(out.indexOf("barber-marker-assign")).toBeLessThan(out.indexOf("lcf-panel")); // left, then right
    expect(out).not.toMatch(NO_CONTROLS);
  });
  it("switch off: today's Quick Notes popup, no formula panel", () => {
    primeFormulasEnabled(false);
    const out = html(<MarkerPopup marker={marker} busy={false} onAssign={() => {}} onCancelCheckin={() => {}} onClose={() => {}} />);
    expect(out).not.toContain("lcf-panel");
    expect(out).not.toContain("mp-card-lcf");
    expect(out).toContain("barber-marker-assign");
  });
  it("switch not known yet: also today's popup", () => {
    const out = html(<MarkerPopup marker={marker} busy={false} onAssign={() => {}} onCancelCheckin={() => {}} onClose={() => {}} />);
    expect(out).not.toContain("lcf-panel");
  });
});

const ticket: any = {
  id: 6310, ticketNumber: 31, status: "confirmed", date: "2026-11-12T15:00:00Z", startedAt: null, doneAt: null, duration: 30, actualMinutes: null, total: 35,
  client: { id: 7301, name: "Andre Jones", phone: "5551234567", loyaltyPoints: 0 }, service: { id: 1, name: "Skin Fade", price: 35 },
  staff: { id: 8301, name: "Marcus", color: "#3f6ea3" }, addons: [], nail: null, customLines: [], offline: false,
};
const ticketProps = { ticket, busy: false, onStart: () => {}, onCheckout: () => {}, onReassign: () => {}, onEdit: () => {}, onCancel: () => {}, onClose: () => {} };

describe("ticket popup", () => {
  it("switch on: details and the dock stay; the read-only panel sits on the right", () => {
    primeFormulasEnabled(true);
    const out = html(<TicketPopup {...ticketProps} />);
    expect(out).toContain("ticket-popup-lcf");
    expect(out).toContain('data-testid="ticket-popup-last-cut"');
    for (const id of ["barber-dock-start", "barber-dock-checkout", "barber-dock-reassign", "barber-dock-ticket", "barber-dock-cancel"]) expect(out).toContain(id);
    expect(out).toContain("Skin Fade");
    expect(out).not.toContain("ticket-popup-repeat-formula");
    expect(out.slice(out.indexOf("ticket-popup-last-cut"))).not.toMatch(/Repeat Last Cut|Edit Formula|Save/);
  });
  it("switch off: exactly the existing popup (no panel, same dock)", () => {
    primeFormulasEnabled(false);
    const out = html(<TicketPopup {...ticketProps} />);
    expect(out).not.toContain("lcf-");
    expect(out).not.toContain("ticket-popup-lcf");
    for (const id of ["barber-dock-start", "barber-dock-checkout", "barber-dock-reassign", "barber-dock-ticket", "barber-dock-cancel"]) expect(out).toContain(id);
  });
});
