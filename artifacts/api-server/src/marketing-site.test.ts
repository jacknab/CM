import { describe, it, expect } from "vitest";
import { applyInterimLinks } from "./marketing-site";

describe("marketing site interim links", () => {
  it("points a link at today's page while the new one is not live", () => {
    const html = '<a href="/booking">Booking</a><a href="/about">About</a>';
    expect(applyInterimLinks(html, new Set(["/about"]))).toBe(
      '<a href="/online-booking">Booking</a><a href="/about">About</a>',
    );
  });

  it("leaves the link alone once the new page is live", () => {
    const html = '<a href="/booking">Booking</a>';
    expect(applyInterimLinks(html, new Set(["/booking"]))).toBe(html);
  });

  it("does not touch links with no interim page", () => {
    const html = '<a href="/pricing">Pricing</a><a href="/booking/new">x</a>';
    expect(applyInterimLinks(html, new Set())).toBe(html);
  });
});
