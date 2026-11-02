import { describe, expect, it } from "vitest";
import { barberWords } from "./barberWords";

describe("a barbershop's words for text shared with /nail", () => {
  it("says barber, never technician or tech", () => {
    expect(barberWords("Technicians take walk-ins one after another. The technician with the fewest clients is next."))
      .toBe("Barbers take walk-ins one after another. The barber with the fewest clients is next.");
    expect(barberWords("Ask for a Tech ID · Techs")).toBe("Ask for a Barber ID · Barbers");
    expect(barberWords("Counted Turns")).toBe("Counted Turns");
  });
});
