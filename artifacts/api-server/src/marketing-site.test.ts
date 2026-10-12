import { describe, it, expect } from "vitest";
import { applyInterimLinks, movedTo, readContactMessage } from "./marketing-site";

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

describe("marketing site moved addresses", () => {
  it("redirects an old address once its new page is live", () => {
    expect(movedTo("/online-booking", new Set(["/booking"]))).toBe("/booking");
  });

  it("leaves the old page alone while its new page is not live", () => {
    expect(movedTo("/card-reader-pos", new Set(["/booking"]))).toBeNull();
  });

  it("never redirects an address the new site serves itself", () => {
    expect(movedTo("/pricing", new Set(["/pricing"]))).toBeNull();
  });
});

describe("marketing site contact form", () => {
  it("accepts a complete message and trims it", () => {
    expect(readContactMessage({ name: " Ana ", email: "ana@example.com", topic: "Demo", message: " Hi " })).toEqual({
      name: "Ana",
      email: "ana@example.com",
      topic: "Demo",
      message: "Hi",
    });
  });

  it("refuses a message with no name, a bad email or no text", () => {
    expect(readContactMessage({ email: "a@b.co", message: "x" })).toEqual({ error: "Please enter your name." });
    expect(readContactMessage({ name: "A", email: "nope", message: "x" })).toHaveProperty("error");
    expect(readContactMessage({ name: "A", email: "a@b.co", message: "  " })).toHaveProperty("error");
    expect(readContactMessage(null)).toHaveProperty("error");
  });
});
