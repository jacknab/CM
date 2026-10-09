import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TurnEarnedPopup, turnTitle } from "./TurnEarnedPopup";

describe("turn earned popup", () => {
  it("names what the ticket earned", () => {
    expect(turnTitle({ mode: "dollar", earned: 0.5 })).toBe("HALF TURN");
    expect(turnTitle({ mode: "dollar", earned: 1 })).toBe("FULL TURN");
    expect(turnTitle({ mode: "dollar", earned: 2 })).toBe("2 TURNS");
    expect(turnTitle({ mode: "classic", earned: 0 })).toBe("SHORT TURN");
  });

  it("shows the technician, the figure and the ticket", () => {
    const html = renderToStaticMarkup(createElement(TurnEarnedPopup, {
      turns: [{ appointmentId: 7, ticketNumber: 12, staffName: "Mia Joy", mode: "dollar", earned: 0.5, serviceAmount: 25 }], onDone: () => {},
    }));
    expect(html).toContain("Mia Joy");
    expect(html).toContain("½");
    expect(html).toContain("HALF TURN");
    expect(html).toContain("Ticket #12 · $25.00 in services");
  });
});
