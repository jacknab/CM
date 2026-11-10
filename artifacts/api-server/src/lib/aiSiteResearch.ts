/**
 * "What I found" — the research step of the AI Website Builder (owner, 2026-11-09; plans/ai-website-builder.md).
 * Before the ideas, the designer looks the business up the way a guest would:
 *   - Google: the business's listing (name, address, phone, hours, website, rating, reviews, photos) and the salons
 *     nearby, through the Places API (GOOGLE_MAPS_API_KEY);
 *   - the old website from the Google listing (or Settings), read directly — a few pages, text only;
 *   - with Claude (ANTHROPIC_API_KEY): a web search for what Yelp, Nextdoor, Fresha, Facebook, neighbourhood guides…
 *     say about it. The free development model can't search the web, so that part waits for Claude.
 * The designer turns it into cards ("What guests say", "Where you are", …), each naming its sources, and a one-line
 * summary. Where sources disagree on the phone, name, address or hours we ask the owner (worked out by our code, not
 * the AI), plus at most three other questions the designer is unsure about. Certxa stays the truth for the site:
 * findings only inspire the design; a phone number the owner picks is saved to their business.
 */
import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import { generateJson, researchWeb } from "./aiProvider";
import type { SiteFacts } from "./aiSiteFacts";

export type FoundCard = { kind: "where" | "guests" | "oldSite" | "nearby" | "neighbourhood" | "look" | "other"; title: string; text: string; chips: string[]; sources: string[] };
export type FoundOption = { label: string; from: string; phone?: string };
export type FoundQuestion = { id: string; topic: "phone" | "name" | "address" | "hours" | "other"; question: string; options: FoundOption[]; hint?: string };
export type Found = {
  summary: string;
  cards: FoundCard[];
  questions: FoundQuestion[];
  sources: { label: string; url: string | null }[];
  google: { name: string; address: string | null; phone: string | null; hours: string[]; website: string | null; rating: number | null; reviews: number | null; photos: number; url: string | null } | null;
  webSearched: boolean;
};
export type Answer = { choice?: number; text?: string; skipped?: boolean };

const digits = (p: string | null | undefined) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};
const prettyPhone = (p: string) => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

// ── Google ────────────────────────────────────────────────────────────────────────────────────────────────────────
type Place = { place_id: string; name: string; formatted_address?: string; formatted_phone_number?: string; website?: string; url?: string;
  rating?: number; user_ratings_total?: number; photos?: unknown[]; reviews?: { rating: number; text: string; relative_time_description?: string }[];
  opening_hours?: { weekday_text?: string[]; periods?: { open?: { day: number; time: string }; close?: { day: number; time: string } }[] };
  geometry?: { location: { lat: number; lng: number } }; editorial_summary?: { overview?: string }; address_components?: { long_name: string; types: string[] }[] };

async function placesGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${path}/json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const data: any = await res?.json().catch(() => null);
  if (!data || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
    if (data) console.warn(`[ai-site] places ${path}: ${data.status} ${data.error_message ?? ""}`);
    return null;
  }
  return data;
}

const GENERIC = new Set(["nail", "nails", "salon", "spa", "and", "the", "by", "studio", "beauty", "bar", "lounge", "hair", "barber", "barbershop", "shop", "co", "llc", "inc", "of"]);
const nameWords = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !GENERIC.has(w));
/** Street number + first street word, e.g. "4635 speedway" from "4635 East Speedway Blvd". */
function streetKey(a: string | null | undefined): string | null {
  const m = String(a ?? "").toLowerCase().match(/^(\d+)\s+(?:(?:n|s|e|w|north|south|east|west)\.?\s+)?([a-z0-9]+)/);
  return m ? `${m[1]} ${m[2]}` : null;
}
/** Is this Google result really this business? Its name, street address or phone must match; a nearby salon with a
 *  different name, street and phone is someone else (seen 11-09: Bonnie Brae Nails & Spa for "Nails By Toby"). */
function sameBusiness(facts: SiteFacts, street: string | null, hit: { name?: string; formatted_address?: string; formatted_phone_number?: string }): boolean {
  const mine = nameWords(facts.business.name), theirs = new Set(nameWords(hit.name ?? ""));
  if (mine.length && mine.filter((w) => theirs.has(w)).length / Math.min(mine.length, Math.max(theirs.size, 1)) >= 0.5) return true;
  const a = streetKey(street), b = streetKey(hit.formatted_address);
  if (a && b && a === b) return true;
  const p = digits(facts.business.phone);
  return p.length === 10 && p === digits(hit.formatted_phone_number);
}

async function googleListing(facts: SiteFacts, street: string | null): Promise<Place | null> {
  const where = street || facts.business.area;
  if (!where) return null;
  const search = await placesGet("textsearch", { query: `${facts.business.name} ${where}` });
  // Text search has no phone; check name/address first, then the details (with phone) of the best candidate.
  const hit = (search?.results ?? []).slice(0, 5).find((r: any) => sameBusiness(facts, street, r)) ?? search?.results?.[0];
  if (!hit?.place_id) return null;
  const details = await placesGet("details", {
    place_id: hit.place_id,
    fields: "place_id,name,formatted_address,formatted_phone_number,website,url,rating,user_ratings_total,photos,reviews,opening_hours,geometry,editorial_summary,address_components",
  });
  const place = (details?.result as Place) ?? null;
  return place && sameBusiness(facts, street, place) ? place : null;
}

async function nearby(place: Place, kind: string): Promise<{ name: string; rating: number | null }[]> {
  const loc = place.geometry?.location;
  if (!loc) return [];
  const keyword = /nail/i.test(kind) ? "nail salon" : /barber/i.test(kind) ? "barber" : /hair/i.test(kind) ? "hair salon" : "beauty salon";
  const data = await placesGet("nearbysearch", { location: `${loc.lat},${loc.lng}`, radius: "1500", keyword });
  return (data?.results ?? []).filter((r: any) => r.place_id !== place.place_id).slice(0, 6)
    .map((r: any) => ({ name: String(r.name), rating: typeof r.rating === "number" ? r.rating : null }));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Google's opening periods as "HH:MM" per day (null = closed), to compare with Certxa's hours. */
function googleHours(place: Place): Record<string, { open: string; close: string } | null> | null {
  const periods = place.opening_hours?.periods;
  if (!periods?.length) return null;
  const out: Record<string, { open: string; close: string } | null> = Object.fromEntries(DAY_NAMES.map((d) => [d, null]));
  const t = (s: string) => `${s.slice(0, 2)}:${s.slice(2, 4)}`;
  for (const p of periods) if (p.open && p.close) out[DAY_NAMES[p.open.day]] = { open: t(p.open.time), close: t(p.close.time) };
  return out;
}

// ── The old website ───────────────────────────────────────────────────────────────────────────────────────────────
function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

/** A public web page as plain text (no scripts), or null. Only http(s) to public addresses; 600 KB at most. */
async function pageText(raw: string): Promise<{ url: string; text: string; links: string[] } | null> {
  let url: URL;
  let res: globalThis.Response | null = null;
  // Follow at most 3 redirects ourselves, checking every hop is a public address.
  for (let hop = 0; hop < 4; hop++) {
    try { url = new URL(raw); } catch { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;
    try {
      const addrs = await dns.lookup(url.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
    } catch { return null; }
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "CertxaSiteDesigner/1.0 (+https://certxa.com)" } }).catch(() => null);
    const next = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    raw = new URL(next, url).toString(); res = null;
  }
  if (!res?.ok || !/text\/html/i.test(res.headers.get("content-type") ?? "")) return null;
  const finalUrl = raw;
  const html = (await res.text().catch(() => "")).slice(0, 600_000);
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(m[1], finalUrl).toString(); } catch { return ""; } })
    .filter((l) => l && /^https?:/.test(l) && new URL(l).host === new URL(finalUrl).host);
  const text = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { url: finalUrl, text, links: [...new Set(links)] };
}

async function oldSite(website: string | null, ownSlug: string | null): Promise<{ url: string; text: string } | null> {
  if (!website) return null;
  let host: string;
  try { host = new URL(website).hostname.toLowerCase(); } catch { return null; }
  // The business's own Certxa site isn't an "old" site: Certxa's facts already cover it.
  if (ownSlug && (host === `${ownSlug.toLowerCase()}.certxa.com` || (host.endsWith("certxa.com") && website.toLowerCase().includes(`/${ownSlug.toLowerCase()}`)))) return null;
  const home = await pageText(website);
  if (!home) return null;
  const extra = home.links.filter((l) => /price|service|menu|about|nail|hair|spa/i.test(l)).slice(0, 3);
  const more = await Promise.all(extra.map((l) => pageText(l)));
  const text = [home, ...more].filter(Boolean).map((p) => `[${p!.url}]\n${p!.text.slice(0, 5000)}`).join("\n\n").slice(0, 14_000);
  return { url: home.url, text };
}

// ── Questions where the sources disagree (our code, so they are always right about what differs) ──────────────────
function conflicts(facts: SiteFacts, place: Place | null, old: { text: string } | null): FoundQuestion[] {
  const qs: FoundQuestion[] = [];
  const mine = digits(facts.business.phone);
  const phones = new Map<string, string[]>();
  const add = (p: string | null | undefined, from: string) => { const d = digits(p); if (d.length === 10) phones.set(d, [...(phones.get(d) ?? []), from]); };
  add(facts.business.phone, "Your Certxa setup");
  add(place?.formatted_phone_number, "Google");
  if (old) for (const m of old.text.matchAll(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g)) { if (phones.size < 4) add(m[0], "Your old site"); }
  for (const [d, from] of phones) phones.set(d, [...new Set(from)]);
  if (phones.size > 1) {
    qs.push({ id: "phone", topic: "phone", question: "Which phone number should guests call?",
      options: [...phones.entries()].sort(([a], [b]) => (a === mine ? -1 : b === mine ? 1 : 0))
        .map(([d, from]) => ({ label: prettyPhone(d), from: from.join(", "), phone: d })),
      hint: "The number you pick is saved as your business phone." });
  }
  if (place?.name && place.name.trim().toLowerCase() !== facts.business.name.trim().toLowerCase()) {
    qs.push({ id: "name", topic: "name", question: "Which name should your website use?",
      options: [{ label: facts.business.name, from: "Your Certxa setup" }, { label: place.name, from: "Google" }],
      hint: "Your site shows the name in Settings › Business details. If Google is right, change it there." });
  }
  const street = facts.business.streetAddress;
  const gNum = place?.formatted_address?.match(/^\d+/)?.[0], cNum = street?.match(/^\d+/)?.[0];
  if (street && place?.formatted_address && gNum && cNum && gNum !== cNum) {
    qs.push({ id: "address", topic: "address", question: "Which address is right?",
      options: [{ label: street, from: "Your Certxa setup" }, { label: place.formatted_address.replace(/, USA$/, ""), from: "Google" }],
      hint: "Your site shows the address in Settings › Location. If Google is right, change it there." });
  }
  const gh = place ? googleHours(place) : null;
  if (gh && facts.hours.some((h) => h.open)) {
    const differs = facts.hours.filter((h) => {
      const g = gh[h.day];
      return (h.open ? `${h.open}-${h.close}` : "closed") !== (g ? `${g.open}-${g.close}` : "closed");
    });
    if (differs.length) {
      const fmt = (o: string | null, c: string | null) => (o && c ? `${o}–${c}` : "closed");
      qs.push({ id: "hours", topic: "hours", question: `Your hours differ from Google on ${differs.map((d) => d.day).join(", ")}. Which are right?`,
        options: [
          { label: differs.map((d) => `${d.day.slice(0, 3)} ${fmt(d.open, d.close)}`).join(" · "), from: "Your Certxa setup" },
          { label: differs.map((d) => `${d.day.slice(0, 3)} ${fmt(gh[d.day]?.open ?? null, gh[d.day]?.close ?? null)}`).join(" · "), from: "Google" },
        ],
        hint: "Your site shows the hours in Settings › Hours. If Google is right, change them there; if Certxa is right, update your Google listing." });
    }
  }
  return qs;
}

// ── The designer's read of it all ─────────────────────────────────────────────────────────────────────────────────
const SOURCE_NAMES = "Google, Yelp, Nextdoor, Fresha, Booksy, Facebook, Instagram, Your old site, Certxa, or the site's name";
const readSchema = z.object({
  summary: z.string().min(2).max(160).describe("One line, like a friend describing the place: 'Friendly, fairly priced nail salon by the Sprouts at Speedway & Swan'"),
  cards: z.array(z.object({
    kind: z.enum(["where", "guests", "oldSite", "nearby", "neighbourhood", "look", "other"]),
    title: z.string().min(2).max(60).describe("The finding itself, short: a quote like '“great prices”', a place like 'Speedway & Swan', a range like '$15–$85'"),
    text: z.string().max(220).describe("One or two sentences explaining it"),
    chips: z.array(z.string().max(40)).max(4).describe("A few short words, e.g. what guests praise"),
    sources: z.array(z.string().max(40)).min(1).max(3).describe(`Where it came from: ${SOURCE_NAMES}`),
  })).max(8),
  questions: z.array(z.object({
    question: z.string().min(2).max(140),
    options: z.array(z.object({ label: z.string().min(1).max(100), from: z.string().max(40) })).min(2).max(3),
  })).max(3).describe("Usually none. Only a FACT you found that may be wrong or out of date and the owner must confirm, e.g. another business name or a price list that differs. Never design choices (what to show, style), never phone, name, address or hours."),
});

const SYSTEM = `You are Certxa's website designer. Before designing a beauty business's website you looked it up the way a
guest would. Turn what was found into short cards for the owner ("What I found"), each naming where it came from.

Card kinds: where (how people find it: landmarks, cross streets), guests (what reviews praise, with a short quote),
oldSite (what the old website listed: services, price range, anything that differs), nearby (other salons close by),
neighbourhood (the area's character, only if a source describes it), look (photos: how many and where), other.

Rules:
- Use ONLY the material given. Every card must come from a source in it; name that source. Never invent quotes, prices,
  places, names or numbers. Quotes are a few words copied exactly.
- Skip a kind when there's nothing real for it. Up to 8 cards. Never a card made only from Certxa's own details
  (the owner already knows their service count or city).
- Questions: only facts the sources disagree on or that look out of date. Never ask about design or what to show.
- Plain, warm, short words; no emoji.`;

export async function researchBusiness(storeId: number, facts: SiteFacts, opts: { ownSlug: string | null; street: string | null; website: string | null }): Promise<Found> {
  const place = await googleListing(facts, opts.street).catch((e) => { console.warn("[ai-site] google", e?.message); return null; });
  const [near, old] = await Promise.all([
    place ? nearby(place, facts.business.kind).catch(() => []) : Promise.resolve([]),
    oldSite(place?.website ?? opts.website, opts.ownSlug).catch(() => null),
  ]);
  const web = await researchWeb({
    storeId,
    prompt: `Find what the web says about this business: ${facts.business.name}, ${opts.street ?? facts.business.area ?? ""}.
Look for its pages on Yelp, Nextdoor, Fresha, Booksy, Facebook, Instagram and local guides, and for its old website if it has one.
Write plain notes: what guests praise or complain about (short exact quotes), landmarks and cross streets people use,
nearby salons, the neighbourhood, photo counts, any other business name, phone number or price list you find.
After each note give the page's URL in brackets. Skip anything that isn't clearly this business.`,
  }).catch((e) => { console.warn("[ai-site] web research", e?.message); return null; });

  // Nothing found anywhere: say so plainly rather than restating Certxa's own details as "findings".
  if (!place && !old && !web) {
    return { summary: `I couldn't find ${facts.business.name} on Google or the web yet, so I'll design from your Certxa details.`,
      cards: [], questions: [], sources: [], google: null, webSearched: false };
  }

  const material = {
    certxa: { name: facts.business.name, kind: facts.business.kind, area: facts.business.area, services: facts.services.length, pricedServices: facts.services.filter((s) => s.price != null).length },
    google: place ? {
      name: place.name, address: place.formatted_address, phone: place.formatted_phone_number, website: place.website,
      rating: place.rating, ratingCount: place.user_ratings_total, photos: place.photos?.length ?? 0, overview: place.editorial_summary?.overview,
      neighbourhood: place.address_components?.find((c) => c.types.includes("neighborhood"))?.long_name,
      hours: place.opening_hours?.weekday_text, reviews: (place.reviews ?? []).map((r) => ({ rating: r.rating, text: r.text.slice(0, 500) })),
    } : null,
    nearbySalonsOnGoogle: near,
    oldWebsite: old,
    webNotes: web?.notes ?? null,
  };
  const asked = conflicts(facts, place, old);
  const read = await generateJson({ storeId, kind: "research", system: SYSTEM, prompt: `What was found (JSON):\n${JSON.stringify(material)}\n\nWrite the summary, cards and questions now.`,
    schema: readSchema, maxTokens: 8000, effort: "medium" });

  const sources: Found["sources"] = [];
  if (place) sources.push({ label: "Google", url: place.url ?? null });
  if (old) sources.push({ label: "Your old site", url: old.url });
  for (const u of web?.urls ?? []) if (!sources.some((s) => s.url === u)) sources.push({ label: new URL(u).hostname.replace(/^www\./, ""), url: u });

  return {
    summary: read.summary,
    cards: read.cards.filter((c) => !c.sources.every((x) => /certxa/i.test(x))),
    questions: [...asked, ...read.questions.filter((q) => !/\b(name|phone|number|address|hours|open|how many)\b/i.test(q.question)).map((q, i) => ({ id: `other-${i}`, topic: "other" as const, question: q.question, options: q.options }))],
    sources: sources.slice(0, 20),
    google: place ? {
      name: place.name, address: place.formatted_address?.replace(/, USA$/, "") ?? null, phone: place.formatted_phone_number ?? null,
      hours: place.opening_hours?.weekday_text ?? [], website: place.website ?? null, rating: place.rating ?? null,
      reviews: place.user_ratings_total ?? null, photos: place.photos?.length ?? 0, url: place.url ?? null,
    } : null,
    webSearched: web != null,
  };
}

/** What the owner told us, in words the designer can use for the ideas and the build. */
export function ownerNotes(found: Found, answers: Record<string, Answer>): string[] {
  const notes: string[] = [];
  for (const q of found.questions) {
    const a = answers[q.id];
    if (!a || a.skipped) continue;
    const said = a.text?.trim() || (a.choice != null ? q.options[a.choice]?.label : null);
    if (said) notes.push(`${q.question} → ${said}`);
  }
  return notes;
}

/** The research as the ideas and the build see it: inspiration only, the site's facts still come from Certxa. */
export function researchForPrompt(found: Found | null, answers: Record<string, Answer>): string {
  if (!found) return "";
  return `What I found about the business online (inspiration for words and angles only; prices, hours, phone and address on the site still come from Certxa) (JSON):\n${
    JSON.stringify({ summary: found.summary, cards: found.cards.map((c) => ({ title: c.title, text: c.text, chips: c.chips, from: c.sources })), ownerAnswers: ownerNotes(found, answers) })}`;
}
