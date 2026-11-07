import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ pool: { query: vi.fn() } }));
import { soloRedirectFor } from "./soloPageGuard";

describe("soloRedirectFor", () => {
  it("sends salon dashboard pages to their Solo page", () => {
    expect(soloRedirectFor("/settings")).toBe("/solo");
    expect(soloRedirectFor("/settings/team")).toBe("/solo");
    expect(soloRedirectFor("/calendar")).toBe("/solo/calendar");
    expect(soloRedirectFor("/Calendar/")).toBe("/solo/calendar");
    expect(soloRedirectFor("/customers")).toBe("/solo/clients");
    expect(soloRedirectFor("/client/12")).toBe("/solo/clients");
    expect(soloRedirectFor("/services")).toBe("/solo/catalog/services");
    expect(soloRedirectFor("/catalog/products")).toBe("/solo/catalog/services");
    expect(soloRedirectFor("/manage/billing")).toBe("/solo/billing");
    expect(soloRedirectFor("/billing")).toBe("/solo/billing");
    for (const p of ["/nail", "/barber", "/manage", "/manage/dashboard", "/dashboard", "/payroll", "/team", "/kiosk/x", "/frontdesk/x", "/reports", "/booking", "/booking/new", "/onboarding"]) {
      expect(soloRedirectFor(p)).toBe("/solo");
    }
  });
  it("leaves the Solo dashboard and public pages alone", () => {
    for (const p of ["/solo", "/solo/calendar", "/solo/billing", "/pro-plus", "/pro-credits", "/auth", "/book/kims-nails", "/b/abc",
      "/booking/123", "/booking/manage/tok", "/pay/tok", "/q/kims", "/receipt/1", "/review/x", "/pricing", "/isTeam", "/"]) {
      expect(soloRedirectFor(p)).toBeNull();
    }
  });
  it("never touches addresses the booking app doesn't own", () => {
    expect(soloRedirectFor("/blog/some-post")).toBeNull();
    expect(soloRedirectFor("/nail-salon-turn-system")).toBeNull();
  });
});
