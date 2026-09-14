/**
 * One-off backfill: generates a short, GEO/SEO-friendly "About us" text for
 * every nail_salons row missing one, using OpenAI's gpt-4o-mini (the
 * cheapest model — same convention used everywhere else in this codebase,
 * e.g. routes.ts's bulk service-description generators).
 *
 * Grounds the prompt in only real data (name, street, city, state, rating,
 * review count) — explicitly instructed not to invent years-in-business,
 * awards, staff names, or specific services we have no record of. The model
 * may name a neighborhood only if it's confident one is real for that city;
 * otherwise it sticks to city/state. This matches the "honest, no
 * fabrication" approach already used throughout the marketplace feature.
 *
 * Idempotent / resumable: only ever selects rows where about_text IS NULL,
 * and writes each row's result immediately — safe to stop (Ctrl+C) and
 * re-run at any time; already-completed rows are never revisited or billed
 * again.
 *
 * Run:
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *     pnpm tsx ../../scripts/generate-salon-about-text.ts [--dry] [--limit=N] [--concurrency=N]
 *
 *   --dry           Print the prompt/response for each row, write nothing, call OpenAI (unless combined with --no-call)
 *   --no-call       Combine with --dry to skip the OpenAI call entirely (prompt preview + cost estimate only)
 *   --limit=N       Only process the first N pending rows (for testing)
 *   --concurrency=N Parallel in-flight requests (default 5)
 */

import { Pool } from "pg";
import { splitAddress } from "../artifacts/api-server/src/lib/salonData";

const DRY = process.argv.includes("--dry");
const NO_CALL = process.argv.includes("--no-call");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 5);

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

interface SalonRow {
  id: number;
  name: string;
  address: string | null;
  rating: number | null;
  review_count: number | null;
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

function buildPrompt(row: SalonRow): string {
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
    ``,
    `Requirements:`,
    `- 2-3 sentences, 40-70 words total`,
    `- Warm, professional tone — written for potential customers discovering this business`,
    `- Naturally mention the city (and state if it helps disambiguate) for local SEO`,
    `- Only mention a specific neighborhood if you are genuinely confident it is a real, well-known neighborhood of that exact city — otherwise do not mention one`,
    `- Do NOT invent specific facts not given above: no years in business, no awards, no staff names, no specific services beyond general nail care (manicures, pedicures, nail enhancements) unless stated`,
    `- Do NOT invent any discount, promotion, deal, or special offer (e.g. "10% off", "free upgrade") — none was given, so none exists; mentioning one would be false advertising on a real business's page`,
    `- Do NOT repeat the rating/review count as a sentence (it's context only)`,
    `- No hashtags, no markdown, no emojis, no quotation marks around the output`,
    `- ${angle}`,
    `- This text will sit alongside thousands of similar pages for other salons — vary your sentence structure and word choice so it doesn't read like a template. Do NOT start with any of: ${OPENING_BANS.map((b) => `"${b.replace("{name}", row.name)}"`).join(", ")}.`,
    ``,
    `Return only the About us text — nothing else.`,
  ].filter(Boolean).join("\n");
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!NO_CALL && !apiKey) {
    console.error("No OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY set.");
    process.exit(1);
  }

  let openai: import("openai").default | null = null;
  if (!NO_CALL) {
    const { default: OpenAI } = await import("openai");
    openai = new OpenAI({
      apiKey: apiKey!,
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
        ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
    });
  }

  const { rows } = await pool.query<SalonRow>(
    `SELECT id, name, address, rating, review_count
       FROM nail_salons
      WHERE about_text IS NULL
      ORDER BY id
      ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ""}`
  );

  console.log(`${rows.length} row(s) to process${LIMIT > 0 ? ` (limited to ${LIMIT})` : ""}${DRY ? " — DRY RUN" : ""}${NO_CALL ? " — NO API CALLS" : ""}.`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  let done = 0, failed = 0;
  let totalInTok = 0, totalOutTok = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const prompt = buildPrompt(row);
      if (DRY) {
        console.log(`\n#${row.id} ${row.name}\n---\n${prompt}\n---`);
      }
      if (NO_CALL) { done++; return; }
      try {
        const completion = await openai!.chat.completions.create({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
          temperature: 0.95,
        });
        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        const usage = completion.usage;
        if (usage) { totalInTok += usage.prompt_tokens; totalOutTok += usage.completion_tokens; }
        if (!text) { console.warn(`  #${row.id} — empty response, skipped`); failed++; return; }

        if (DRY) {
          console.log(`RESULT: ${text}`);
        } else {
          await pool.query(`UPDATE nail_salons SET about_text = $1 WHERE id = $2`, [text, row.id]);
        }
        done++;
      } catch (err) {
        console.error(`  #${row.id} (${row.name}) FAILED:`, (err as Error).message);
        failed++;
      }
    }));

    const estCost = (totalInTok / 1_000_000) * PRICE_PER_1M_INPUT + (totalOutTok / 1_000_000) * PRICE_PER_1M_OUTPUT;
    console.log(`  progress: ${done + failed}/${rows.length} (${failed} failed) — est. cost so far: $${estCost.toFixed(4)}`);
  }

  const estCost = (totalInTok / 1_000_000) * PRICE_PER_1M_INPUT + (totalOutTok / 1_000_000) * PRICE_PER_1M_OUTPUT;
  console.log(`\nDone. ${done}/${rows.length} succeeded, ${failed} failed. Estimated total cost: $${estCost.toFixed(4)} (${totalInTok} in / ${totalOutTok} out tokens).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
