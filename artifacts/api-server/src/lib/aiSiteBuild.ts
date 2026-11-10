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
export const siteSpecSchema = z.object({
  theme: z.object({
    palette: z.object({ background: hex, surface: hex, text: hex, muted: hex, accent: hex, accentText: hex }),
    fonts: z.object({ heading: z.enum(SITE_FONTS), body: z.enum(SITE_FONTS) }),
    corners: z.enum(["square", "soft", "round"]),
    headingCase: z.enum(["normal", "upper"]),
  }),
  tagline: z.string().max(80),
  home: z.array(siteBlockSchema).min(3).max(9),
  menu: z.array(siteBlockSchema).min(1).max(4),
  summary: z.string().max(700).describe("Two or three plain sentences telling the owner what you built and why"),
});
export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type SiteBlock = z.infer<typeof siteBlockSchema>;

const SYSTEM = `You are Certxa's website designer for beauty businesses. Build the business's booking website from the
ideas the owner LOVED (and avoid what they marked "not this"), as one coherent site.

You write a design spec only, using the block types given. Certxa fills in facts when the page is shown:
- priceList shows the real services and prices (you only choose which categories and how many);
- hours, reviews (quotes), gallery photos, location (address or area), phone come from Certxa;
- every button opens Certxa's own booking.
So never write prices, hours, phone numbers, addresses or review quotes yourself.

Rules:
- Home: start with a hero; 4–8 blocks in all; end with a callToAction. Menu: the priceList (all services), maybe a short intro block.
- Use only facts given. featuredPerson only for a real team member. houseCalls only if the business does house calls.
  location only if there is an area or address. gallery only if there are photos. reviews only if there are reviews.
- Strong contrast: text on background, text on surface and accentText on accent must all be easy to read.
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

/** Drop blocks the facts can't support, so the site never shows something untrue or empty. */
export function tidy(spec: SiteSpec, facts: SiteFacts, categories: string[]): SiteSpec {
  const team = new Set(facts.team.map((t) => t.name.toLowerCase()));
  const keep = (b: SiteBlock) => {
    if (b.type === "featuredPerson") return team.has(b.name.trim().toLowerCase());
    if (b.type === "houseCalls") return !!facts.business.houseCalls;
    if (b.type === "location") return !!(facts.business.area || facts.business.streetAddress);
    if (b.type === "gallery") return facts.photos > 0;
    if (b.type === "reviews") return facts.reviews.length > 0 || !!facts.rating;
    return true;
  };
  const fix = (b: SiteBlock): SiteBlock => (b.type === "priceList" && b.categories
    ? { ...b, categories: b.categories.filter((c) => categories.some((x) => x.toLowerCase() === c.toLowerCase())) }
    : b);
  // On the home tab a price list is a taste (8 at most unless the design says); the Services tab has them all.
  const home = spec.home.filter(keep).map(fix).map((b) => (b.type === "priceList" && !b.limit ? { ...b, limit: 8 } : b));
  const menu = spec.menu.filter(keep).map(fix);
  if (!menu.some((b) => b.type === "priceList")) menu.unshift({ type: "priceList", variant: "menu-board", title: "Services and prices" });
  return { ...spec, home, menu };
}
