/**
 * Reference-image plan for the global hairstyle library (Phase 4). No images exist yet: this is the manifest for a later
 * image-generation (or photography) batch. For every style: front, left, right and back views (required) and a detail
 * view (optional), each with its R2 key and a generation prompt written so all views show the SAME haircut on the
 * SAME illustrated model. Nothing here is ever shown to barbers: an image becomes visible only after it is uploaded
 * and approved in /isadmin/hairstyle-library (routes/hairstyleAdmin.ts), which records who approved it.
 *
 * R2 keys: hairstyles/global/<slug>/<view>-<n>.webp — by slug, so the same key works on every environment
 * (template ids differ between databases). The admin upload stores the actual key it wrote.
 */
import { HAIRSTYLE_CATALOG, type CatalogStyle } from "./hairstyleCatalog";

export const IMAGE_VIEWS = ["front", "left", "right", "back", "detail"] as const;
export type ImageView = (typeof IMAGE_VIEWS)[number];
export const REQUIRED_VIEWS: ImageView[] = ["front", "left", "right", "back"];

export type ManifestEntry = { slug: string; name: string; category: string; view: ImageView; required: boolean; r2Key: string; prompt: string; altText: string };

const VIEW_TEXT: Record<ImageView, string> = {
  front: "front view, facing the camera, eyes level",
  left: "left profile, exactly 90 degrees, ear and sideburn visible",
  right: "right profile, exactly 90 degrees, ear and sideburn visible",
  back: "back view showing the nape, neckline and crown",
  detail: "close-up detail of the key technique (fade blend, part line, texture or neckline)",
};

/** A plain-words summary of the cut for the prompt, from the style's default spec. */
export function cutSummary(s: CatalogStyle): string {
  const p = s.spec;
  const bits: string[] = [];
  if (p.sides?.guard?.length) bits.push(`sides ${p.sides.guard.join("/")}`);
  if (p.sides?.length) bits.push(`sides ${p.sides.length.value}${p.sides.length.unit}`);
  if (p.fade?.type) bits.push(p.fade.type === "none" ? "no fade" : `${p.fade.height ?? ""} ${p.fade.type} fade`.trim());
  if (p.back?.blend === "disconnected") bits.push("disconnected undercut");
  if (p.top?.length) bits.push(`top ${p.top.length.value}${p.top.length.unit === "guard" ? " guard" : p.top.length.unit}`);
  if (p.top?.direction) bits.push(`styled ${p.top.direction.replace(/-/g, " ")}`);
  if (p.neckline?.shape?.length) bits.push(`${p.neckline.shape.join("/")} neckline`);
  if (p.sideburns?.length) bits.push(`${p.sideburns.length} sideburns`);
  if (p.beard) bits.push(`beard ${[p.beard.guard, p.beard.shape].filter(Boolean).join(" ")}`.trim());
  if (p.textured?.style) bits.push(`${p.textured.style}${p.textured.maintenance ? ` (${p.textured.maintenance})` : ""}`);
  if (p.hair?.texture) bits.push(`${p.hair.texture} hair`);
  return bits.join(", ");
}

export function imageManifest(catalog: CatalogStyle[] = HAIRSTYLE_CATALOG): ManifestEntry[] {
  return catalog.flatMap((s) => IMAGE_VIEWS.map((view) => ({
    slug: s.slug, name: s.name, category: s.category, view, required: REQUIRED_VIEWS.includes(view),
    r2Key: `hairstyles/global/${s.slug}/${view}-1.webp`,
    altText: `${s.name}, ${view} view (reference illustration)`,
    prompt: [
      `Barbershop hairstyle reference illustration of "${s.name}", ${VIEW_TEXT[view]}.`,
      `${s.description} Cut details: ${cutSummary(s)}.`,
      "Same illustrated adult male model, same haircut, lighting and framing in every view of this style.",
      "Head and shoulders, neutral light-grey background, soft even studio lighting, clean semi-realistic illustration.",
      "No text, no logos, no watermark, not a real or recognisable person.",
    ].join(" "),
  })));
}
