import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TechCards } from "./TechCards";

describe("technician card design", () => {
  it("uses the same full card layout on Clocked In and Clocked Out", () => {
    const html = renderToStaticMarkup(createElement(TechCards, {
      techs: [
        { id: 1, name: "Avery", eligible: true, clockedIn: true, turnPosition: 0 },
        { id: 2, name: "Sam", eligible: false, clockedIn: false },
      ],
      tickets: [], markers: [], stats: [{ staffId: 1, doneToday: 3, lastFinishedAt: null, clockedInAt: null }],
      glance: undefined, loading: false, onQueueView: () => {},
    }));
    const clockedOut = html.match(/data-testid="barber-techs-page-out"[\s\S]*?(?=data-testid="barber-techs-page-in")/)?.[0];
    const clockedIn = html.match(/data-testid="barber-techs-page-in"[\s\S]*/)?.[0];
    expect(clockedOut).toContain('data-testid="barber-tech-card-2"');
    expect(clockedIn).toContain('data-testid="barber-tech-card-1"');
    for (const card of [clockedOut, clockedIn]) {
      expect(card).toContain('data-testid="barber-tech-fixed-grid"');
      expect(card).toContain('class="q-detail-ghost-grid q-tech-grid"');
      expect(card).toContain('class="q-unified-main"');
      expect(card).toContain('class="q-unified-footer"');
      expect(card).toContain("Current Service");
      expect(card).toContain("Next Up");
      expect(card).not.toContain('class="tech-grid');
    }
    expect(clockedIn).toContain("CLIENTS TODAY</small><b>3</b>");
    expect(clockedIn).toContain('data-status="available"');
    expect((clockedIn?.match(/class="q-detail-ghost-card"/g) ?? []).length).toBe(15);
  });
});
