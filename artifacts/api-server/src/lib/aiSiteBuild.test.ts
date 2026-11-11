import { describe, expect, it } from "vitest";
import { tidy, upgradeSpec, type SiteSpec } from "./aiSiteBuild";
import type { SiteFacts } from "./aiSiteFacts";

const theme = { palette: { background: "#ffffff", surface: "#f5f5f5", text: "#111111", muted: "#666666", accent: "#7c3aed", accentText: "#ffffff" },
  fonts: { heading: "Fraunces", body: "Inter" }, corners: "soft", headingCase: "normal" } as SiteSpec["theme"];
const facts = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  business: { name: "Nails by Toby", kind: "nail", phone: null, email: null, area: "Denver", streetAddress: null, privateAddress: false,
    about: null, instagram: null, bookingLink: null, houseCalls: null, cancellationPolicy: null },
  services: [], hours: [], team: [{ name: "Toby", bio: null }], reviews: [], rating: null, photos: 0, missing: [], sources: [],
  ...over,
});
const hero = { type: "hero", variant: "centered", headline: "Hi", button: "Book", showOpenNow: false } as const;

describe("upgradeSpec", () => {
  it("turns a design from before pages into tabs: About (its words, then Solo's about parts), Services, Portfolio", () => {
    const old = { theme, tagline: "", summary: "", home: [hero, { type: "priceList", variant: "cards", title: "x" }], menu: [{ type: "priceList", variant: "cards", title: "x" }] };
    const spec = upgradeSpec(old);
    expect(spec.layout).toBe("tabs");
    expect(spec.pages.map((p) => p.id)).toEqual(["about", "services", "portfolio"]);
    expect(spec.pages[0].sections[0]).toEqual(hero);
    expect(spec.pages[1].sections).toEqual([{ widget: "services" }]);
    expect((spec as any).home).toBeUndefined();
  });
  it("leaves a design with pages as it is", () => {
    const spec = { theme, tagline: "", summary: "", layout: "one-page", pages: [{ id: "home", title: "Home", sections: [{ widget: "services" }] }] } as SiteSpec;
    expect(upgradeSpec(spec)).toBe(spec);
  });
});

describe("tidy", () => {
  it("keeps each widget once, drops what has nothing to show, and gives every widget a look it has", () => {
    const spec = { theme, tagline: "", summary: "", layout: "tabs", pages: [
      { id: "home", title: "Home", sections: [hero, { widget: "reviews" }, { widget: "portfolio", look: "grid" }, { widget: "services", look: "carousel" }] },
      { id: "services", title: "Services", sections: [{ widget: "services" }] },
    ] } as SiteSpec;
    const out = tidy(spec, facts({ photos: 3 }));
    expect(out.pages).toHaveLength(1); // the second page only repeated services
    expect(out.layout).toBe("one-page");
    expect(out.pages[0].sections).toEqual([hero, { widget: "portfolio", look: "grid" }, { widget: "services", look: "cards" }]);
  });
  it("always has the services, on a page of their own for tabs", () => {
    const spec = { theme, tagline: "", summary: "", layout: "tabs", pages: [{ id: "home", title: "Home", sections: [hero] }, { id: "about", title: "About", sections: [hero] }] } as SiteSpec;
    const out = tidy(spec, facts());
    expect(out.pages.at(-1)).toEqual({ id: "services", title: "Services", sections: [{ widget: "services", look: "cards" }] });
  });
  it("puts a one-page layout on one page", () => {
    const spec = { theme, tagline: "", summary: "", layout: "one-page", pages: [
      { id: "home", title: "Home", sections: [hero] }, { id: "services", title: "Services", sections: [{ widget: "services", look: "list" }] }] } as SiteSpec;
    const out = tidy(spec, facts());
    expect(out.pages).toEqual([{ id: "home", title: "Home", sections: [hero, { widget: "services", look: "list" }] }]);
  });
  it("keeps the team only for two or more professionals, and a featured person only when real", () => {
    const featured = { type: "featuredPerson", title: "Meet", name: "Sam", text: "" } as const;
    const spec = { theme, tagline: "", summary: "", layout: "one-page", pages: [{ id: "home", title: "Home", sections: [featured, { widget: "team" }, { widget: "services" }] }] } as SiteSpec;
    expect(tidy(spec, facts()).pages[0].sections).toEqual([{ widget: "services", look: "cards" }]);
  });
});
