/**
 * The business's booking website, <slug>.certxa.com: its link, its theme and its look. Used by the Certxa Pro
 * app's website setup (after sign-up, and Settings → Website). Owners only (a staff session is refused).
 *
 *   GET  /api/booking-site               link, address, theme, look, old links
 *   GET  /api/booking-site/check?slug=   is that link free for this business? (+ suggestions when not)
 *   PUT  /api/booking-site/slug          { slug }  change the link; the old one keeps leading here
 *   PUT  /api/booking-site               { theme?, site? }  theme and look (lib/bookingSlug.ts for link rules)
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { uploadToR2 } from "../lib/r2";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { bookingSlugAvailable, changeBookingSlug, slugFormatProblem, slugFromText, suggestBookingSlugs } from "../lib/bookingSlug";

const router = Router();

export const BOOKING_THEMES = ["bloom", "simple", "classic", "mobile"] as const;

/** A photo the business uploaded through Certxa (POST /api/uploads/image), never an outside address. */
const uploadedImage = z.string().trim().max(500).refine(
  (value) => value === "" || /^https:\/\/(www\.)?certxa\.com\/api\/r2\/[\w\-./]+$/.test(value) || /^\/(uploads|api\/r2)\/[\w\-./]+$/.test(value),
  "Upload the photo through Certxa.",
);
const siteInput = z.object({
  accent: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").or(z.literal("")).optional(),
  coverImage: uploadedImage.optional(),
  logoImage: uploadedImage.optional(),
  about: z.string().trim().max(600, "Keep the about text to 600 characters.").optional(),
  // "@studio.name", "studio.name" or an instagram.com link → "studio.name".
  instagram: z.string().trim().max(120).transform((value) => value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""))
    .refine((value) => value === "" || /^[A-Za-z0-9._]{1,30}$/.test(value), "Enter your Instagram name, like @yourstudio.").optional(),
  // "yourstudio", "@yourstudio" or a facebook.com link → "yourstudio" (or "profile.php?id=123" for a personal profile).
  facebook: z.string().trim().max(200).transform((value) => value.replace(/^https?:\/\/((www|m|web)\.)?(facebook|fb)\.com\//i, "").replace(/^@/, "").replace(/[/#].*$/, "").replace(/\?(?!id=).*$/, "").replace(/&.*$/, ""))
    .refine((value) => value === "" || /^[A-Za-z0-9.\-]{1,80}$/.test(value) || /^profile\.php\?id=\d{1,30}$/.test(value), "Enter your Facebook page name, like yourstudio, or paste its link.").optional(),
}).strict();
const updateInput = z.object({ theme: z.enum(BOOKING_THEMES, { message: "Choose one of the designs." }).optional(), site: siteInput.optional() }).strict()
  .refine((value) => value.theme !== undefined || value.site !== undefined, "Nothing to save.");

async function ownerStore(req: Request, res: Response): Promise<number | null> {
  if ((req.session as { staffId?: number } | undefined)?.staffId) { res.status(403).json({ message: "Only the owner can change the booking website." }); return null; }
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ message: "No store context" }); return null; }
  return storeId;
}

async function siteState(storeId: number) {
  const [store, old] = await Promise.all([
    pool.query<{ booking_slug: string | null; booking_theme: string | null; booking_site: Record<string, string> | null; name: string }>(
      "SELECT booking_slug, booking_theme, booking_site, name FROM locations WHERE id = $1", [storeId]),
    pool.query<{ old_slug: string }>("SELECT old_slug FROM booking_slug_history WHERE store_id = $1 ORDER BY changed_at DESC", [storeId]),
  ]);
  const row = store.rows[0];
  const slug = row?.booking_slug ?? null;
  return {
    slug,
    url: slug ? `https://${slug}.certxa.com` : null,
    theme: BOOKING_THEMES.includes((row?.booking_theme ?? "") as any) ? row!.booking_theme : "bloom",
    site: row?.booking_site ?? {},
    businessName: row?.name ?? "",
    oldSlugs: old.rows.map((r) => r.old_slug),
  };
}

router.get("/", async (req, res) => {
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    return res.json(await siteState(storeId));
  } catch (error) {
    console.error("[booking-site get]", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Could not load the booking website." });
  }
});

router.get("/check", async (req, res) => {
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    const typed = String(req.query.slug ?? "");
    const slug = slugFromText(typed);
    const problem = slugFormatProblem(slug);
    if (problem) return res.json({ slug, available: false, message: problem, suggestions: slug.length >= 3 ? await suggestBookingSlugs(slug, storeId) : [] });
    const available = await bookingSlugAvailable(slug, storeId);
    if (available) return res.json({ slug, available: true, message: null, suggestions: [] });
    const name = (await pool.query<{ name: string }>("SELECT name FROM locations WHERE id = $1", [storeId])).rows[0]?.name ?? "";
    return res.json({ slug, available: false, message: "That link is taken.", suggestions: await suggestBookingSlugs(slug, storeId, [name]) });
  } catch (error) {
    console.error("[booking-site check]", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Could not check that link." });
  }
});

router.put("/slug", async (req, res) => {
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    const slug = slugFromText(String(req.body?.slug ?? ""));
    const problem = slugFormatProblem(slug);
    if (problem) return res.status(400).json({ message: problem });
    if (!(await bookingSlugAvailable(slug, storeId))) return res.status(409).json({ message: "That link is taken.", suggestions: await suggestBookingSlugs(slug, storeId) });
    await changeBookingSlug(storeId, slug);
    return res.json(await siteState(storeId));
  } catch (error) {
    // Two businesses asking for the same free link at the same moment: the second one loses at the unique index.
    if ((error as { code?: string })?.code === "23505") return res.status(409).json({ message: "That link was just taken. Try another." });
    console.error("[booking-site slug]", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Could not change the link." });
  }
});

/** A cover photo or logo picked in the Certxa Pro app, sent as base64 (the phone's file upload proved unreliable);
 *  stored in R2 like every other upload. Returns its address for PUT / to save. */
const photoInput = z.object({
  data: z.string().min(100).max(9_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]).default("image/jpeg"),
}).strict();
router.post("/photo", async (req, res) => {
  const parsed = photoInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "That photo couldn't be read. Try another one." });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    const buffer = Buffer.from(parsed.data.data.replace(/^data:[^,]*,/, ""), "base64");
    if (buffer.length < 100) return res.status(400).json({ message: "That photo couldn't be read. Try another one." });
    const url = await uploadToR2(buffer, "images", `site-${storeId}.${parsed.data.mimeType.split("/")[1]}`, parsed.data.mimeType);
    return res.json({ url });
  } catch (error) {
    console.error("[booking-site photo]", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Could not save the photo. Try again." });
  }
});

router.put("/", async (req, res) => {
  const parsed = updateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    const { theme, site } = parsed.data;
    if (theme) await pool.query("UPDATE locations SET booking_theme = $1 WHERE id = $2", [theme, storeId]);
    if (site) {
      // Only the fields sent change; an empty value removes that field.
      const set = Object.fromEntries(Object.entries(site).filter(([, value]) => value !== ""));
      const removed = Object.entries(site).filter(([, value]) => value === "").map(([key]) => key);
      await pool.query(
        "UPDATE locations SET booking_site = (COALESCE(booking_site, '{}'::jsonb) - $3::text[]) || $1::jsonb WHERE id = $2",
        [JSON.stringify(set), storeId, removed]);
    }
    return res.json(await siteState(storeId));
  } catch (error) {
    console.error("[booking-site put]", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Could not save the booking website." });
  }
});

export default router;
