/**
 * Last Cut Formula Phase 5 — hairstyle reference-image batches (front, left, right, back per style).
 *
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a
 *   pnpm tsx ../../scripts/hairstyle-image-batch.ts build    --batch 01 --from 0 --count 20   # batch.json from the manifest
 *   pnpm tsx ../../scripts/hairstyle-image-batch.ts generate --batch 01 [--only <slug>]          # OpenAI images (resumable)
 *   pnpm tsx ../../scripts/hairstyle-image-batch.ts validate --batch 01                          # automated consistency checks
 *   pnpm tsx ../../scripts/hairstyle-image-batch.ts upload   --batch 01 [--apply]                # → PENDING rows (never approved)
 *
 * Reads docs/last-cut-formula/hairstyle-image-manifest.json (the Phase 4 manifest; the catalog is not recreated).
 * Files: HAIRSTYLE_BATCH_DIR (default /var/lib/certxa/hairstyle-batches)/batch-<n>/<slug>/<view>.png — outside R2 and the
 * web root. Consistency: one fictional model and one cut sheet per style; the front view is generated first and is the
 * reference image for the left, right and back views. Uploading creates pending images in the private review store;
 * an admin approves each one in /isadmin/hairstyle-library. Nothing here approves or publishes.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HAIRSTYLE_CATALOG } from "../shared/hairstyleCatalog";
import { cutSummary } from "../shared/hairstyleImageManifest";

const HERE = dirname(fileURLToPath(import.meta.url));
// openai and sharp are the API server's dependencies (this script lives outside its package).
const apiRequire = createRequire(resolve(HERE, "../artifacts/api-server/package.json"));
const MANIFEST = resolve(HERE, "../docs/last-cut-formula/hairstyle-image-manifest.json");
const ROOT = process.env.HAIRSTYLE_BATCH_DIR || "/var/lib/certxa/hairstyle-batches";
const VIEWS = ["front", "left", "right", "back"] as const;
type View = (typeof VIEWS)[number];
const arg = (name: string, dflt?: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const batchName = () => `batch-${String(arg("batch", "01")).padStart(2, "0")}`;
const batchDir = () => join(ROOT, batchName());
const MODEL = process.env.HAIRSTYLE_IMAGE_MODEL || "gpt-image-2";

// One fictional model per style (rotating, so the library shows different people and hair textures); the texture is
// always one the style suits.
const PEOPLE = [
  { who: "a fictional man in his late 20s with deep brown skin and short black hair", texture: "coily" },
  { who: "a fictional man in his early 30s with light olive skin and dark brown hair", texture: "straight" },
  { who: "a fictional man in his mid 20s with medium brown skin and black hair", texture: "curly" },
  { who: "a fictional man in his late 30s with fair skin and medium brown hair", texture: "wavy" },
  { who: "a fictional man in his early 20s with light brown skin and dark hair", texture: "straight" },
  { who: "a fictional man in his 40s with dark brown skin and black hair with a little grey", texture: "coily" },
] as const;

type Record_ = { slug: string; name: string; view: View; file: string; r2Key: string; altText: string; prompt: string; reference: string | null };
type Batch = { batch: string; model: string; created: string; styles: { slug: string; name: string; person: string; texture: string; sheet: string }[]; records: Record_[] };

const VIEW_TEXT: Record<View, string> = {
  front: "Front view: facing the camera straight on, eyes level, both temples visible.",
  left: "Left side view: the man's left profile at exactly 90 degrees, left ear and sideburn fully visible.",
  right: "Right side view: the man's right profile at exactly 90 degrees, right ear and sideburn fully visible.",
  back: "Back view: the back of the head straight on, showing the nape, neckline and crown.",
};

function cutSheet(slug: string): { sheet: string; person: string; texture: string } {
  const s = HAIRSTYLE_CATALOG.find((x) => x.slug === slug);
  if (!s) throw new Error(`Unknown style ${slug}`);
  const idx = HAIRSTYLE_CATALOG.indexOf(s);
  const person = [...PEOPLE.slice(idx % PEOPLE.length), ...PEOPLE.slice(0, idx % PEOPLE.length)].find((p) => s.suits.includes(p.texture as any)) ?? PEOPLE[1];
  const p = s.spec;
  const parts = [
    `Haircut: ${s.name}. ${s.description}`,
    `Exact cut (identical in every view): ${cutSummary(s)}.`,
    p.fade?.start && p.fade?.end ? `Fade blends from ${p.fade.start.guard} at the bottom to ${p.fade.end.guard}.` : "",
    p.top?.length ? `Top length about ${p.top.length.value}${p.top.length.unit === "guard" ? " guard" : p.top.length.unit === "in" ? " inches" : " mm"}.` : "",
    p.instructions ? `Barber's notes: ${p.instructions}` : "",
    `Hair texture: ${person.texture}.`,
  ];
  return { sheet: parts.filter(Boolean).join(" "), person: person.who, texture: person.texture };
}

function prompt(view: View, name: string, sheet: string, person: string): string {
  const style = "Premium, realistic barbershop reference photograph. Head and shoulders, plain charcoal barber cape, seamless light-grey studio background, soft even studio lighting, sharp focus on the haircut, neutral expression. No text, no logos, no watermark, no jewellery. The man is fictional, not a real or recognisable person.";
  return view === "front"
    ? `${style} Subject: ${person}. ${sheet} ${VIEW_TEXT.front}`
    : `${style} Use the reference image: the SAME man with the SAME ${name} haircut — keep the identical fade height, top length, hair texture, hairline, hair colour, lighting and background. ${sheet} ${VIEW_TEXT[view]}`;
}

function build() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { entries: { slug: string; name: string; view: string; r2Key: string; altText: string }[] };
  const order: string[] = [];
  for (const e of manifest.entries) if (!order.includes(e.slug)) order.push(e.slug);
  const from = Number(arg("from", "0")), count = Number(arg("count", "20"));
  const slugs = order.slice(from, from + count);
  const styles = slugs.map((slug) => { const c = cutSheet(slug); return { slug, name: HAIRSTYLE_CATALOG.find((s) => s.slug === slug)!.name, ...c }; });
  const records: Record_[] = styles.flatMap((s) => VIEWS.map((view) => {
    const m = manifest.entries.find((e) => e.slug === s.slug && e.view === view)!;
    return { slug: s.slug, name: s.name, view, file: `${s.slug}/${view}.png`, r2Key: m.r2Key, altText: m.altText.replace("reference illustration", "AI-generated reference image"),
      prompt: prompt(view, s.name, s.sheet, s.person), reference: view === "front" ? null : `${s.slug}/front.png` };
  }));
  const batch: Batch = { batch: batchName(), model: MODEL, created: new Date().toISOString(), styles, records };
  mkdirSync(batchDir(), { recursive: true, mode: 0o700 });
  writeFileSync(join(batchDir(), "batch.json"), JSON.stringify(batch, null, 2) + "\n");
  console.log(`${batch.batch}: ${styles.length} styles, ${records.length} images → ${join(batchDir(), "batch.json")}`);
}

const loadBatch = (): Batch => JSON.parse(readFileSync(join(batchDir(), "batch.json"), "utf8"));
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex").slice(0, 16);

async function generate() {
  const { default: OpenAI, toFile } = apiRequire("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const b = loadBatch();
  const only = arg("only");
  const log = join(batchDir(), "generation-log.jsonl");
  // Front views first: every other view of a style is made from its front.
  const todo = [...b.records].filter((r) => !only || r.slug === only).sort((x, y) => (x.view === "front" ? 0 : 1) - (y.view === "front" ? 0 : 1));
  for (const r of todo) {
    const out = join(batchDir(), r.file);
    if (existsSync(out)) continue; // resumable
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    const started = Date.now();
    const res = r.reference
      ? await openai.images.edit({ model: b.model, image: [await toFile(readFileSync(join(batchDir(), r.reference)), "front.png", { type: "image/png" })], prompt: r.prompt, size: "1024x1024", quality: "high" } as any)
      : await openai.images.generate({ model: b.model, prompt: r.prompt, size: "1024x1024", quality: "high" } as any);
    const b64 = (res as any).data?.[0]?.b64_json;
    if (!b64) throw new Error(`No image returned for ${r.file}`);
    const png = Buffer.from(b64, "base64");
    writeFileSync(out, png, { mode: 0o600 });
    appendFileSync(log, JSON.stringify({ file: r.file, model: b.model, reference: r.reference, promptSha: sha(r.prompt), bytes: png.length, sha: sha(png), ms: Date.now() - started, at: new Date().toISOString(), usage: (res as any).usage ?? null }) + "\n");
    console.log(`generated ${r.file} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
}

async function validate() {
  const sharp = apiRequire("sharp");
  const b = loadBatch();
  const results: { slug: string; checks: Record<string, boolean | string> }[] = [];
  // 8×8 average hash of the grey image: views of one style must differ (not the same picture repeated).
  const ahash = async (file: string) => {
    const px = await sharp(file).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
    const avg = px.reduce((a, v) => a + v, 0) / px.length;
    return [...px].map((v) => (v > avg ? 1 : 0));
  };
  for (const s of b.styles) {
    const files = VIEWS.map((v) => join(batchDir(), s.slug, `${v}.png`));
    const present = files.every(existsSync);
    const checks: Record<string, boolean | string> = { allFourViews: present };
    if (present) {
      const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
      checks.squareSameSize = metas.every((m) => m.width === metas[0].width && m.height === metas[0].height && m.width === m.height && (m.width ?? 0) >= 1024);
      // Background: the four corners of every view are light, neutral grey and alike across the views.
      const corners = await Promise.all(files.map(async (f) => {
        const { data, info } = await sharp(f).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const at = (x: number, y: number) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
        const px = [at(1, 1), at(62, 1)]; // top corners (the bottom ones show the cape)
        const mean = px.flat().reduce((a, v) => a + v, 0) / 6;
        const chroma = Math.max(...px.map(([r, g, b2]) => Math.max(r, g, b2) - Math.min(r, g, b2)));
        return { mean, chroma };
      }));
      checks.neutralBackground = corners.every((c) => c.chroma <= 28 && c.mean >= 120);
      checks.consistentBackground = Math.max(...corners.map((c) => c.mean)) - Math.min(...corners.map((c) => c.mean)) <= 40;
      // Overall brightness alike across the views (same lighting).
      const lum = await Promise.all(files.map(async (f) => (await sharp(f).greyscale().stats()).channels[0].mean));
      checks.consistentLighting = Math.max(...lum) - Math.min(...lum) <= 35;
      const hashes = await Promise.all(files.map(ahash));
      const dist = (a: number[], c: number[]) => a.reduce((n, v, i) => n + (v !== c[i] ? 1 : 0), 0);
      let minDist = 64;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) minDist = Math.min(minDist, dist(hashes[i], hashes[j]));
      checks.viewsAreDistinct = minDist >= 3;
      checks.minViewHashDistance = String(minDist);
    }
    results.push({ slug: s.slug, checks });
  }
  const out = join(batchDir(), "validation.json");
  writeFileSync(out, JSON.stringify({ batch: b.batch, at: new Date().toISOString(), results }, null, 2) + "\n");
  const failed = results.filter((r) => Object.entries(r.checks).some(([k, v]) => k !== "minViewHashDistance" && v === false));
  for (const r of results) console.log(`${failed.includes(r) ? "CHECK" : "ok   "} ${r.slug} ${JSON.stringify(r.checks)}`);
  console.log(`${results.length - failed.length}/${results.length} styles passed the automated checks → ${out}`);
  if (failed.length) process.exitCode = 1;
}

async function upload() {
  const apply = process.argv.includes("--apply");
  const { pool } = await import("../artifacts/api-server/src/db");
  const { addPendingImage } = await import("../artifacts/api-server/src/lib/hairstyleImageStore");
  const b = loadBatch();
  let added = 0, skipped = 0;
  try {
    for (const r of b.records) {
      const t = (await pool.query(`SELECT id FROM hairstyle_templates WHERE store_id IS NULL AND slug = $1`, [r.slug])).rows[0];
      if (!t) throw new Error(`Style ${r.slug} is not in this database (run the catalog import first)`);
      const done = (await pool.query(`SELECT 1 FROM hairstyle_template_images WHERE template_id = $1 AND metadata->>'batchFile' = $2`, [t.id, `${b.batch}/${r.file}`])).rowCount;
      if (done) { skipped++; continue; }
      const file = join(batchDir(), r.file);
      if (!existsSync(file)) throw new Error(`Missing ${file} (generate first)`);
      if (apply) {
        await addPendingImage(pool, { templateId: t.id, view: r.view, buffer: readFileSync(file), source: "ai_generated", altText: r.altText,
          metadata: { batch: b.batch, batchFile: `${b.batch}/${r.file}`, model: b.model, promptSha: sha(r.prompt), reference: r.reference } });
      }
      added++;
    }
    console.log(`${apply ? "Uploaded as PENDING" : "Dry run (nothing written)"}: ${added} new, ${skipped} already uploaded. Approve each one in /isadmin/hairstyle-library.`);
  } finally { await pool.end(); }
}

const cmd = process.argv[2];
const run = { build, generate, validate, upload }[cmd as "build"];
if (!run) { console.error("usage: hairstyle-image-batch.ts build|generate|validate|upload --batch 01"); process.exit(2); }
await run();
