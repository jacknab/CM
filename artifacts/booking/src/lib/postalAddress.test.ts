import { describe, expect, it } from "vitest";
import { postalPlain, postalStreet } from "./postalAddress";

describe("postal address lines on a paycheck (2026-10-24)", () => {
  it("writes the street the USPS way", () => {
    expect(postalStreet("1825 Logan St, Apt 305")).toBe("1825 LOGAN ST APT 305");
    expect(postalStreet("1825 Logan Street, Apartment #305")).toBe("1825 LOGAN ST APT 305");
    expect(postalStreet("400 North Main Avenue, Suite 2")).toBe("400 N MAIN AVE STE 2");
    expect(postalStreet("P.O. Box 12")).toBe("PO BOX 12");
  });
  it("keeps names and cities whole, just capitals without punctuation", () => {
    expect(postalPlain("Denver, CO 80203")).toBe("DENVER CO 80203");
    expect(postalPlain("North Las Vegas, NV 89030-1234")).toBe("NORTH LAS VEGAS NV 89030-1234");
    expect(postalPlain("Mary-Jo O'Neil Jr.")).toBe("MARY-JO O'NEIL JR");
  });
});
