import { describe, expect, it } from "vitest";
import { APP_PROFILES, appAllowsPath, appFitsBusiness, getAppProfile } from "@shared/appProfiles";

describe("app profiles (plans/certxa-apps.md)", () => {
  const nail = APP_PROFILES.nail;

  it("lets the nail app open only its own screens, sign-in and its /app pages", () => {
    for (const p of ["/nail", "/kiosk/luxury-nails", "/frontdesk/luxury-nails/2", "/app-login", "/auth", "/reset-password", "/app/settings"]) {
      expect(appAllowsPath(nail, p)).toBe(true);
    }
    for (const p of ["/", "/calendar", "/settings", "/reports", "/pos", "/sms-inbox", "/barber", "/nailsalon", "/application"]) {
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
