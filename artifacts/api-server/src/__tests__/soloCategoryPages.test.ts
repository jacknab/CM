import { describe, expect, it } from "vitest";
import type { SalonFacts } from "../lib/salonSeo";
import { renderSoloCategoryPage, soloCategoryUrl, type SoloCategoryPage } from "../lib/soloCategoryPages";

const facts = (over: Partial<SalonFacts> = {}): SalonFacts => ({
  slug: "fades", name: "Fade Room", category: "Barbershop", city: "Denver", state: "CO", cityState: "Denver, CO",
  streetAddress: "1 Main St", postcode: "80202", phone: "7205550100", latitude: null, longitude: null,
  canonical: "https://fades.certxa.com/", about: null, image: null, instagram: null, showPrices: true, onlineCheckin: null, bookingOn: true,
  services: [], hours: [], rating: null, solo: false, byLabel: null,
  places: { ownPlace: "salon", houseCalls: false, radiusMiles: null },
  ...over,
});
const cuts: SoloCategoryPage = {
  id: 1, name: "Haircuts", slug: "haircuts", pros: ["Ana Ruiz", "Ben Cole"],
  services: [
    { id: 10, name: "Skin Fade", description: "Fade to the skin with a lined edge.", minPrice: 35, maxPrice: 50, duration: 45, imageUrl: "https://certxa.com/api/r2/fade.webp" },
    { id: 11, name: "Kids Cut", description: null, minPrice: 25, maxPrice: 25, duration: 30, imageUrl: null },
  ],
  photos: [{ url: "https://certxa.com/api/r2/p1.webp", caption: "Low taper", serviceName: "Skin Fade" }],
};
const beard: SoloCategoryPage = { id: 2, name: "Beard", slug: "beard", pros: [], photos: [], services: [{ id: 12, name: "Beard Trim", description: null, minPrice: 20, maxPrice: 20, duration: 20, imageUrl: null }] };
const ld = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);

describe("Solo service category page", () => {
  const html = renderSoloCategoryPage(facts(), { accent: "#7C3AED" }, cuts, [cuts, beard]);
  it("has its own title, description, canonical and is indexable", () => {
    expect(soloCategoryUrl(facts(), cuts)).toBe("https://fades.certxa.com/services/haircuts/");
    expect(html).toContain("<title>Haircuts in Denver, CO | Fade Room</title>");
    expect(html).toContain('<link rel="canonical" href="https://fades.certxa.com/services/haircuts/">');
    expect(html).toMatch(/<meta name="robots" content="index, follow/);
    expect(html).not.toMatch(/noindex/);
    expect(html.match(/<meta name="description" content="([^"]*)"/)![1]).toBe("Haircuts at Fade Room in Denver, CO: 2 services from $25 to $50. See prices and times and book online.");
  });
  it("never shows the lowest price as everyone's", () => {
    expect(html).toContain("<b>From $35</b> · 45 min");
    expect(html).toContain("<b>$25</b> · 30 min");
    expect(html).toContain("Prices depend on the professional you choose");
    const offers = ld(html)["@graph"][0].hasOfferCatalog.itemListElement;
    expect(offers[0]).toMatchObject({ "@type": "AggregateOffer", lowPrice: "35.00", highPrice: "50.00" });
    expect(offers[1]).toMatchObject({ "@type": "Offer", price: "25.00" });
  });
  it("books through the Solo website with the service chosen", () => {
    expect(html).toContain('href="/?serviceId=10"');
    expect(html).toContain('href="/?serviceId=11"');
    expect(html).toContain('href="/#services">Book Now');
  });
  it("links the other categories and home, names who does them, describes its photos", () => {
    expect(html).toContain('<a href="/services/beard/">Beard</a>');
    expect(html).toContain("With Ana Ruiz, Ben Cole.");
    expect(html).toContain('alt="Skin Fade at Fade Room"');
    expect(html).toContain('alt="Low taper — Skin Fade at Fade Room"');
    expect(html).toContain("--accent:#7C3AED");
  });
  it("has the business, breadcrumbs and page in its structured data", () => {
    const g = ld(html)["@graph"];
    expect(g[0]["@id"]).toBe("https://fades.certxa.com/#business");
    expect(g[1].itemListElement.map((x: any) => x.item)).toEqual(["https://fades.certxa.com/", "https://fades.certxa.com/services/haircuts/"]);
    expect(g[2]["@id"]).toBe("https://fades.certxa.com/services/haircuts/");
  });
  it("with booking off: no Book buttons, says to call", () => {
    const off = renderSoloCategoryPage(facts({ bookingOn: false }), {}, cuts, [cuts]);
    expect(off).not.toContain("serviceId=");
    expect(off).toContain("Online booking isn't available right now");
    expect(off).not.toMatch(/book online/i);
  });
  it("with prices hidden: no prices anywhere", () => {
    const hidden = renderSoloCategoryPage(facts({ showPrices: false }), {}, cuts, [cuts]);
    expect(hidden).not.toMatch(/\$\d/);
  });
  it("keeps a private street address out", () => {
    const priv = renderSoloCategoryPage(facts({ streetAddress: null, postcode: null }), {}, beard, [beard]);
    expect(priv).not.toContain("1 Main St");
    expect(priv).toContain("Denver, CO");
  });
});

describe("test stores", () => {
  it("have no Solo category pages (store 41, the Certxa Pro test store; store 40)", async () => {
    const { soloCategoryPages } = await import("../lib/soloCategoryPages");
    expect(await soloCategoryPages(41, "Nail Salon")).toEqual([]);
    expect(await soloCategoryPages(40, "Nail Salon")).toEqual([]);
  });
});
