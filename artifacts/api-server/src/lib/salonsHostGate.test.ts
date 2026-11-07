import { describe, expect, it } from "vitest";
import { isRetiredMarketplacePath, salonsHostGate } from "./salonsHostGate";

const gate = salonsHostGate("<p>gone</p>");
const run = (host: string, url: string, method = "GET") => {
  const out: { next?: boolean; status?: number; to?: string } = {};
  const res: any = {
    redirect: (s: number, to: string) => { out.status = s; out.to = to; },
    status: (s: number) => { out.status = s; return res; }, set: () => res, send: () => res,
  };
  gate({ headers: { host }, path: url.split("?")[0], originalUrl: url, method } as any, res, () => { out.next = true; });
  return out;
};

describe("salons.certxa.com retired", () => {
  it("sends the whole subdomain to certxa.com", () => {
    expect(run("salons.certxa.com", "/")).toEqual({ status: 301, to: "https://certxa.com/" });
    expect(run("salons.certxa.com", "/salons/texas/houston")).toEqual({ status: 301, to: "https://certxa.com/" });
    expect(run("salons.certxa.com", "/pricing?x=1")).toEqual({ status: 301, to: "https://certxa.com/pricing?x=1" });
    expect(run("salons.certxa.com", "/sitemap.xml")).toEqual({ status: 301, to: "https://certxa.com/sitemap.xml" });
  });
  it("answers 410 for the marketplace's addresses on certxa.com", () => {
    for (const p of ["/salons", "/salons/texas", "/listings/arizona", "/salon/x", "/deals", "/deals/2", "/wallet"]) expect(run("certxa.com", p).status, p).toBe(410);
  });
  it("leaves everything else alone", () => {
    for (const p of ["/", "/pricing", "/salon-dashboard", "/salon-earnings", "/catalog/deals", "/api/deals", "/dealsx", "/wallets"]) {
      expect(isRetiredMarketplacePath(p), p).toBe(false);
      expect(run("certxa.com", p).next, p).toBe(true);
    }
    expect(run("tobys.certxa.com", "/deals").next).toBe(true);
    expect(run("certxa.com", "/deals", "POST").next).toBe(true);
  });
});
