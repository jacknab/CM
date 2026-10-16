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
  /** The settings sections the app's own Settings page shows (Phase 3). */
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
    screens: ["/nail", "/kiosk", "/frontdesk"],
    settings: ["services", "staff", "turns", "pos", "hours", "kiosk", "drawers", "payments", "plan"],
    signup: "nail",
  },
};

/**
 * The full-platform pages a staff screen links to, and the app's own version of each. In an app,
 * the screen opens the app version; in the full Certxa app nothing changes.
 */
export const APP_PAGE_FOR: Record<string, string> = {
  "/settings": "/app/settings",
  "/reports": "/app/reports",
  "/sms-inbox": "/app/messages",
  "/pos": "/app/retail",
};

export function getAppProfile(id: string | null | undefined): AppProfile | null {
  return (id && APP_PROFILES[id]) || null;
}

/** Whether an app may open this path. */
export function appAllowsPath(profile: AppProfile, pathname: string): boolean {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");
  return APP_SCREENS_ALWAYS.some(under) || profile.screens.some(under);
}

/** Whether a business of this type belongs in this app. */
export function appFitsBusiness(profile: AppProfile, category: string | null | undefined): boolean {
  return profile.businessTypes.test(category ?? "");
}
