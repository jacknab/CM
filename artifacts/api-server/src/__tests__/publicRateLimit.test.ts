import { describe, expect, it } from "vitest";
import { isPublicBookingRead } from "../lib/publicRateLimit";

describe("which public requests get the booking-page read allowance", () => {
  it("a booking page's own reads (GET)", () => {
    for (const p of ["/store/tobys", "/store/tobys/", "/store/tobys/services", "/store/tobys/team", "/store/tobys/reviews", "/store/tobys/gallery",
      "/store/tobys/service-reviews", "/store/tobys/shop", "/store/tobys/service-pages", "/store/tobys/staff", "/store/tobys/availability",
      "/store/tobys/available-days", "/store/tobys/pro-pricing", "/store/tobys/pro-times", "/booking-payment-policy/tobys"]) {
      expect(isPublicBookingRead("GET", p)).toBe(true);
    }
    expect(isPublicBookingRead("HEAD", "/store/tobys/services")).toBe(true);
  });
  it("never a booking, payment or any other write", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const p of ["/store/tobys/book", "/store/tobys/services", "/store/tobys/house-call", "/store/tobys/waitlist", "/store/tobys/shop/order", "/store/tobys/shop/confirm"]) {
        expect(isPublicBookingRead(m, p)).toBe(false);
      }
    }
  });
  it("not other public endpoints, even as GET", () => {
    for (const p of ["/store/tobys/book", "/store/tobys/shop/order", "/zip/80202", "/check-slug/tobys", "/kiosk/tobys/config", "/queue/tobys", "/line/tobys",
      "/store/tobys/services/extra", "/store", "/store/tobys/../../auth"]) {
      expect(isPublicBookingRead("GET", p)).toBe(false);
    }
  });
});
