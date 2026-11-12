/**
 * Last Cut Formula Phase 4: writes the reference-image manifest for the hairstyle library (every style × front, left,
 * right, back, detail; R2 key, prompt, alt text) to docs/last-cut-formula/hairstyle-image-manifest.json for a later
 * image-generation batch. Read-only: touches no database and no storage.
 *   cd artifacts/api-server && pnpm tsx ../../scripts/export-hairstyle-image-manifest.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageManifest } from "../shared/hairstyleImageManifest";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/last-cut-formula/hairstyle-image-manifest.json");
const entries = imageManifest();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated: "from shared/hairstyleCatalog.ts", styles: new Set(entries.map((e) => e.slug)).size, images: entries.length, entries }, null, 2) + "\n");
console.log(`Wrote ${entries.length} image slots for ${new Set(entries.map((e) => e.slug)).size} styles to ${out}`);
