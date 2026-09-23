import { describe, expect, it } from "vitest";
import { logBodySuffix, redactForLog, shouldSkipBodyLog } from "../lib/logRedaction";

describe("shouldSkipBodyLog", () => {
  it("skips payments and auth endpoints, at any depth", () => {
    for (const p of ["/api/payments", "/api/payments/terminal/connection-token", "/api/auth", "/api/auth/login", "/api/auth/staff-otp-login"]) {
      expect(shouldSkipBodyLog(p)).toBe(true);
    }
  });
  it("does not skip a path that merely starts with the same letters", () => {
    expect(shouldSkipBodyLog("/api/paymentsomethingelse")).toBe(false);
    expect(shouldSkipBodyLog("/api/authenticate-widget")).toBe(false);
  });
  it("leaves ordinary endpoints alone", () => {
    expect(shouldSkipBodyLog("/api/loyalty/adjust")).toBe(false);
    expect(shouldSkipBodyLog("/api/nail/board")).toBe(false);
  });
});

describe("redactForLog", () => {
  it("redacts a secret however deeply it's nested, case-insensitively", () => {
    expect(redactForLog({ secret: "pst_live_abc" })).toEqual({ secret: "[redacted]" });
    expect(redactForLog({ clientSecret: "pi_abc_secret_xyz" })).toEqual({ clientSecret: "[redacted]" });
    expect(redactForLog({ data: { payment: { token: "tok_1" } } })).toEqual({ data: { payment: { token: "[redacted]" } } });
    expect(redactForLog({ client: { phone: "7205551234", email: "a@b.com" } })).toEqual({ client: { phone: "[redacted]", email: "[redacted]" } });
  });
  it("redacts inside arrays", () => {
    expect(redactForLog({ clients: [{ phone: "1" }, { phone: "2" }] })).toEqual({ clients: [{ phone: "[redacted]" }, { phone: "[redacted]" }] });
  });
  it("leaves ordinary fields and null/undefined untouched", () => {
    expect(redactForLog({ id: 5, name: "Toby", total: 55.0 })).toEqual({ id: 5, name: "Toby", total: 55.0 });
    expect(redactForLog({ phone: null, email: undefined })).toEqual({ phone: null, email: undefined });
  });
  it("does not loop forever on deep or cyclic-looking structures", () => {
    let deep: any = { secret: "x" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(() => redactForLog(deep)).not.toThrow();
  });
});

describe("logBodySuffix", () => {
  it("never includes a payments/auth body, even though one was captured", () => {
    expect(logBodySuffix("/api/payments/terminal/connection-token", { secret: "pst_live_abc" })).toBe(" :: [body not logged]");
    expect(logBodySuffix("/api/auth/login", { token: "abc", user: { email: "a@b.com" } })).toBe(" :: [body not logged]");
  });
  it("redacts and appends the body for an ordinary endpoint", () => {
    expect(logBodySuffix("/api/nail/board", { tickets: [] })).toBe(' :: {"tickets":[]}');
    expect(logBodySuffix("/api/customers/search", { phone: "7205551234" })).toBe(' :: {"phone":"[redacted]"}');
  });
  it("nothing to append when there is no body", () => {
    expect(logBodySuffix("/api/nail/board", undefined)).toBe("");
  });
  it("caps a huge payload instead of writing it in full", () => {
    const big = { items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: "x".repeat(20) })) };
    const suffix = logBodySuffix("/api/nail/board", big);
    expect(suffix.length).toBeLessThan(520);
    expect(suffix.endsWith("…")).toBe(true);
  });
});
