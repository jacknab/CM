/**
 * Change the site by chat (owner, 2026-11-09; plans/ai-website-builder.md, Stage 5): "make the header pink", "add a FAQ
 * about parking". The designer gets the current spec and the request, makes only that change, and says in a sentence
 * or two what it did. The result is a new version (private until put online). Facts still come from Certxa: a request
 * to change a price, hours or a phone number is answered with where to change it, not by writing it into the site.
 */
import { z } from "zod";
import { generateJson } from "./aiProvider";
import type { SiteFacts } from "./aiSiteFacts";
import { siteSpecSchema, tidy, type SiteSpec } from "./aiSiteBuild";

const changeSchema = z.object({
  reply: z.string().min(1).max(500).describe("One or two plain sentences to the owner: what you changed, or why you couldn't"),
  changed: z.boolean().describe("false when nothing in the site needed changing"),
  spec: siteSpecSchema,
});

const SYSTEM = `You are Certxa's website designer. The owner asks for a change to their booking website. You get the
current site spec (JSON). Return the WHOLE spec with ONLY the requested change made; keep every other block, word,
colour and font exactly as it was.

Rules:
- Same block types and limits as before. Keep a hero first on Home and a callToAction last; Menu keeps its priceList.
- Prices, durations, hours, reviews, photos, phone and address are filled in by Certxa, not written in the spec. If the
  owner wants to change one of those, leave the spec unchanged (changed: false) and tell them where: prices and services
  in Settings › Catalog, hours in Settings › Hours, phone and name in Settings › Business details, address in Settings ›
  Location, photos in More › Portfolio.
- Use only facts given; never invent awards, years, prices or claims. Keep text readable against its background.
- If the request is unclear, make the most reasonable small change and say what you did.`;

export async function changeSite(storeId: number, facts: SiteFacts, current: SiteSpec, request: string): Promise<{ reply: string; changed: boolean; spec: SiteSpec }> {
  const prompt = [
    `Business facts (JSON):\n${JSON.stringify(facts)}`,
    `Current site spec (JSON):\n${JSON.stringify(current)}`,
    `The owner's request:\n${request}`,
  ].join("\n\n");
  const out = await generateJson({ storeId, kind: "change", system: SYSTEM, prompt, schema: changeSchema, maxTokens: 16000, effort: "medium" });
  const categories = [...new Set(facts.services.map((s) => s.category).filter(Boolean))] as string[];
  return { reply: out.reply, changed: out.changed, spec: tidy({ ...out.spec, summary: current.summary }, facts, categories) };
}
