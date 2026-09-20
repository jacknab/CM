/**
 * One-off backfill: generates a short, GEO/SEO-friendly "About us" text for
 * every nail_salons row missing one (or every row when --regenerate-all is
 * set), using OpenAI's gpt-4o-mini (the cheapest model — same convention used
 * everywhere else in this codebase, e.g. routes.ts's bulk service-description
 * generators).
 *
 * Before generating copy, the script asks the official Google Places API for
 * details using nail_salons.place_id. When Google supplies an editorial or
 * generative summary, that summary is treated as source material and
 * paraphrased rather than copied. With --website-fallback, the official
 * website's meta description may be used when Google has no summary. If no
 * richer source exists, generation falls back to the original database facts.
 * Successful production lookups replace that salon's regular rows in
 * salon_google_hours, which the public profile API and marketplace already
 * render. Lookup attempts are recorded in salon_google_places and production
 * runs are hard-capped at 500 records per UTC database day across invocations.
 * A PostgreSQL advisory lock prevents concurrent runs from bypassing the cap.
 *
 * Idempotent / resumable: each row is written immediately after a successful
 * API call — safe to stop (Ctrl+C) and re-run at any time. By default, only
 * rows where about_text IS NULL are selected, so completed rows are never
 * revisited or billed again. With --regenerate-all, every row is re-generated
 * and rewritten (each write also refreshes last_seen_at = now()).
 *
 * Run:
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *     pnpm tsx ../../scripts/generate-salon-about-text.ts [--dry] [--no-call] [--inspect-sources] [--limit=N] [--concurrency=N] [--pause-ms=N] [--regenerate-all] [--no-google] [--website-fallback]
 *
 *   --dry             Print the prompt/response for each row, write nothing, call OpenAI (unless combined with --no-call)
 *   --no-call         Combine with --dry to skip the OpenAI call entirely (prompt preview + cost estimate only)
 *   --limit=N         Only process the first N pending rows (for testing)
 *   --concurrency=N   Parallel in-flight requests (default 5)
 *   --pause-ms=N      Pause after every 5 Google lookups (default 2000ms)
 *   --regenerate-all  Re-generate and re-write every row, not just rows where about_text IS NULL
 *   --no-google       Do not call Google Places; use only existing database facts
 *   --website-fallback  If Google has no summary, read a description from the official website returned by Google
 *   --inspect-sources Fetch and print Google/website source data; do not call OpenAI or write to the database
 */

import { Pool } from "pg";
import { splitAddress } from "../artifacts/api-server/src/lib/salonData";

const DRY = process.argv.includes("--dry");
const NO_CALL = process.argv.includes("--no-call");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 5);
const PAUSE_MS = Number(process.argv.find((a) => a.startsWith("--pause-ms="))?.split("=")[1] ?? 2_000);
const REGENERATE_ALL = process.argv.includes("--regenerate-all");
const INSPECT_SOURCES = process.argv.includes("--inspect-sources");
const CALL_OPENAI = !NO_CALL && !INSPECT_SOURCES;
const USE_GOOGLE = !process.argv.includes("--no-google") && (!NO_CALL || INSPECT_SOURCES);
const WEBSITE_FALLBACK = process.argv.includes("--website-fallback") && (!NO_CALL || INSPECT_SOURCES);

// gpt-5-nano has the lowest sticker price of any current OpenAI model
// (verified live), but it's a reasoning model — even at
// reasoning_effort:"low" it spent ~500+ tokens/call on hidden reasoning
// against this prompt's full constraint list, before ever producing visible
// text. Measured real cost for this exact prompt: gpt-5-nano/low ≈ $12 for
// the full 47.5k-row run; gpt-4o-mini ≈ $3.61 for the same job — the
// reasoning overhead doesn't pay for itself on a task this simple, so
// gpt-4o-mini is the actual cheapest choice in practice here despite the
// higher per-token rate. It also produced zero quality issues across 25+
// samples in testing, vs. one garbled phrase from gpt-5-nano at
// reasoning_effort:"minimal".
const MODEL = "gpt-4o-mini";
const PRICE_PER_1M_INPUT = 0.15;
const PRICE_PER_1M_OUTPUT = 0.60;
const MAX_GENERATION_ATTEMPTS = 4;
const MAX_TEMPLATE_SIMILARITY = 0.42;
const SHINGLE_SIZE = 4;
const DAILY_GOOGLE_LOOKUP_LIMIT = 500;
const GOOGLE_LOOKUPS_PER_PAUSE = 5;

interface SalonRow {
  id: number;
  name: string;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  place_id: string;
}

interface ExistingAboutRow {
  id: number;
  name: string;
  address: string | null;
  about_text: string;
}

interface SourceContext {
  source: "google_summary" | "official_website" | "database";
  summary?: string;
  website?: string;
  businessStatus?: string;
  types?: string[];
  weekdayHours?: string[];
  hours?: StoredHour[];
}

interface StoredHour {
  day: number;
  openTime: string | null;
  closeTime: string | null;
  closedAllDay: boolean;
  periodOrder: number;
}

interface GooglePlaceResponse {
  businessStatus?: string;
  types?: string[];
  websiteUri?: string;
  editorialSummary?: { text?: string };
  generativeSummary?: { overview?: { text?: string } };
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    }>;
  };
  error?: { message?: string; status?: string };
}

interface LegacyGooglePlaceResponse {
  status?: string;
  error_message?: string;
  result?: {
    business_status?: string;
    types?: string[];
    website?: string;
    editorial_summary?: { overview?: string };
    opening_hours?: {
      weekday_text?: string[];
      periods?: Array<{
        open?: { day?: number; time?: string };
        close?: { day?: number; time?: string };
      }>;
    };
  };
}

// Forces structural variety across ~47k calls — without this, gpt-4o-mini
// converges on the same "At {name} in {city}, we are dedicated to..."
// template almost every time, which is exactly the near-duplicate-content
// pattern flagged as an SEO risk at this scale (see the salon directory
// rewrite earlier this session). Each row gets ONE randomly assigned angle
// + opening constraint, so the corpus reads as genuinely varied instead of
// find-and-replaced.
const ANGLES = [
  "Focus on the experience of getting your nails done here — the feeling, not a feature list.",
  "Focus on convenience and location for someone searching nearby.",
  "Focus on the range of nail care offered, described naturally rather than as a list.",
  "Focus on who this salon is a good fit for (e.g. a quick visit, a relaxing break, before an event) without inventing specifics.",
  "Open with a short, direct statement about the salon itself before mentioning location.",
];
const OPENING_BANS = [
  "at {name}", "welcome to {name}", "welcome to", "located in the heart of",
];

const LEAD_STYLES = [
  "Begin with a customer need or occasion, without using a question.",
  "Begin with the business name as the grammatical subject, followed by an active verb.",
  "Begin with the city and connect it naturally to the salon in the same sentence.",
  "Begin with a concise description of the visit customers can expect.",
  "Begin with a location-oriented phrase, but do not use 'located in' or 'in the heart of'.",
  "Begin with a concrete nail-care action such as refreshing, maintaining, or preparing a look.",
  "Begin with a short sentence of no more than nine words, then expand in sentence two.",
  "Begin with an invitation phrased without 'welcome', 'discover', or 'experience'.",
];

const STRUCTURES = [
  "Use two sentences: one longer sentence followed by one shorter sentence.",
  "Use three sentences with clearly different lengths.",
  "Use two sentences and place the city only in the second sentence.",
  "Use three sentences; make the middle sentence the shortest.",
  "Use two sentences joined by no em dashes or semicolons.",
  "Use three sentences and end with a practical, understated invitation.",
  "Use two sentences; the first describes fit and the second describes general nail care.",
];

const TONE_VARIANTS = [
  "Keep the language polished and understated; avoid superlatives.",
  "Use friendly, plainspoken language rather than luxury clichés.",
  "Make the copy concise and locally useful, with minimal adjectives.",
  "Use an upbeat but credible tone and avoid exaggerated claims.",
  "Favor specific verbs over generic phrases such as 'dedicated to providing'.",
  "Write with a calm, contemporary tone and no marketing hype.",
];

function creativeBrief(row: SalonRow, attempt: number): string[] {
  return [
    LEAD_STYLES[(row.id * 7 + attempt * 3) % LEAD_STYLES.length],
    STRUCTURES[(row.id * 11 + attempt * 5) % STRUCTURES.length],
    TONE_VARIANTS[(row.id * 13 + attempt * 2) % TONE_VARIANTS.length],
  ];
}

function buildPrompt(row: SalonRow, context: SourceContext = { source: "database" }, attempt = 0, rejectedText?: string): string {
  const addr = splitAddress(row.address || "");
  const ratingLine = row.rating && row.review_count
    ? `Rating: ${row.rating}/5 from ${row.review_count} reviews`
    : "";
  const angle = ANGLES[row.id % ANGLES.length];
  return [
    `Write a short "About us" text for a nail salon's business profile page.`,
    ``,
    `Business name: ${row.name}`,
    addr.street ? `Street: ${addr.street}` : "",
    addr.city ? `City: ${addr.city}` : "",
    addr.state ? `State: ${addr.state}` : "",
    ratingLine,
    context.businessStatus ? `Google business status: ${context.businessStatus}` : "",
    context.types?.length ? `Google business categories: ${context.types.join(", ")}` : "",
    context.weekdayHours?.length ? `Verified Google business hours: ${context.weekdayHours.join("; ")}` : "",
    context.summary ? `Verified source description (${context.source === "google_summary" ? "Google Places" : "official business website"}): ${context.summary}` : "",
    ``,
    `Requirements:`,
    `- 2-3 sentences, 40-70 words total`,
    `- Warm, professional tone — written for potential customers discovering this business`,
    `- Naturally mention the city (and state if it helps disambiguate) for local SEO`,
    `- Only mention a specific neighborhood if you are genuinely confident it is a real, well-known neighborhood of that exact city — otherwise do not mention one`,
    `- Do NOT invent specific facts not given above: no years in business, no awards, no staff names, no specific services beyond general nail care (manicures, pedicures, nail enhancements) unless stated`,
    `- Do NOT invent any discount, promotion, deal, or special offer (e.g. "10% off", "free upgrade") — none was given, so none exists; mentioning one would be false advertising on a real business's page`,
    `- Do NOT repeat the rating/review count as a sentence (it's context only)`,
    context.weekdayHours?.length ? `- Business hours are verified context. You may mention a broad convenience such as weekend availability only when the hours directly prove it; do not list the full weekly schedule in this About text` : "",
    context.summary ? `- Use the verified source description for factual grounding, but paraphrase it into original wording; do not copy a sentence verbatim` : "",
    `- No hashtags, no markdown, no emojis, no quotation marks around the output`,
    `- ${angle}`,
    ...creativeBrief(row, attempt).map((instruction) => `- ${instruction}`),
    `- This salon has uniqueness key ${row.id}-${attempt}. Treat its creative brief as mandatory; do not fall back to familiar directory-copy formulas.`,
    `- Avoid generic claims such as "top-notch", "skilled team", "dedicated team", "go-to destination", "perfect pampering", "exceptional service", or "clients rave" unless a verified source explicitly supports them.`,
    `- This text will sit alongside thousands of similar pages for other salons — vary your sentence structure and word choice so it doesn't read like a template. Do NOT start with any of: ${OPENING_BANS.map((b) => `"${b.replace("{name}", row.name)}"`).join(", ")}.`,
    rejectedText ? `- A previous draft was rejected as too similar to another salon: ${rejectedText}. Write a substantially different composition, not a synonym swap.` : "",
    ``,
    `Return only the About us text — nothing else.`,
  ].filter(Boolean).join("\n");
}

function normalizeForUniqueness(text: string, row: Pick<SalonRow, "name" | "address">): string {
  const addr = splitAddress(row.address || "");
  let normalized = text.toLowerCase();
  const replaceable = [row.name, addr.street, addr.city, addr.state]
    .filter((value): value is string => Boolean(value?.trim()))
    .sort((a, b) => b.length - a.length);
  for (const value of replaceable) {
    const escaped = value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, "g"), " entity ");
  }
  return normalized
    .replace(/\b(?:ca|california|ny|new york|tx|texas|fl|florida)\b/g, " region ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text: string): Set<string> {
  const words = text.split(" ").filter(Boolean);
  const result = new Set<string>();
  if (words.length < SHINGLE_SIZE) {
    if (text) result.add(text);
    return result;
  }
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    result.add(words.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return result;
}

class UniquenessIndex {
  private readonly documents = new Map<number, Set<string>>();
  private readonly inverted = new Map<string, Set<number>>();
  private readonly exact = new Set<string>();

  add(id: number, text: string, row: Pick<SalonRow, "name" | "address">): void {
    const previous = this.documents.get(id);
    if (previous) {
      for (const gram of previous) {
        const ids = this.inverted.get(gram);
        ids?.delete(id);
        if (ids?.size === 0) this.inverted.delete(gram);
      }
    }
    const normalized = normalizeForUniqueness(text, row);
    const grams = shingles(normalized);
    this.exact.add(normalized);
    this.documents.set(id, grams);
    for (const gram of grams) {
      let ids = this.inverted.get(gram);
      if (!ids) { ids = new Set<number>(); this.inverted.set(gram, ids); }
      ids.add(id);
    }
  }

  check(text: string, row: Pick<SalonRow, "name" | "address">): { unique: boolean; similarity: number; matchingId?: number; reason?: string } {
    const normalized = normalizeForUniqueness(text, row);
    if (this.exact.has(normalized)) return { unique: false, similarity: 1, reason: "same normalized text" };
    const grams = shingles(normalized);
    const overlaps = new Map<number, number>();
    for (const gram of grams) {
      for (const id of this.inverted.get(gram) ?? []) overlaps.set(id, (overlaps.get(id) ?? 0) + 1);
    }
    let similarity = 0;
    let matchingId: number | undefined;
    for (const [id, intersection] of overlaps) {
      const otherSize = this.documents.get(id)?.size ?? 0;
      const score = intersection / Math.max(1, grams.size + otherSize - intersection);
      if (score > similarity) { similarity = score; matchingId = id; }
    }
    return similarity >= MAX_TEMPLATE_SIMILARITY
      ? { unique: false, similarity, matchingId, reason: "near-duplicate sentence structure" }
      : { unique: true, similarity, matchingId };
  }
}

function validateDraft(text: string, row: SalonRow): string | undefined {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 40 || words.length > 70) return `word count ${words.length} is outside 40-70`;
  const city = splitAddress(row.address || "").city?.toLowerCase();
  if (city && !text.toLowerCase().includes(city)) return `missing SEO city keyword ${city}`;
  if (/^(at |welcome to |located in the heart of)/i.test(text.trim())) return "uses a banned opening";
  return undefined;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clockTime(hour: number | undefined, minute: number | undefined): string | null {
  if (hour == null) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}:00`;
}

function legacyClockTime(value: string | undefined): string | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  return `${value.slice(0, 2)}:${value.slice(2)}:00`;
}

function completeWeek(periods: Array<Omit<StoredHour, "closedAllDay">>): StoredHour[] {
  const result: StoredHour[] = periods.map((period) => ({ ...period, closedAllDay: false }));
  const openDays = new Set(result.map((period) => period.day));
  for (let day = 0; day < 7; day++) {
    if (!openDays.has(day)) result.push({ day, openTime: null, closeTime: null, closedAllDay: true, periodOrder: 0 });
  }
  return result.sort((a, b) => a.day - b.day || a.periodOrder - b.periodOrder);
}

function newApiHours(periods: NonNullable<GooglePlaceResponse["regularOpeningHours"]>["periods"]): StoredHour[] {
  if (!periods?.length) return [];
  const orderByDay = new Map<number, number>();
  return completeWeek((periods ?? []).flatMap((period) => {
    const day = period.open?.day;
    if (day == null) return [];
    const periodOrder = orderByDay.get(day) ?? 0;
    orderByDay.set(day, periodOrder + 1);
    const openTime = clockTime(period.open?.hour, period.open?.minute);
    return [{ day, openTime, closeTime: clockTime(period.close?.hour, period.close?.minute) ?? (openTime ? "23:59:59" : null), periodOrder }];
  }));
}

function legacyApiHours(periods: NonNullable<NonNullable<LegacyGooglePlaceResponse["result"]>["opening_hours"]>["periods"]): StoredHour[] {
  if (!periods?.length) return [];
  const orderByDay = new Map<number, number>();
  return completeWeek((periods ?? []).flatMap((period) => {
    const day = period.open?.day;
    if (day == null) return [];
    const periodOrder = orderByDay.get(day) ?? 0;
    orderByDay.set(day, periodOrder + 1);
    const openTime = legacyClockTime(period.open?.time);
    return [{ day, openTime, closeTime: legacyClockTime(period.close?.time) ?? (openTime ? "23:59:59" : null), periodOrder }];
  }));
}

function cleanSourceText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 700) : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function websiteMetaDescription(html: string): string | undefined {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== "description" && name !== "og:description") continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    const cleaned = cleanSourceText(content ? decodeHtml(content) : undefined);
    if (cleaned) return cleaned;
  }
  return undefined;
}

async function fetchWebsiteDescription(url: string): Promise<string | undefined> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return undefined; }
  if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return undefined;

  const response = await fetch(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "CertxaDirectoryBot/1.0 (+https://certxa.com)" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return undefined;
  const html = (await response.text()).slice(0, 1_000_000);
  return websiteMetaDescription(html);
}

async function fetchSourceContext(row: SalonRow, googleApiKey: string | undefined): Promise<SourceContext> {
  if (!USE_GOOGLE || !googleApiKey || !row.place_id) return { source: "database" };

  const fields = ["businessStatus", "types", "websiteUri", "editorialSummary", "generativeSummary", "regularOpeningHours.weekdayDescriptions", "regularOpeningHours.periods"].join(",");
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(row.place_id)}`, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "X-Goog-Api-Key": googleApiKey,
      "X-Goog-FieldMask": fields,
    },
  });
  const place = await response.json() as GooglePlaceResponse;
  let googleSummary: string | undefined;
  let base: Omit<SourceContext, "source" | "summary">;

  if (response.ok) {
    googleSummary = cleanSourceText(place.editorialSummary?.text ?? place.generativeSummary?.overview?.text);
    base = {
      businessStatus: place.businessStatus,
      types: place.types,
      website: place.websiteUri,
      weekdayHours: place.regularOpeningHours?.weekdayDescriptions,
      hours: newApiHours(place.regularOpeningHours?.periods),
    };
  } else {
    // Some existing Maps keys allow the legacy Places endpoint but block
    // places.googleapis.com. Fall back so those deployments can still enrich.
    const legacyFields = ["business_status", "type", "website", "editorial_summary", "opening_hours"].join(",");
    const legacyResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(row.place_id)}&fields=${legacyFields}&key=${encodeURIComponent(googleApiKey)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const legacy = await legacyResponse.json() as LegacyGooglePlaceResponse;
    if (!legacyResponse.ok || legacy.status !== "OK") {
      throw new Error(`Google Places ${response.status}: ${place.error?.message ?? response.statusText}; legacy fallback: ${legacy.error_message ?? legacy.status ?? legacyResponse.statusText}`);
    }
    googleSummary = cleanSourceText(legacy.result?.editorial_summary?.overview);
    base = {
      businessStatus: legacy.result?.business_status,
      types: legacy.result?.types,
      website: legacy.result?.website,
      weekdayHours: legacy.result?.opening_hours?.weekday_text,
      hours: legacyApiHours(legacy.result?.opening_hours?.periods),
    };
  }

  if (googleSummary) return { source: "google_summary", summary: googleSummary, ...base };

  if (WEBSITE_FALLBACK && base.website) {
    try {
      const websiteSummary = await fetchWebsiteDescription(base.website);
      if (websiteSummary) return { source: "official_website", summary: websiteSummary, ...base };
    } catch (error) {
      console.warn(`  #${row.id} — official website unavailable: ${(error as Error).message}`);
    }
  }
  return { source: "database", ...base };
}

async function persistGoogleEnrichment(pool: Pool, row: SalonRow, context: SourceContext): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO salon_google_places
         (salon_id, display_name, business_status, last_fetched_at, last_fetch_attempted_at, last_fetch_success, last_fetch_error)
       VALUES ($1, $2, $3, now(), now(), true, NULL)
       ON CONFLICT (salon_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         business_status = EXCLUDED.business_status,
         last_fetched_at = now(),
         last_fetch_attempted_at = now(),
         last_fetch_success = true,
         last_fetch_error = NULL,
         updated_at = now()`,
      [row.id, row.name, context.businessStatus ?? null]
    );

    if (context.hours?.length) {
      await client.query(`DELETE FROM salon_google_hours WHERE salon_id = $1 AND special_date IS NULL`, [row.id]);
      for (const hour of context.hours) {
        await client.query(
          `INSERT INTO salon_google_hours
             (salon_id, day_of_week, open_time, close_time, is_closed_all_day, special_date, period_order, fetched_at)
           VALUES ($1, $2, $3, $4, $5, NULL, $6, now())`,
          [row.id, hour.day, hour.openTime, hour.closeTime, hour.closedAllDay, hour.periodOrder]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordGoogleFailure(pool: Pool, row: SalonRow, error: Error): Promise<void> {
  await pool.query(
    `INSERT INTO salon_google_places
       (salon_id, display_name, last_fetch_attempted_at, last_fetch_success, last_fetch_error)
     VALUES ($1, $2, now(), false, $3)
     ON CONFLICT (salon_id) DO UPDATE SET
       last_fetch_attempted_at = now(),
       last_fetch_success = false,
       last_fetch_error = EXCLUDED.last_fetch_error,
       updated_at = now()`,
    [row.id, row.name, error.message.slice(0, 1000)]
  );
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const lockClient = await pool.connect();
  const lock = await lockClient.query<{ acquired: boolean }>(`SELECT pg_try_advisory_lock(7300500) AS acquired`);
  if (!lock.rows[0]?.acquired) {
    console.error("Another salon enrichment run is active; exiting so the 500-record daily cap cannot be exceeded by concurrent runs.");
    lockClient.release();
    await pool.end();
    return;
  }

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (CALL_OPENAI && !apiKey) {
    console.error("No OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY set.");
    process.exit(1);
  }
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (USE_GOOGLE && !googleApiKey) {
    console.warn("No GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY set; using database facts only.");
  }

  let openai: import("openai").default | null = null;
  if (CALL_OPENAI) {
    const { default: OpenAI } = await import("openai");
    openai = new OpenAI({
      apiKey: apiKey!,
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
        ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
    });
  }

  const persistGoogleData = USE_GOOGLE && Boolean(googleApiKey) && !DRY && !INSPECT_SOURCES;
  let dailyGoogleUsed = 0;
  let effectiveLimit = LIMIT > 0 ? LIMIT : Number.MAX_SAFE_INTEGER;
  if (persistGoogleData) {
    const dailyUsage = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM salon_google_places
        WHERE last_fetch_attempted_at >= CURRENT_DATE
          AND last_fetch_attempted_at < CURRENT_DATE + INTERVAL '1 day'`
    );
    dailyGoogleUsed = Number(dailyUsage.rows[0]?.count ?? 0);
    effectiveLimit = Math.min(effectiveLimit, Math.max(0, DAILY_GOOGLE_LOOKUP_LIMIT - dailyGoogleUsed));
    console.log(`Google daily allowance: ${dailyGoogleUsed}/${DAILY_GOOGLE_LOOKUP_LIMIT} already used; this run may process up to ${effectiveLimit}.`);
  }

  if (effectiveLimit === 0) {
    console.log(`Daily Google Places limit of ${DAILY_GOOGLE_LOOKUP_LIMIT} records has been reached; nothing to process.`);
    await lockClient.query(`SELECT pg_advisory_unlock(7300500)`);
    lockClient.release();
    await pool.end();
    return;
  }

  const selectionFilter = REGENERATE_ALL ? "TRUE" : "ns.about_text IS NULL";
  const enrichmentFilter = persistGoogleData ? "AND sgp.last_fetch_success IS DISTINCT FROM true" : "";
  const { rows } = await pool.query<SalonRow>(
    `SELECT ns.id, ns.name, ns.address, ns.rating, ns.review_count, ns.place_id
       FROM nail_salons ns
       LEFT JOIN salon_google_places sgp ON sgp.salon_id = ns.id
      WHERE ${selectionFilter}
        ${enrichmentFilter}
      ORDER BY sgp.last_fetch_attempted_at NULLS FIRST, ns.id
      ${Number.isSafeInteger(effectiveLimit) ? "LIMIT $1" : ""}`,
    Number.isSafeInteger(effectiveLimit) ? [effectiveLimit] : []
  );

  console.log(`${rows.length} row(s) to process${LIMIT > 0 ? ` (limited to ${LIMIT})` : ""}${REGENERATE_ALL ? " — REGENERATE ALL" : ""}${DRY ? " — DRY RUN" : ""}${NO_CALL ? " — NO API CALLS" : ""}${INSPECT_SOURCES ? " — SOURCE INSPECTION (NO OPENAI / NO WRITES)" : ""}.`);
  if (rows.length === 0) {
    await lockClient.query(`SELECT pg_advisory_unlock(7300500)`);
    lockClient.release();
    await pool.end();
    return;
  }

  const uniquenessIndex = new UniquenessIndex();
  const existing = await pool.query<ExistingAboutRow>(
    `SELECT id, name, address, about_text FROM nail_salons WHERE about_text IS NOT NULL`
  );
  for (const row of existing.rows) uniquenessIndex.add(row.id, row.about_text, row);
  console.log(`Uniqueness index loaded with ${existing.rows.length} existing About texts; accepted replacements update it immediately.`);

  let done = 0, failed = 0, googleRequests = 0, rejectedDrafts = 0, peakAcceptedSimilarity = 0;
  const sourceCounts: Record<SourceContext["source"], number> = { google_summary: 0, official_website: 0, database: 0 };
  let totalInTok = 0, totalOutTok = 0;

  let lookupsSincePause = 0;
  for (let i = 0; i < rows.length;) {
    const slotsUntilPause = USE_GOOGLE ? GOOGLE_LOOKUPS_PER_PAUSE - lookupsSincePause : CONCURRENCY;
    const batchSize = Math.max(1, Math.min(CONCURRENCY, slotsUntilPause));
    const batch = rows.slice(i, i + batchSize);
    await Promise.all(batch.map(async (row: SalonRow) => {
      try {
        if (USE_GOOGLE && googleApiKey && row.place_id) googleRequests++;
        let context: SourceContext = { source: "database" };
        let googleFetched = false;
        try {
          context = await fetchSourceContext(row, googleApiKey);
          googleFetched = USE_GOOGLE && Boolean(googleApiKey) && Boolean(row.place_id);
        } catch (error) {
          console.warn(`  #${row.id} — Google enrichment unavailable; using database facts: ${(error as Error).message}`);
          if (persistGoogleData) {
            try { await recordGoogleFailure(pool, row, error as Error); }
            catch (writeError) { console.error(`  #${row.id} — failed to record Google error: ${(writeError as Error).message}`); }
          }
        }
        if (persistGoogleData && googleFetched) {
          await persistGoogleEnrichment(pool, row, context);
          console.log(`  #${row.id} — stored ${context.hours?.length ?? 0} Google business-hour row(s)`);
        }
        sourceCounts[context.source]++;
        if (INSPECT_SOURCES) {
          console.log(`\n#${row.id} ${row.name}`);
          console.log(`Place ID: ${row.place_id}`);
          console.log(`Source: ${context.source}`);
          console.log(`Business status: ${context.businessStatus ?? "not returned"}`);
          console.log(`Google categories: ${context.types?.join(", ") || "not returned"}`);
          console.log(`Official website: ${context.website ?? "not returned"}`);
          console.log(`Business hours: ${context.weekdayHours?.join(" | ") || "not returned"}`);
          console.log(`Structured hour rows ready to store: ${context.hours?.length ?? 0}`);
          console.log(`Source description: ${context.summary ?? "no description returned"}`);
          done++;
          return;
        }
        const previewPrompt = buildPrompt(row, context);
        if (DRY) {
          console.log(`\n#${row.id} ${row.name} [source: ${context.source}]\n---\n${previewPrompt}\n---`);
        }
        if (NO_CALL) { done++; return; }

        let text = "";
        let rejectedText: string | undefined;
        let bestSimilarity = 0;
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
          const prompt = buildPrompt(row, context, attempt, rejectedText);
          const completion = await openai!.chat.completions.create({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: Math.min(1.15, 0.9 + attempt * 0.08),
          });
          const candidate = completion.choices[0]?.message?.content?.trim() ?? "";
          const usage = completion.usage;
          if (usage) { totalInTok += usage.prompt_tokens; totalOutTok += usage.completion_tokens; }
          if (!candidate) {
            console.warn(`  #${row.id} — attempt ${attempt + 1}: empty response`);
            continue;
          }

          const qualityFailure = validateDraft(candidate, row);
          const uniqueness = uniquenessIndex.check(candidate, row);
          bestSimilarity = Math.max(bestSimilarity, uniqueness.similarity);
          if (!qualityFailure && uniqueness.unique) {
            text = candidate;
            uniquenessIndex.add(row.id, candidate, row);
            peakAcceptedSimilarity = Math.max(peakAcceptedSimilarity, uniqueness.similarity);
            if (attempt > 0) console.log(`  #${row.id} — accepted unique draft on attempt ${attempt + 1}`);
            break;
          }

          rejectedDrafts++;
          const reason = qualityFailure ?? `${uniqueness.reason} (${(uniqueness.similarity * 100).toFixed(1)}% similar to #${uniqueness.matchingId ?? "unknown"})`;
          console.warn(`  #${row.id} — attempt ${attempt + 1} rejected: ${reason}`);
          rejectedText = candidate;
        }
        if (!text) {
          console.warn(`  #${row.id} — no sufficiently unique, SEO-valid draft after ${MAX_GENERATION_ATTEMPTS} attempts (highest similarity ${(bestSimilarity * 100).toFixed(1)}%); skipped`);
          failed++;
          return;
        }

        if (DRY) {
          console.log(`RESULT [max corpus similarity ${(bestSimilarity * 100).toFixed(1)}%]: ${text}`);
        } else {
          await pool.query(`UPDATE nail_salons SET about_text = $1, last_seen_at = now() WHERE id = $2`, [text, row.id]);
        }
        done++;
      } catch (err) {
        console.error(`  #${row.id} (${row.name}) FAILED:`, (err as Error).message);
        failed++;
      }
    }));
    i += batch.length;

    if (USE_GOOGLE) {
      lookupsSincePause += batch.filter((row) => Boolean(googleApiKey && row.place_id)).length;
      if (lookupsSincePause >= GOOGLE_LOOKUPS_PER_PAUSE) {
        lookupsSincePause = 0;
        if (i < rows.length && PAUSE_MS > 0) {
          console.log(`  pausing ${PAUSE_MS}ms after ${GOOGLE_LOOKUPS_PER_PAUSE} Google lookups...`);
          await sleep(PAUSE_MS);
        }
      }
    }

    const estCost = (totalInTok / 1_000_000) * PRICE_PER_1M_INPUT + (totalOutTok / 1_000_000) * PRICE_PER_1M_OUTPUT;
    console.log(`  progress: ${done + failed}/${rows.length} (${failed} failed) — OpenAI est. cost so far: $${estCost.toFixed(4)}`);
  }

  const estCost = (totalInTok / 1_000_000) * PRICE_PER_1M_INPUT + (totalOutTok / 1_000_000) * PRICE_PER_1M_OUTPUT;
  console.log(`\nDone. ${done}/${rows.length} succeeded, ${failed} failed. Estimated OpenAI cost: $${estCost.toFixed(4)} (${totalInTok} in / ${totalOutTok} out tokens).`);
  console.log(`Uniqueness: ${rejectedDrafts} draft(s) rejected and regenerated; highest accepted template similarity ${(peakAcceptedSimilarity * 100).toFixed(1)}% (limit ${(MAX_TEMPLATE_SIMILARITY * 100).toFixed(0)}%).`);
  console.log(`Sources: ${sourceCounts.google_summary} Google summaries, ${sourceCounts.official_website} official websites, ${sourceCounts.database} database-only fallbacks. Google Places lookups: ${googleRequests} (a blocked new-API lookup may retry the legacy API; check Google Cloud billing for exact cost).`);
  await lockClient.query(`SELECT pg_advisory_unlock(7300500)`);
  lockClient.release();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
