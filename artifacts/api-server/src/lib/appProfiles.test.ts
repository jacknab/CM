import { describe, expect, it } from "vitest";
import { APP_PROFILES, appAllowsPath, appFitsBusiness, appSettingsPathFor, getAppProfile } from "@shared/appProfiles";

describe("app profiles (plans/certxa-apps.md)", () => {
  const nail = APP_PROFILES.nail;

  it("lets the nail app open only its own screens, sign-in and its /app pages", () => {
    for (const p of ["/nail", "/kiosk/luxury-nails", "/frontdesk/luxury-nails/2", "/app-login", "/auth", "/reset-password", "/app/settings"]) {
      expect(appAllowsPath(nail, p)).toBe(true);
    }
    for (const p of ["/", "/calendar", "/settings", "/pos", "/barber", "/nailsalon", "/application"]) {
      expect(appAllowsPath(nail, p)).toBe(false);
    }
  });

  it("is for nail salons only", () => {
    expect(appFitsBusiness(nail, "Nail Salon")).toBe(true);
    expect(appFitsBusiness(nail, "Hair Salon")).toBe(false);
    expect(appFitsBusiness(nail, null)).toBe(false);
  });

  it("knows only real profiles", () => {
    expect(getAppProfile("nail")?.home).toBe("/nail");
    expect(getAppProfile("none")).toBeNull();
    expect(getAppProfile(undefined)).toBeNull();
  });
});

describe("app settings (Phase 3)", () => {
  const nail = APP_PROFILES.nail;
  it("opens the settings sections' pages and the reports the hub links to", () => {
    for (const p of ["/catalog/services", "/team/12", "/dashboard/turn", "/payments/checkout-tax", "/gift-cards", "/billing", "/reports/day-close", "/commission-report", "/app/settings/hours"]) {
      expect(appAllowsPath(nail, p)).toBe(true);
    }
    for (const p of ["/settings", "/settings/hours", "/dashboard", "/payroll", "/marketing"]) expect(appAllowsPath(nail, p)).toBe(false);
  });
  it("sends a full settings address to the app's copy when it has one", () => {
    expect(appSettingsPathFor(nail, "/settings/registers")).toBe("/app/settings/registers");
    expect(appSettingsPathFor(nail, "/settings/online-booking")).toBeNull();
  });
});

describe("sign-up in an app (Phase 4)", () => {
  it("opens the onboarding and gives the new business the app's type", () => {
    expect(appAllowsPath(APP_PROFILES.nail, "/onboarding")).toBe(true);
    expect(APP_PROFILES.nail.businessType).toBe("Nail Salon");
    expect(appFitsBusiness(APP_PROFILES.nail, APP_PROFILES.nail.businessType)).toBe(true);
  });
});
