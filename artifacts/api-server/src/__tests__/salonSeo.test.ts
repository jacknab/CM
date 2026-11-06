import { describe, expect, it } from "vitest";
import { proByLabel } from "../lib/proCraft";
import { applySalonPage, salonFaq, salonHead, salonLlmsTxt, salonRobotsTxt, type SalonFacts } from "../lib/salonSeo";

const facts = (over: Partial<SalonFacts> = {}): SalonFacts => ({
  slug: "tobys", name: "Toby’s", category: "Nail Salon", city: "Denver", state: "CO", cityState: "Denver, CO",
  streetAddress: "100 Main St", postcode: "80202", phone: "7202436886", latitude: 39.74, longitude: -104.99,
  canonical: "https://tobys.certxa.com/",
  about: null, image: null, instagram: null, showPrices: true, onlineCheckin: null, bookingOn: true,
  services: [
    { name: "Gel Manicure", price: 35, duration: 45, category: "Manicure" },
    { name: "Pedicure", price: 40, duration: 50, category: "Pedicure" },
    { name: "Acrylic Fill", price: 30, duration: 40, category: null },
  ],
  hours: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => i === 0 ? { day, opens: null, closes: null } : { day, opens: "09:00", closes: "19:00" }),
  rating: null,
  solo: false,
  byLabel: null,
  places: { ownPlace: "salon", houseCalls: false, radiusMiles: null },
  ...over,
});
const TEMPLATE = `<html><head><title>Certxa - Online Booking Service</title><meta name="description" content="Certxa is a platform" /><meta name="robots" content="noindex, nofollow" /><link rel="canonical" href="https://certxa.com/" /><meta property="og:title" content="Certxa" /></head><body><div id="root"></div></body></html>`;

describe("a salon's booking page for search and AI engines", () => {
  it("has the salon's own title, description, canonical and is indexable", () => {
    const html = applySalonPage(TEMPLATE, facts());
    expect(html).toContain("<title>Toby’s | Nail Salon in Denver, CO</title>");
    expect(html).toContain('<meta name="geo.region" content="US-CO" />');
    expect(html).toContain('<meta name="geo.placename" content="Denver" />');
    expect(html).toContain('hreflang="x-default" href="https://tobys.certxa.com/"');
    expect(html).toContain('<link rel="canonical" href="https://tobys.certxa.com/" data-salon-page="true" />');
    expect(html).toContain('content="index, follow');
    expect(html).not.toContain("Certxa is a platform");
    expect(html).not.toContain("noindex");
  });

  it("never cuts the description mid-sentence and keeps it short", () => {
    const d = salonHead(facts()).description;
    expect(d).toBe("Toby’s offers Gel Manicure, Pedicure, and Acrylic Fill in Denver, CO. Book online or call (720) 243-6886.");
    const long = salonHead(facts({ services: [1, 2, 3].map((i) => ({ name: `A very long service name number ${i} with extras`, price: 10, duration: 30, category: null })) })).description;
    expect(long.length).toBeLessThanOrEqual(158);
    expect(long).toMatch(/\.$/);
  });

  it("has the business data, its services with prices, and the questions answered (FAQ)", () => {
    const html = applySalonPage(TEMPLATE, facts());
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    const business = ld["@graph"][0];
    expect(business["@type"]).toBe("NailSalon");
    expect(business.address).toMatchObject({ streetAddress: "100 Main St", addressLocality: "Denver", postalCode: "80202" });
    expect(business.hasOfferCatalog.itemListElement[0]).toMatchObject({ itemOffered: { name: "Gel Manicure" }, price: "35.00" });
    expect(business.openingHoursSpecification).toHaveLength(6);
    expect(ld["@graph"].find((x: any) => x["@type"] === "FAQPage").mainEntity.length).toBeGreaterThanOrEqual(4);
    // Readable without JavaScript.
    expect(html).toMatch(/<div id="root"><main data-salon-summary[\s\S]*Gel Manicure — \$35/);
  });

  it("a private address shows the city only; hidden prices stay hidden", () => {
    const f = facts({ streetAddress: null, postcode: null, latitude: null, longitude: null, showPrices: false });
    const html = applySalonPage(TEMPLATE, f);
    expect(html).not.toContain("100 Main St");
    expect(html).not.toContain("geo.position");
    expect(html).not.toContain("$35");
    expect(salonFaq(f).find((x) => /located/.test(x.q))!.a).toBe("Toby’s is in Denver, CO.");
    expect(salonFaq(f).some((x) => /charge/.test(x.q))).toBe(false);
  });

  it("the rating and phone are in the business data, and the account e-mail never is", () => {
    const f = facts({ rating: { value: 4.8, count: 37, source: "Google" } });
    const ld = JSON.parse(applySalonPage(TEMPLATE, f).match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1])["@graph"][0];
    expect(ld).toMatchObject({ telephone: "+17202436886", areaServed: { name: "Denver" },
      aggregateRating: { ratingValue: 4.8, reviewCount: 37 }, geo: { latitude: 39.74 } });
    expect(ld.email).toBeUndefined();
    expect(salonLlmsTxt(f)).toContain("Rating: 4.8/5 from 37 Google reviews");
  });

  it("a salon's own text can't break out of the page", () => {
    const html = applySalonPage(TEMPLATE, facts({ name: `Nails</script><script>alert(1)</script>`, about: `<img src=x onerror=alert(1)>` }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });

  it("robots.txt welcomes AI crawlers and points at the salon's own sitemap", () => {
    const r = salonRobotsTxt(facts());
    expect(r).toContain("User-agent: GPTBot");
    expect(r).toContain("User-agent: PerplexityBot");
    expect(r).toContain("Sitemap: https://tobys.certxa.com/sitemap.xml");
  });

  it("robots.txt opens exactly the public reads the page loads with, and nothing else under /api/", () => {
    const lines = salonRobotsTxt(facts()).split("\n");
    const star = lines.slice(lines.indexOf("User-agent: *"), lines.indexOf("") );
    expect(star).toEqual([
      "User-agent: *",
      "Allow: /",
      "Allow: /api/store/by-subdomain$",
      "Allow: /api/public/booking-payment-policy/tobys$",
      "Allow: /api/public/store/tobys/services$",
      "Allow: /api/public/store/tobys/reviews$",
      "Allow: /api/public/store/tobys/gallery$",
      "Allow: /api/public/store/tobys/service-reviews$",
      "Allow: /api/public/store/tobys/shop$",
      "Allow: /api/public/store/tobys/team$",
      "Allow: /api/public/store/tobys/service-pages$",
      "Disallow: /api/",
    ]);
    expect(lines.join("\n")).not.toMatch(/Allow: \/api\/auth|Allow: \/api\/\$?$/m);
  });

  it("the salon's canonical is marked as the salon's, so the booking app keeps it", () => {
    expect(applySalonPage(TEMPLATE, facts())).toContain('<link rel="canonical" href="https://tobys.certxa.com/" data-salon-page="true" />');
  });

  it("a Solo pro is described by their craft and how they work, never as a salon", () => {
    const f = facts({ solo: true, streetAddress: null, postcode: null, latitude: null, longitude: null,
      places: { ownPlace: "home", houseCalls: true, radiusMiles: 15 } });
    const head = salonHead(f);
    const html = applySalonPage(TEMPLATE, f);
    expect(html).toContain("<title>Toby’s | Nails in Denver, CO</title>");
    expect(head.description).toMatch(/^Toby’s nails in Denver, CO/);
    expect(head.description).toContain("Home studio and house calls.");
    expect(head.description).not.toMatch(/salon/i);
    expect(head.keywords).toContain("nail tech near me");
    expect(head.keywords).toContain("mobile nail tech");
    expect(head.keywords).not.toMatch(/salon/i);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1])["@graph"];
    expect(ld[0]["@type"]).toBe("HealthAndBeautyBusiness");
    expect(ld[0].address.streetAddress).toBeUndefined();
    const faq = salonFaq(f);
    expect(faq.find((x) => /come to you/.test(x.q))!.a).toBe("Yes, Toby’s does house calls within 15 miles of Denver, CO.");
    expect(faq.find((x) => /Where do I go/.test(x.q))!.a).toContain("home studio");
    expect(salonLlmsTxt(f)).toContain("- Type: independent nail tech in Denver, CO");
  });

  it("a Solo barber's work reads as buzzcuts", () => {
    const head = salonHead(facts({ solo: true, category: "Barbershop", name: "Toby's", services: [], places: { ownPlace: "salon", houseCalls: false, radiusMiles: null } }));
    expect(head.title).toBe("Toby's | Buzzcuts in Denver, CO");
    expect(head.description).toMatch(/^Toby's buzzcuts in Denver, CO\. In a salon suite\./);
  });
});

describe("a barbershop with online check-in", () => {
  it("says walk-ins can check in online, in the FAQ, the JSON-LD and llms.txt", () => {
    const f = facts({ category: "Barbershop", onlineCheckin: "https://certxa.com/q/tobys" });
    expect(salonFaq(f).find((x) => /check in online/i.test(x.q))?.a).toContain("https://certxa.com/q/tobys");
    expect(JSON.stringify(salonHead(f).jsonLd)).toContain("JoinAction");
    expect(salonLlmsTxt(f)).toContain("Walk-ins: check in online");
    expect(JSON.stringify(salonHead(facts()).jsonLd)).not.toContain("JoinAction");
  });

  it("names a Solo pro the way pros are searched for: Nails by Toby", () => {
    const f = facts({ solo: true, byLabel: "Nails by Toby" });
    const head = salonHead(f);
    expect(head.title).toBe("Nails by Toby in Denver, CO");
    expect(head.description).toMatch(/^Nails by Toby in Denver, CO: Gel Manicure/);
    expect(head.keywords).toContain("Nails by Toby");
    const business = (head.jsonLd as any)["@graph"][0];
    expect(business).toMatchObject({ name: "Toby’s", alternateName: "Nails by Toby" });
    expect(salonFaq(f).map((x) => x.q)).toContain("How do I book an appointment with Nails by Toby?");
    expect(salonLlmsTxt(f)).toMatch(/^# Nails by Toby\n/);
    expect(applySalonPage(TEMPLATE, f)).toContain("<h1>Nails by Toby</h1>");
    // A business name of its own stays in the title.
    expect(salonHead(facts({ solo: true, byLabel: "Nails by Toby", name: "Glow Studio" })).title).toBe("Nails by Toby in Denver, CO | Glow Studio");
  });

  it("builds the label from the craft and the owner's first name", () => {
    expect(proByLabel("Nail Salon", "toby", "Toby’s")).toBe("Nails by Toby");
    expect(proByLabel("Hair Salon", "Kim Anh", "Glow")).toBe("Hair by Kim");
    expect(proByLabel("Barbershop", "Sam", "Fades")).toBe("Cuts by Sam");
    expect(proByLabel("Spa", "Lee", "Calm")).toBe("Beauty by Lee");
    expect(proByLabel("Nail Salon", "", "Toby’s")).toBeNull();
    expect(proByLabel("Nail Salon", "Toby", "Hair by Toby")).toBeNull();
  });
});

describe("booking switched off", () => {
  it("never says the salon can be booked online", () => {
    const f = facts({ bookingOn: false });
    const head = salonHead(f);
    expect(head.description).not.toMatch(/book online/i);
    expect(JSON.stringify(head.jsonLd)).not.toContain("ReserveAction");
    expect(salonFaq(f).find((x) => /How do I book/.test(x.q))?.a).toMatch(/isn't taking online bookings/);
    expect(salonLlmsTxt(f)).not.toMatch(/Book online:/);
    expect(applySalonPage('<html><head><title>x</title></head><body><div id="root"></div></body></html>', f)).toContain("Not taking online bookings right now");
  });
  it("still offers online booking when it is on", () => {
    const head = salonHead(facts());
    expect(head.description).toMatch(/Book online/);
    expect(JSON.stringify(head.jsonLd)).toContain("ReserveAction");
  });
});
