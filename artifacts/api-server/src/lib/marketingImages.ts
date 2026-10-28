
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type MarketingImageFit = "cover" | "contain";

export interface MarketingImageDefinition {
  slot: string;
  label: string;
  pages: string[];
  width: number;
  height: number;
  fit: MarketingImageFit;
  originalUrl?: string;
  cornerStyle: "rounded" | "none";
  note?: string;
  nativeAssetTargets?: string[];
}

const image = (
  slot: string,
  label: string,
  pages: string[],
  width: number,
  height: number,
  fit: MarketingImageFit = "cover",
  originalUrl?: string,
  cornerStyle: "rounded" | "none" = "rounded",
  note?: string,
  nativeAssetTargets?: string[],
): MarketingImageDefinition => ({ slot, label, pages, width, height, fit, originalUrl, cornerStyle, note, nativeAssetTargets });

/**
 * Audited image slots used by the React marketing pages. Every slot has a
 * locked output canvas so an admin replacement cannot change page geometry.
 */
export const MARKETING_IMAGES: MarketingImageDefinition[] = [
  image("pages/home/hero", "Home — hero salon", ["Home"], 1200, 900, "cover", undefined, "none"),
  image("pages/home/feature-booking", "Online booking", ["Home", "Features"], 700, 525),
  image("pages/home/feature-payments", "Salon POS", ["Home", "Features"], 700, 525),
  image("pages/home/feature-analytics", "Analytics and kiosk", ["Home", "Features"], 700, 525),
  image("pages/features/waitlist", "Waitlist management", ["Home", "Features"], 700, 525),
  image("pages/home/feature-turns", "Turn rotation", ["Home", "Features"], 700, 525),
  image("pages/home/feature-loyalty", "Clients and loyalty", ["Home", "Features"], 700, 525),
  image("pages/home/feature-autumn", "Autumn AI receptionist", ["Home"], 700, 525),
  image("pages/features/reviews", "Reviews and growth", ["Home", "Features"], 700, 525),
  image("pages/features/hero", "Self check-in kiosk", ["Features"], 700, 525),
  image("pages/features/notifications", "Client notifications", ["Features"], 700, 525),
  image("pages/features/staff-payroll", "Staff and payroll", ["Features"], 700, 525),
  image("pages/features/revenue-intelligence", "Revenue intelligence", ["Features"], 700, 525),
  image("pages/autumn/device-mockup", "Autumn — device mockup", ["Features"], 447, 558, "contain"),
  image("pages/autumn/software-screenshot", "Autumn — software screenshot", ["Autumn"], 1024, 576),
  image("team/thanh-lam-founder", "Founder portrait", ["About"], 1145, 1374),
  image("products/tablet-stand", "Check-in kiosk stand", ["Products"], 600, 600, "contain"),
  image("products/certxa-station-hero", "Certxa Station — hero", ["Products"], 1536, 1024, "cover", "/_site/images/products/certxa-station-hero.webp"),
  image("products/certxa-station", "Certxa Station — product card", ["Products"], 1200, 800, "contain", "/_site/images/products/certxa-station.webp"),
  image("products/certxa-check-in-tablet", "Customer check-in tablet", ["Products"], 1000, 1000, "cover", "/_site/images/products/certxa-check-in-tablet.webp"),
  image("products/certxa-thermal-printer", "Thermal printer", ["Products"], 1000, 1000, "cover", "/_site/images/products/certxa-thermal-printer.webp"),
  image("products/certxa-cash-drawer", "Cash drawer", ["Products"], 1000, 1000, "cover", "/_site/images/products/certxa-cash-drawer.webp"),
  image("products/stripe-m2-reader", "Stripe M2 card reader", ["Products"], 560, 560, "cover", "/_site/images/products/stripe-m2-reader.webp"),
  image("brand/header-logo", "Certxa header logo", ["All pages"], 679, 144, "contain", "/_site/logo.png", "none"),
  image("app/nail-wrapper-background", "/nail wrapper background", ["/nail lock screen", "/nail queue"], 780, 546, "cover", "/images/nail/lock-bg.jpg"),
  image("mobile/certxa-owner-icon", "Certxa Owner app icon", ["iOS", "Android"], 1024, 1024, "cover", "/images/mobile/certxa-owner-icon.png", "rounded", "Applied to the next native app build; installed apps keep their current icon.", ["apps/certxa-owner/assets/icon.png"]),
  image("mobile/certxa-solo-icon", "Certxa Solo app icon", ["iOS", "Android"], 1024, 1024, "cover", "/images/mobile/certxa-solo-icon.png", "rounded", "Applied to the next native app build; installed apps keep their current icon.", ["apps/certxa-solo/assets/icon.png"]),
  image("mobile/certxa-staff-icon", "Certxa Staff app icon", ["iOS", "Android"], 1024, 1024, "cover", "/images/mobile/certxa-staff-icon.png", "rounded", "Applied to the next native app build; installed apps keep their current icon.", ["apps/certxa-staff/assets/icon.png"]),
  image("mobile/staff-mobile-icon", "Staff Mobile app icon", ["iOS", "Android"], 1024, 1024, "cover", "/images/mobile/staff-mobile-icon.png", "rounded", "Applied to the next native app build; installed apps keep their current icon.", ["apps/staff-mobile/assets/icon.png"]),
];

export const marketingAssetKey = (slot: string) => `marketing:${slot}`;

/** Resolve an admin replacement without requiring a server or marketing build restart. */
export async function resolveMarketingImageOverride(slot: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT r2_url FROM site_assets WHERE key = ${marketingAssetKey(slot)} LIMIT 1
  `);
  return String((result.rows[0] as any)?.r2_url || "") || null;
}
