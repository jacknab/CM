import { describe, expect, it } from "vitest";
import { isDirectoryPath, salonsHostGate } from "./salonsHostGate";

const run = (host: string, url: string) => {
  const out: { next?: boolean; status?: number; to?: string } = {};
  const path = url.split("?")[0];
  salonsHostGate({ headers: { host }, path, originalUrl: url } as any,
    { redirect: (s: number, to: string) => { out.status = s; out.to = to; } } as any, () => { out.next = true; });
  return out;
};

describe("salons.certxa.com gate", () => {
  it("keeps the directory", () => {
    for (const p of ["/", "/salons", "/salons/texas", "/salons/texas/houston/x", "/mp-assets/assets/main.js", "/api/salons", "/robots.txt", "/sitemap.xml", "/sitemap-salons.xml", "/sitemap-listings.xml", "/favicon.svg"]) {
      expect(isDirectoryPath(p), p).toBe(true);
      expect(run("salons.certxa.com", p).next, p).toBe(true);
    }
  });
  it("sends the old website to certxa.com, query kept", () => {
    expect(run("salons.certxa.com", "/pricing?x=1")).toEqual({ status: 301, to: "https://certxa.com/pricing?x=1" });
    for (const p of ["/about", "/blog", "/login", "/calendar", "/deals", "/salonsx", "/assets/index.js"]) expect(run("salons.certxa.com", p).status, p).toBe(301);
  });
  it("leaves every other host alone", () => {
    expect(run("certxa.com", "/pricing").next).toBe(true);
    expect(run("tobys.certxa.com", "/").next).toBe(true);
  });
});
