import { describe, expect, it, vi } from "vitest";

// Marel's account health (owner, 2026-11-11): only real problems, never the front desk or kiosk (hardware). No real database.
const seen = vi.hoisted(() => ({ segments: [] as string[] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string) => (sql.includes("FROM support_agents") ? { rows: [{ id: 816 }] } : { rows: [] }) } }));
vi.mock("../sms", () => ({ sendTwilioSms: async () => undefined }));
vi.mock("../mail", () => ({ sendEmail: async () => undefined }));
vi.mock("../services/saas-billing", () => ({ retryFailedCharge: async () => undefined }));
vi.mock("../services/trial-expiration", () => ({ liftTrialSuspension: async () => undefined }));
vi.mock("./stripe", () => ({ stripe: {}, isStripeConfigured: () => false }));
vi.mock("./healthCheck", () => ({ runHealthCheck: async (o: { segments: string[] }) => {
  seen.segments = o.segments;
  return { passCount: 12, results: {
    online_presence: { label: "Online presence", checks: [{ id: "a", label: "Booking page", status: "fail", detail: "Online booking is switched off.", action: "Settings › Booking", ownerVisible: true }] },
    sms_communications: { label: "Texts", checks: [{ id: "b", label: "Text credits", status: "pass", detail: "40 credits." },
      { id: "c", label: "Internal", status: "warn", detail: "staff-only detail", ownerVisible: false }] },
  } };
} }));

import { accountHealth } from "./marilAccountSupport";

describe("Marel's account health check", () => {
  it("reports only real problems an owner can act on, and never checks hardware", async () => {
    const h = await accountHealth({ userId: "u1", storeId: 5, businessName: "Test", firstName: null, email: null, accountType: null });
    expect(seen.segments).not.toContain("front_desk");
    expect(seen.segments).not.toContain("kiosk_waitlist");
    expect(h.allGood).toBe(false);
    expect(h.problems).toEqual([{ area: "Online presence", status: "problem", issue: "Booking page: Online booking is switched off.", fix: "Settings › Booking" }]);
  });
});
