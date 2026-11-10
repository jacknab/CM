/**
 * Six website ideas at once (owner, 2026-11-09; plans/ai-website-builder.md, Stage 2). Each idea is a small design spec
 * — angle, headline, colours, letters (from our vetted font list) and the sections it features — drawn by our own
 * code as a phone-shaped mockup. The owner marks each Love it / Not this; "More ideas" makes six new ones from that.
 */
import { z } from "zod";
import { generateJson } from "./aiProvider";
import type { SiteFacts } from "./aiSiteFacts";

/** Google Fonts we load for the sites; the designer may only choose from these. */
export const SITE_FONTS = ["Inter", "DM Sans", "Poppins", "Montserrat", "Nunito", "Space Grotesk", "Playfair Display", "DM Serif Display",
  "Fraunces", "Cormorant Garamond", "Lora", "Bebas Neue", "Oswald", "Archivo Black", "Abril Fatface", "Pacifico"] as const;
export const IDEA_LAYOUTS = ["bold-type", "menu-board", "editorial", "playful", "minimal", "photo-led", "dark-luxe", "neighbourhood"] as const;
export const IDEA_BLOCKS = ["hero", "priceList", "hours", "featuredPerson", "reviews", "location", "houseCalls", "about", "gallery", "callToAction"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const ideaSchema = z.object({
  angle: z.string().min(2).max(60).describe("Short label for the idea, e.g. 'Ask for Tom' or 'Your full price list'"),
  why: z.string().min(2).max(180).describe("One sentence: what this idea puts first and why it suits this business"),
  layout: z.enum(IDEA_LAYOUTS),
  palette: z.object({ background: hex, surface: hex, text: hex, accent: hex }),
  fonts: z.object({ heading: z.enum(SITE_FONTS), body: z.enum(SITE_FONTS) }),
  headline: z.string().min(2).max(60),
  subline: z.string().max(160),
  blocks: z.array(z.object({
    type: z.enum(IDEA_BLOCKS),
    title: z.string().max(60).optional(),
    lines: z.array(z.string().max(80)).max(7).optional().describe("What this section shows, e.g. 'Gel manicure · $35' or 'Mon–Sat 9:30–7'"),
  })).min(2).max(4),
  callToAction: z.string().min(2).max(24),
});
export const ideasSchema = z.object({ ideas: z.array(ideaSchema).length(6) });
export type SiteIdea = z.infer<typeof ideaSchema>;
export type IdeaFeedback = { idea: SiteIdea; verdict: "love" | "not" | null; note: string | null; chips: string[] };

const SYSTEM = `You are Certxa's website designer for beauty businesses (nail, hair, barber, lash, brow, spa, solo professionals).
You sketch six DIFFERENT ideas for the business's booking website. Each idea leads with a different angle that is true for
this business: e.g. its name set big, its signature service or price list, the person clients ask for, the place people
know it by, what clients praise, walk-ins/opening hours, house calls, a calm luxury feel. No two ideas share an angle,
layout or palette.

Truth rules (never break them):
- Use only facts given. Never invent prices, phone numbers, addresses, hours, names, awards or reviews.
- A price appears only if it is in the services list; otherwise write the service without a price.
- If the address is private, mention the area only.
- Reviews may inspire wording ("friendly", "great prices"); quote at most a few words and only from the reviews given.
- Colours must be readable: text on background and on surface needs strong contrast.
- Words are short, warm and plain; no emoji.`;

export async function sketchIdeas(storeId: number, facts: SiteFacts, previous: IdeaFeedback[] = [], research = ""): Promise<SiteIdea[]> {
  const feedback = previous.filter((p) => p.verdict || p.note || p.chips.length).map((p) => ({
    angle: p.idea.angle, layout: p.idea.layout, palette: p.idea.palette, fonts: p.idea.fonts,
    verdict: p.verdict === "love" ? "loved" : p.verdict === "not" ? "not this" : "no verdict", note: p.note, about: p.chips,
  }));
  const prompt = [
    `Business facts (JSON):\n${JSON.stringify(facts)}`,
    research,
    feedback.length ? `The owner's reactions to earlier ideas (JSON) — keep what they loved, avoid what they didn't, and make six NEW ideas:\n${JSON.stringify(feedback)}` : "",
    "Sketch six ideas now.",
  ].filter(Boolean).join("\n\n");
  const out = await generateJson({ storeId, kind: previous.length ? "more-ideas" : "ideas", system: SYSTEM, prompt, schema: ideasSchema, maxTokens: 12000, effort: "medium" });
  return out.ideas;
}
