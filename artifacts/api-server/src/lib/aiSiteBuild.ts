/**
 * Build the whole site from the ideas the owner loved (owner, 2026-11-09; plans/ai-website-builder.md, Stage 3).
 * The AI writes a design spec from our block catalogue: colours, letters, and for the Home and Menu pages an ordered
 * list of blocks with their words. It never writes prices, hours, reviews, photos, phone or address: the site reads
 * those from Certxa when it is shown (aiSiteRender), so they are always true and always current. The Book page is the
 * business's real Certxa booking flow.
 */
import { z } from "zod";
import { generateJson } from "./aiProvider";
import type { SiteFacts } from "./aiSiteFacts";
import { SITE_FONTS, type IdeaFeedback } from "./aiSiteIdeas";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const title = z.string().min(1).max(60);

export const siteBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), variant: z.enum(["big-name", "centered", "split"]), eyebrow: z.string().max(60).optional(),
    headline: z.string().min(1).max(70), subline: z.string().max(200).optional(), button: z.string().min(1).max(24), showOpenNow: z.boolean() }),
  z.object({ type: z.literal("priceList"), variant: z.enum(["menu-board", "cards", "compact"]), title, intro: z.string().max(200).optional(),
    categories: z.array(z.string().max(60)).max(12).optional().describe("Service categories to show, by name; leave out for all"),
    limit: z.number().int().min(3).max(60).optional().describe("Show at most this many services") }),
  z.object({ type: z.literal("hours"), variant: z.enum(["week-strip", "list"]), title, note: z.string().max(160).optional() }),
  z.object({ type: z.literal("featuredPerson"), title, name: z.string().min(1).max(60).describe("Must be a team member's name"), text: z.string().max(300) }),
  z.object({ type: z.literal("reviews"), variant: z.enum(["quotes", "themes"]), title, themes: z.array(z.string().max(40)).max(4).optional() }),
  z.object({ type: z.literal("location"), title, text: z.string().max(200).optional() }),
  z.object({ type: z.literal("houseCalls"), title, text: z.string().max(300) }),
  z.object({ type: z.literal("about"), title, text: z.string().max(700) }),
  z.object({ type: z.literal("gallery"), title }),
  z.object({ type: z.literal("faq"), title, items: z.array(z.object({ q: z.string().max(100), a: z.string().max(300) })).min(1).max(6) }),
  z.object({ type: z.literal("callToAction"), headline: z.string().min(1).max(70), text: z.string().max(200).optional(), button: z.string().min(1).max(24) }),
]);
// ── Pages of widgets (owner, 2026-11-11; plans/ai-site-widgets.md) ─────────────────────────────────────────────
// The AI lays the site out: one page or tabs, which widgets go where, in what order and with which look, and the words
// around them. A widget is the real thing from the Solo website (booking/src/pages/public-booking/widgets): it reads
// its own data and keeps its own booking or checkout, so nothing the AI writes can make a price, an hour or a booking
// wrong.

/** Each widget and the looks it offers (the first is its default). */
export const WIDGET_LOOKS = {
  intro: ["centered"],          // photo, name, star rating and the business's own about text
  services: ["cards", "list"],  // every service, with add-on groups; tapping chooses for booking
  portfolio: ["masonry", "grid"],
  reviews: ["list", "cards"],
  team: ["grid"],               // the professionals, each with "Book with …" (two or more only)
  hours: ["list"],
  policy: ["text"],             // the cancellation policy
  contact: ["card", "map"],     // address, directions, phone, Send a message; "map" adds the map and hours
} as const;
export type WidgetName = keyof typeof WIDGET_LOOKS;
const WIDGETS = Object.keys(WIDGET_LOOKS) as [WidgetName, ...WidgetName[]];
export const PAGE_IDS = ["home", "about", "services", "portfolio", "reviews", "team", "contact"] as const;

/** Words the AI writes between the widgets. */
const WORD_TYPES = ["hero", "about", "faq", "callToAction", "houseCalls", "featuredPerson"];
export const wordsBlockSchema = z.discriminatedUnion("type",
  siteBlockSchema.options.filter((o) => WORD_TYPES.includes((o.shape.type as z.ZodLiteral<string>).value)) as any) as z.ZodType<SiteBlock>;
export const widgetSectionSchema = z.object({
  widget: z.enum(WIDGETS),
  look: z.string().max(20).optional().describe("One of the widget's looks; leave out for its default"),
});
export const sectionSchema = z.union([widgetSectionSchema, wordsBlockSchema]);
export const pageSchema = z.object({
  id: z.enum(PAGE_IDS).describe("The page's address, e.g. #services"),
  title: z.string().min(1).max(24).describe("The tab's name"),
  sections: z.array(sectionSchema).min(1).max(10),
});

export const siteSpecSchema = z.object({
  theme: z.object({
    palette: z.object({ background: hex, surface: hex, text: hex, muted: hex, accent: hex, accentText: hex }),
    fonts: z.object({ heading: z.enum(SITE_FONTS), body: z.enum(SITE_FONTS) }),
    corners: z.enum(["square", "soft", "round"]),
    headingCase: z.enum(["normal", "upper"]),
  }),
  tagline: z.string().max(80),
  layout: z.enum(["tabs", "one-page"]).describe("tabs: one page shows at a time; one-page: everything on one long page"),
  pages: z.array(pageSchema).min(1).max(5),
  summary: z.string().min(40).max(700).describe("Two or three plain sentences telling the owner what you built and why: the pages and the feel"),
});
export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type SiteBlock = z.infer<typeof siteBlockSchema>;
export type SiteSection = z.infer<typeof sectionSchema>;
export const isWidget = (x: SiteSection): x is z.infer<typeof widgetSectionSchema> => "widget" in x;

/** A design made before pages (home + menu blocks, on the Solo layout) as pages of widgets, looking as it did. */
export function upgradeSpec(spec: any): SiteSpec {
  if (Array.isArray(spec?.pages)) return spec as SiteSpec;
  const words = (list: any[]) => (Array.isArray(list) ? list : []).filter((b) => WORD_TYPES.includes(b?.type));
  const { home: _home, menu: _menu, ...rest } = spec ?? {};
  return {
    ...rest,
    layout: "tabs",
    pages: [
      { id: "about", title: "About", sections: [...words(spec?.home), { widget: "team" }, { widget: "hours" }, { widget: "policy" }, { widget: "contact" }, { widget: "reviews" }] },
      { id: "services", title: "Services", sections: [{ widget: "services" }] }, // the menu's words were never shown
      { id: "portfolio", title: "Portfolio", sections: [{ widget: "portfolio" }] },
    ],
  } as SiteSpec;
}

const SYSTEM = `You are Certxa's website designer for beauty businesses. Build the business's booking website from the
ideas the owner LOVED (and avoid what they marked "not this"), as one coherent site.

You design the whole site: its pages, what goes on each page and in what order, how each part looks, and the words.
The site is made of two kinds of sections:

1. Widgets: Certxa's real, working parts. Each reads its own facts and keeps its own booking, so you never write
   prices, hours, phone numbers, addresses, reviews or photos. Each widget can be used once. Widgets and their looks:
   - intro: photo, the business's name, its star rating and its own about text. Look: centered.
   - services: every service with its add-ons; tapping one chooses it for booking. Looks: cards (two columns on a
     computer) or list (one column). The site must have it.
   - portfolio: the business's photos, with "Book this look". Looks: masonry or grid.
   - reviews: the reviews (Google's or Certxa's). Looks: list or cards.
   - team: the professionals with "Book with …". Only when there are two or more.
   - hours: business hours. policy: the cancellation policy.
   - contact: address, directions, phone and "Send a message". Looks: card, or map (a map with the hours beside it).
2. Words you write: hero, about, faq, callToAction, houseCalls, featuredPerson (block types given).

The header (name, cart, Book Now) and the footer are always there; every Book button opens Certxa's booking.

Rules:
- layout "tabs": 2 to 5 pages, one shown at a time (page ids give the addresses, e.g. #services; titles are the tab
  names, short). layout "one-page": a single page with everything in order. Choose what suits the loved ideas.
- The first page is the one people land on. Start it with a hero unless the idea is services first.
- A page should not repeat another: one reviews widget, one contact widget, one services widget.
- Use only facts given. featuredPerson only for a real team member. houseCalls only if the business does house calls.
  Leave out portfolio when there are no photos, reviews when there are none, team when there are fewer than two.
- Light page: background and surface are light colours and text is dark (the booking forms are white); the accent can
  be any strong colour. Strong contrast: text on background, text on surface and accentText on accent must all be easy
  to read.
- Short, warm, plain words; no emoji; no invented awards, years or claims.`;

export async function buildSite(storeId: number, facts: SiteFacts, round: IdeaFeedback[], research = ""): Promise<SiteSpec> {
  const loved = round.filter((r) => r.verdict === "love").map((r) => ({ idea: r.idea, note: r.note, about: r.chips }));
  const notThis = round.filter((r) => r.verdict === "not").map((r) => ({ angle: r.idea.angle, layout: r.idea.layout, palette: r.idea.palette, note: r.note, about: r.chips }));
  const categories = [...new Set(facts.services.map((s) => s.category).filter(Boolean))];
  const prompt = [
    `Business facts (JSON):\n${JSON.stringify({ ...facts, serviceCategories: categories })}`,
    research,
    `Ideas the owner LOVED (JSON):\n${JSON.stringify(loved)}`,
    notThis.length ? `Ideas marked "not this" (JSON) — avoid these directions:\n${JSON.stringify(notThis)}` : "",
    "Build the site spec now.",
  ].filter(Boolean).join("\n\n");
  const spec = await generateJson({ storeId, kind: "build", system: SYSTEM, prompt, schema: siteSpecSchema, maxTokens: 16000, effort: "high" });
  return tidy(spec, facts, categories as string[]);
}

/**
 * Make the design true and complete: drop what the facts can't support or that would be empty, each widget once,
 * services always somewhere, a looks the widget has, one page for a one-page layout.
 */
export function tidy(spec: SiteSpec, facts: SiteFacts, _categories: string[] = []): SiteSpec {
  const team = new Set(facts.team.map((t) => t.name.toLowerCase()));
  const used = new Set<string>();
  const keep = (x: SiteSection): boolean => {
    if (isWidget(x)) {
      if (used.has(x.widget)) return false;
      if (x.widget === "portfolio" && facts.photos === 0) return false;
      if (x.widget === "reviews" && facts.reviews.length === 0 && !facts.rating) return false;
      if (x.widget === "team" && facts.team.length < 2) return false;
      if (x.widget === "hours" && !facts.hours.some((h) => h.open)) return false;
      if (x.widget === "policy" && !facts.business.cancellationPolicy) return false;
      used.add(x.widget);
      return true;
    }
    if (x.type === "featuredPerson") return team.has(x.name.trim().toLowerCase());
    if (x.type === "houseCalls") return !!facts.business.houseCalls;
    return WORD_TYPES.includes(x.type);
  };
  const look = (x: SiteSection): SiteSection => {
    if (!isWidget(x)) return x;
    const looks = WIDGET_LOOKS[x.widget] as readonly string[];
    return { widget: x.widget, look: x.look && looks.includes(x.look) ? x.look : looks[0] };
  };
  const seen = new Set<string>();
  let pages = upgradeSpec(spec).pages
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ ...p, sections: p.sections.filter(keep).map(look) }))
    .filter((p) => p.sections.length > 0);
  if (spec.layout === "one-page" && pages.length > 1) pages = [{ id: pages[0].id, title: pages[0].title, sections: pages.flatMap((p) => p.sections) }];
  if (!used.has("services")) {
    if (spec.layout === "one-page" && pages.length) pages[0].sections.push({ widget: "services", look: "cards" });
    else pages.push({ id: seen.has("services") ? (PAGE_IDS.find((id) => !seen.has(id)) ?? "services") : "services", title: "Services", sections: [{ widget: "services", look: "cards" }] });
  }
  return { ...spec, theme: lightTheme(spec.theme), layout: pages.length > 1 ? spec.layout : "one-page", pages } as SiteSpec;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The booking forms and service cards are white: a dark page would put light text on them, so the page stays light
 *  (the accent is kept). */
export function lightTheme(theme: SiteSpec["theme"]): SiteSpec["theme"] {
  const p = theme.palette;
  if (luminance(p.background) >= 0.6 && luminance(p.text) < 0.2) return theme;
  return { ...theme, palette: { ...p, background: "#FFFFFF", surface: "#F7F5F2", text: "#1A1814", muted: "#6B6560" } };
}
