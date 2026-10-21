import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TurnEarnedPopup, turnTitle } from "./TurnEarnedPopup";

describe("turn earned popup", () => {
  it("names what the ticket earned", () => {
    expect(turnTitle({ mode: "dollar", earned: 0.5, serviceAmount: 25 })).toBe("HALF TURN");
    expect(turnTitle({ mode: "dollar", earned: 1, serviceAmount: 45 })).toBe("FULL TURN");
    expect(turnTitle({ mode: "dollar", earned: 2, serviceAmount: 60 })).toBe("2 TURNS");
    expect(turnTitle({ mode: "classic", earned: 0, serviceAmount: 0 })).toBe("SHORT TURN");
  });

  it("shows the technician, the figure and the ticket", () => {
    const html = renderToStaticMarkup(createElement(TurnEarnedPopup, {
      turns: [{ appointmentId: 7, ticketNumber: 12, staffName: "Mia Joy", mode: "dollar", earned: 0.5, serviceAmount: 25 }], onDone: () => {},
    }));
    expect(html).toContain("Mia Joy");
    expect(html).toContain("1/2");
    expect(html).toContain("HALF TURN");
    expect(html).toContain("Ticket #12 · $25.00 in services");
  });

  it("shows a counted short turn as 1/2 after checkout", () => {
    const html = renderToStaticMarkup(createElement(TurnEarnedPopup, {
      turns: [{ appointmentId: 8, ticketNumber: 13, staffName: "Mia Joy", mode: "classic", earned: 0.5, serviceAmount: 20 }], onDone: () => {},
    }));
    expect(html).toContain("1/2");
    expect(html).toContain("HALF TURN");
    expect(html).not.toContain(">0</span>");
  });

  it("shows 1/2 for a positive paid service when checkout reports zero turns", () => {
    const html = renderToStaticMarkup(createElement(TurnEarnedPopup, {
      turns: [{ appointmentId: 9, ticketNumber: 14, staffName: "Mia Joy", mode: "dollar", earned: 0, serviceAmount: 20 }], onDone: () => {},
    }));
    expect(html).toContain('data-earned="0.5"');
    expect(html).toContain("1/2");
    expect(html).toContain("HALF TURN");
    expect(html).not.toContain(">0</span>");
  });
});
