/**
 * Seed default illustration categories into the DB.
 * Safe to run multiple times — uses INSERT … ON CONFLICT DO NOTHING.
 * Called automatically at API server startup.
 */

import { db } from "@workspace/db";
import { serviceIllustrationCategories } from "@shared/schema";
import { sql } from "drizzle-orm";

const DEFAULT_CATEGORIES: Array<{
  name: string;
  slug: string;
  description: string;
  industry: string;
  sortOrder: number;
}> = [
  // ─── NAIL_SALON ──────────────────────────────────────────────────────────────
  { name: "Acrylic Fill",       slug: "acrylic-fill",        description: "Acrylic nail fill / maintenance",       industry: "NAIL_SALON", sortOrder: 10 },
  { name: "Acrylic Full Set",   slug: "acrylic-full-set",    description: "New acrylic full set",                  industry: "NAIL_SALON", sortOrder: 20 },
  { name: "Dip Powder",         slug: "dip-powder",          description: "Dip powder / SNS manicure",             industry: "NAIL_SALON", sortOrder: 30 },
  { name: "Gel Full Set",       slug: "gel-full-set",        description: "Gel / builder gel full set",            industry: "NAIL_SALON", sortOrder: 40 },
  { name: "Classic Manicure",   slug: "classic-manicure",    description: "Regular / express manicure",            industry: "NAIL_SALON", sortOrder: 50 },
  { name: "Deluxe Manicure",    slug: "deluxe-manicure",     description: "Luxury or deluxe manicure",             industry: "NAIL_SALON", sortOrder: 60 },
  { name: "Gel Manicure",       slug: "gel-manicure",        description: "Gel polish / shellac manicure",         industry: "NAIL_SALON", sortOrder: 70 },
  { name: "Hot Stone Manicure", slug: "hot-stone-manicure",  description: "Hot stone manicure treatment",          industry: "NAIL_SALON", sortOrder: 80 },
  { name: "Pedicure",           slug: "pedicure",            description: "Standard pedicure",                     industry: "NAIL_SALON", sortOrder: 90 },
  { name: "Deluxe Pedicure",    slug: "deluxe-pedicure",     description: "Deluxe / luxury pedicure",              industry: "NAIL_SALON", sortOrder: 100 },
  { name: "Spa Pedicure",       slug: "spa-pedicure",        description: "Spa pedicure with add-ons",             industry: "NAIL_SALON", sortOrder: 110 },
  { name: "Nail Art",           slug: "nail-art",            description: "Custom nail art and designs",           industry: "NAIL_SALON", sortOrder: 120 },
  { name: "French Tip",         slug: "french-tip",          description: "French / American manicure or tip",     industry: "NAIL_SALON", sortOrder: 130 },
  { name: "Paraffin Treatment", slug: "paraffin-treatment",  description: "Paraffin wax hand or foot treatment",   industry: "NAIL_SALON", sortOrder: 140 },

  // ─── HAIR_SALON ──────────────────────────────────────────────────────────────
  { name: "Women's Haircut",    slug: "womens-haircut",      description: "Women's cut and style",                 industry: "HAIR_SALON", sortOrder: 10 },
  { name: "Men's Haircut",      slug: "mens-haircut",        description: "Men's and boys' haircuts",              industry: "HAIR_SALON", sortOrder: 20 },
  { name: "Haircut",            slug: "haircut",             description: "General haircut / trim",                industry: "HAIR_SALON", sortOrder: 30 },
  { name: "Hair Color",         slug: "hair-color",          description: "Single-process or all-over color",      industry: "HAIR_SALON", sortOrder: 40 },
  { name: "Highlights",         slug: "highlights",          description: "Partial or full highlights",            industry: "HAIR_SALON", sortOrder: 50 },
  { name: "Balayage",           slug: "balayage",            description: "Balayage / ombré color",                industry: "HAIR_SALON", sortOrder: 60 },
  { name: "Keratin Treatment",  slug: "keratin-treatment",   description: "Smoothing / keratin treatment",         industry: "HAIR_SALON", sortOrder: 70 },
  { name: "Hair Extensions",    slug: "hair-extensions",     description: "Tape-in, fusion, or weft extensions",   industry: "HAIR_SALON", sortOrder: 80 },
  { name: "Blowout",            slug: "blowout",             description: "Blowout and blowdry style",             industry: "HAIR_SALON", sortOrder: 90 },
  { name: "Wash & Style",       slug: "wash-and-style",      description: "Shampoo and style service",             industry: "HAIR_SALON", sortOrder: 100 },

  // ─── BARBER_SHOP ─────────────────────────────────────────────────────────────
  { name: "Barber Haircut",         slug: "barber-haircut",        description: "Barber haircut / fade",            industry: "BARBER_SHOP", sortOrder: 10 },
  { name: "Beard Trim",             slug: "beard-trim",            description: "Beard trim and shaping",           industry: "BARBER_SHOP", sortOrder: 20 },
  { name: "Straight Razor Shave",   slug: "straight-razor-shave",  description: "Traditional straight-razor shave", industry: "BARBER_SHOP", sortOrder: 30 },
  { name: "Hot Towel Shave",        slug: "hot-towel-shave",       description: "Hot towel shave experience",       industry: "BARBER_SHOP", sortOrder: 40 },
  { name: "Hair & Beard Combo",     slug: "hair-and-beard-combo",  description: "Haircut + beard combo service",    industry: "BARBER_SHOP", sortOrder: 50 },

  // ─── SPA ─────────────────────────────────────────────────────────────────────
  { name: "Facial",               slug: "facial",               description: "Classic facial treatment",          industry: "SPA", sortOrder: 10 },
  { name: "Deep Cleansing Facial", slug: "deep-cleansing-facial", description: "Deep pore cleansing facial",      industry: "SPA", sortOrder: 20 },
  { name: "Massage",              slug: "massage",              description: "Relaxation or Swedish massage",     industry: "SPA", sortOrder: 30 },
  { name: "Hot Stone Massage",    slug: "hot-stone-massage",    description: "Hot stone therapy massage",         industry: "SPA", sortOrder: 40 },
  { name: "Body Wrap",            slug: "body-wrap",            description: "Body wrap treatment",               industry: "SPA", sortOrder: 50 },
  { name: "Body Scrub",           slug: "body-scrub",           description: "Body scrub / exfoliation",          industry: "SPA", sortOrder: 60 },
  { name: "Waxing",               slug: "waxing",               description: "Hair removal waxing service",       industry: "SPA", sortOrder: 70 },
  { name: "Eyebrow Service",      slug: "eyebrow-service",      description: "Brow shaping, tinting, or lash",    industry: "SPA", sortOrder: 80 },
];

export async function seedIllustrationCategories(): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO service_illustration_categories
        (name, slug, description, industry, sort_order, is_active)
      VALUES
        ${sql.join(
          DEFAULT_CATEGORIES.map(c =>
            sql`(${c.name}, ${c.slug}, ${c.description}, ${c.industry}, ${c.sortOrder}, true)`
          ),
          sql`, `
        )}
      ON CONFLICT (slug) DO NOTHING
    `);
    const result = await db.execute(sql`SELECT COUNT(*)::int AS n FROM service_illustration_categories`);
    console.log(`[IllustrationSeed] ${(result.rows[0] as any).n} categories in library`);
  } catch (err: any) {
    console.warn("[IllustrationSeed] Seed skipped (table may not exist yet):", err?.message?.slice(0, 80));
  }
}
