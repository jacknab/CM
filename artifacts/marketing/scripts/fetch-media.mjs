/**
 * Copies this site's own images from the Airo-hosted original into ./media so
 * the Certxa server can serve them itself at /airo-assets/images/<slot>.
 *
 * Only logos and files uploaded by the owner are copied. Stock photographs
 * (Getty, licensed through GoDaddy) are skipped unless --all is passed.
 *
 *   node scripts/fetch-media.mjs [--all]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://sirtxa.com/airo-assets/images/";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const all = process.argv.includes("--all");
const slots = JSON.parse(await readFile(join(root, "airo-media.json"), "utf-8"));

const wanted = [];
for (const [slot, info] of Object.entries(slots)) {
  const stock = String(info.currentUrl || "").includes("/getty/");
  if (stock && !all) continue;
  wanted.push(slot);
  if (info.mediaType === "logo" && info.darkSurfaceUrl) wanted.push(`${slot}/dark`);
}

const manifest = {};
for (const slot of wanted) {
  const res = await fetch(SOURCE + slot, { redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !/^(image|video)\//.test(type)) {
    console.error(`skip ${slot}: ${res.status} ${type}`);
    continue;
  }
  // A logo slot is both a file and the parent of its /dark variant, so each
  // slot is stored as a flat file name.
  const file = slot.replace(/\//g, "__");
  const dest = join(root, "media", file);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  manifest[slot] = { file, type: type.split(";")[0] };
  console.log(`ok ${slot} (${type})`);
  await new Promise((r) => setTimeout(r, 500));
}
await writeFile(join(root, "media", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
