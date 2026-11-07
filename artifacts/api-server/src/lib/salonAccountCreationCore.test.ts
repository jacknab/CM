import { describe, expect, it } from "vitest";
import {
  DRAFT_NAIL_CATALOG,
  internalUnclaimedEmail,
  isSafeExternalWebsite,
  qualifiesSalonMatch,
  SALON_CREATION_DEFAULTS,
  scoreSalonMatch,
  slugBaseForSalon,
  uniqueSlugCandidate,
} from "./salonAccountCreationCore";

describe("salon account creation safeguards", () => {
  it("builds a short lowercase salon slug without punctuation or common legal suffixes", () => {
    expect(slugBaseForSalon("  Élan Nails & Spa, LLC! ")).toBe("elan-nails-and-spa");
    const candidate = uniqueSlugCandidate("Nails @ Dawn, Inc.", 125);
    expect(candidate).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(candidate.length).toBeLessThanOrEqual(30);
    expect(candidate).toContain("nails-dawn");
  });

  it("uses a deterministic source-key suffix to keep slug candidates unique", () => {
    expect(uniqueSlugCandidate("Bella Nails", 100)).not.toBe(uniqueSlugCandidate("Bella Nails", 101));
    expect(uniqueSlugCandidate("Bella Nails", 100, 1)).not.toBe(uniqueSlugCandidate("Bella Nails", 100, 2));
  });

  it("requires both a credible name and address match when both are available", () => {
    const source = { name: "Luxe Nail Bar LLC", address: "120 Main Street, Austin, TX 78701" };
    expect(qualifiesSalonMatch(source, { name: "Luxe Nail Bar", address: "120 Main St, Austin, TX 78701" })).toBe(true);
    expect(qualifiesSalonMatch(source, { name: "Luxe Nail Bar", address: "120 Main St, Dallas, TX 75001" })).toBe(false);
    expect(scoreSalonMatch(source, { name: "Luxe Nail Bar", address: "120 Main St, Austin, TX 78701" })).toBeGreaterThan(0.76);
  });

  it("rejects weak name-only matches and unsafe external website protocols", () => {
    expect(qualifiesSalonMatch({ name: "Pink Nails" }, { name: "Pink Nail Supply" })).toBe(false);
    expect(isSafeExternalWebsite("https://salon.example/" )).toBe("https://salon.example/");
    expect(isSafeExternalWebsite("javascript:alert(1)")).toBeNull();
    expect(isSafeExternalWebsite("not a URL")).toBeNull();
  });

  it("stores no invented owner email and keeps Solo account access locked until claim", () => {
    expect(internalUnclaimedEmail(42)).toBe("salon-source-42@unclaimed.invalid");
    expect(internalUnclaimedEmail(42)).not.toContain("@gmail.com");
    expect(SALON_CREATION_DEFAULTS.userAccountType).toBe("certxa_pro");
  });

  it("maps Who can book online: Nobody to the existing off database value", () => {
    expect(SALON_CREATION_DEFAULTS.onlineBookingMode).toBe("off");
    expect(SALON_CREATION_DEFAULTS.bookingPaymentPolicy).toBe("none");
  });

  it("spaces account creation at 10/hour and 240/day with no synthetic prices", () => {
    expect(SALON_CREATION_DEFAULTS).toMatchObject({ perHour: 10, perDay: 240, spacingMinutes: 6 });
    expect(DRAFT_NAIL_CATALOG.length).toBeGreaterThanOrEqual(8);
    const names = DRAFT_NAIL_CATALOG.map((service) => service.name.toLowerCase()).join(" ");
    for (const required of ["manicure", "pedicure", "gel", "acrylic", "dip powder", "gel x", "nail art", "polish change"]) {
      expect(names).toContain(required);
    }
    expect(DRAFT_NAIL_CATALOG.every((service) => !("price" in service))).toBe(true);
  });
});
