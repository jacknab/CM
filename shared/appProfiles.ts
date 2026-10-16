/**
 * App profiles: one per Certxa Android app (plans/certxa-apps.md). Each app is the same Android shell
 * (apps/certxa-owner) and the same web app, limited to what one business type needs. The web app reads
 * this file to decide which screens an app may open, where it lands after sign-in, and what its own
 * Settings / Reports / Messages show. The Android side of each profile (name, package ID, icon, start
 * page) is in apps/certxa-owner/app.config.js under the same id.
 */

export interface AppProfile {
  id: string;
  /** The app's name as the salon sees it. */
  name: string;
  /** Who the app is for, in the words shown when a salon of another kind signs in. */
  audience: string;
  /** Which business types (locations.category) this app is for. */
  businessTypes: RegExp;
  /** Where the app opens after sign-in. */
  home: string;
  /**
   * The screens the app may open, as path prefixes. Anything else goes to `home`. Sign-in, password
   * reset, invites and the app's own /app/* pages are always allowed (APP_SCREENS_ALWAYS).
   */
  screens: string[];
  /** The sections the app's own Settings page shows, in order (keys of APP_SETTINGS_SECTIONS). */
  settings: string[];
  /** The first-run flow for a new business (Phase 4). */
  signup: string;
}

/** Screens every app needs, whatever its business type. */
export const APP_SCREENS_ALWAYS = [
  "/auth", "/app-login", "/forgot-password", "/reset-password", "/staff-auth", "/accept-invite", "/app",
];

export const APP_PROFILES: Record<string, AppProfile> = {
  nail: {
    id: "nail",
    name: "Certxa Nail", // placeholder until the owner chooses the name
    audience: "nail salons",
    businessTypes: /nail/i,
    home: "/nail",
    // Reports (the hub's own pages included), Messages and Support open in the app's frame.
    screens: ["/nail", "/kiosk", "/frontdesk", "/reports", "/salon-earnings", "/register-reports", "/commission-report", "/sms-inbox", "/support",
      "/manage/billing/credits-topup"],
    settings: ["services", "staff", "turns", "checkout", "giftCards", "loyalty", "hours", "business", "kiosk", "stations", "drawers", "payouts", "language", "plan"],
    signup: "nail",
  },
};

/**
 * The sections an app's Settings page can show. Each opens an existing Certxa page (no setting exists
 * twice); `area` is the part of the site that page needs, which the app is then allowed to open.
 * Pages that live in the full Settings shell open under /app/settings/<slug> instead, without the
 * shell's list of every setting.
 */
export interface AppSettingsSection {
  label: string;
  description: string;
  to: string;
  area: string;
}

export const APP_SETTINGS_SECTIONS: Record<string, AppSettingsSection> = {
  services:  { label: "Services & prices", description: "Your service menu, add-ons and prices.", to: "/catalog/services", area: "/catalog" },
  staff:     { label: "Staff", description: "Technicians and front desk: roles, Tech IDs, turns, commission.", to: "/team", area: "/team" },
  turns:     { label: "Turn rules", description: "How the turn line decides who is next.", to: "/dashboard/turn", area: "/dashboard/turn" },
  checkout:  { label: "Checkout, tax & tips", description: "Sales tax, tip choices, cash discount and receipts.", to: "/payments/checkout-tax", area: "/payments" },
  giftCards: { label: "Gift cards", description: "Sell, look up and redeem gift cards.", to: "/gift-cards", area: "/gift-cards" },
  loyalty:   { label: "Loyalty", description: "Points clients earn and the rewards they can redeem.", to: "/loyalty", area: "/loyalty" },
  hours:     { label: "Business hours", description: "Opening and closing times for each day.", to: "/app/settings/hours", area: "/app" },
  business:  { label: "Business details", description: "Salon name, address, logo and contact details.", to: "/app/settings/business", area: "/app" },
  kiosk:     { label: "Check-in kiosk", description: "The self check-in tablet: link, QR code and welcome text.", to: "/app/settings/kiosk", area: "/app" },
  stations:  { label: "POS stations", description: "Checkout stations and their customer-facing screens.", to: "/app/settings/registers", area: "/app" },
  drawers:   { label: "Cash drawers", description: "Cash drawers, Day Close and the starting float.", to: "/app/settings/cash-drawers", area: "/app" },
  payouts:   { label: "Card payments & payouts", description: "Where card sales are paid out.", to: "/payments/payouts", area: "/payments" },
  language:  { label: "Language", description: "The language of the staff screens.", to: "/app/settings/language", area: "/app" },
  plan:      { label: "Plan & billing", description: "Your plan, usage and invoices.", to: "/billing", area: "/billing" },
};

/**
 * The full-platform pages a staff screen links to, and what an app opens instead. Settings goes to
 * the app's own Settings page; Reports and Messages open in the app's frame (no platform menu).
 * Retail Sale (/pos) has no app version yet: staff screens hide it inside an app (appPage → null).
 */
export const APP_PAGE_FOR: Record<string, string | null> = {
  "/settings": "/app/settings",
  "/reports": "/reports",
  "/sms-inbox": "/sms-inbox",
  "/pos": null,
};

export function getAppProfile(id: string | null | undefined): AppProfile | null {
  return (id && APP_PROFILES[id]) || null;
}

/** Whether an app may open this path: its screens, sign-in, its /app pages and its settings sections' areas. */
export function appAllowsPath(profile: AppProfile, pathname: string): boolean {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");
  return APP_SCREENS_ALWAYS.some(under) || profile.screens.some(under)
    || profile.settings.some((key) => { const area = APP_SETTINGS_SECTIONS[key]?.area; return !!area && under(area); });
}

/**
 * A full-platform settings address (/settings/<slug>) that the app has its own copy of
 * (/app/settings/<slug>), so links inside settings pages keep working in an app. Null otherwise.
 */
export function appSettingsPathFor(profile: AppProfile, pathname: string): string | null {
  const m = /^\/settings\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (!m) return null;
  const to = `/app/settings/${m[1]}`;
  return profile.settings.some((key) => APP_SETTINGS_SECTIONS[key]?.to === to) ? to : null;
}

/** Whether a business of this type belongs in this app. */
export function appFitsBusiness(profile: AppProfile, category: string | null | undefined): boolean {
  return profile.businessTypes.test(category ?? "");
}
