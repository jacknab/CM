import { describe, expect, it } from "vitest";
import { occupiedMinutes } from "../bookingEngine";

const start = "2026-09-30T15:00:00Z";

describe("occupiedMinutes — how long an existing appointment holds its technician", () => {
  it("holds the full booked duration while it's open", () => {
    expect(occupiedMinutes({ date: start, duration: 60, status: "confirmed" })).toBe(60);
    expect(occupiedMinutes({ date: start, duration: 45, status: "started" })).toBe(45);
  });

  it("frees the technician at checkout when a service finishes early", () => {
    expect(occupiedMinutes({ date: start, duration: 60, status: "completed", completedAt: "2026-09-30T15:40:00Z" })).toBe(40);
  });

  it("never holds longer than booked, even when checkout ran late", () => {
    expect(occupiedMinutes({ date: start, duration: 60, status: "completed", completedAt: "2026-09-30T16:30:00Z" })).toBe(60);
  });

  it("holds nothing for a booking checked out before its scheduled start", () => {
    expect(occupiedMinutes({ date: start, duration: 60, status: "completed", completedAt: "2026-09-30T14:10:00Z" })).toBe(0);
  });

  it("holds nothing for cancelled or no-show bookings", () => {
    expect(occupiedMinutes({ date: start, duration: 60, status: "cancelled" })).toBe(0);
    expect(occupiedMinutes({ date: start, duration: 60, status: "no_show" })).toBe(0);
  });

  it("falls back to the booked length for a completed booking with no checkout time", () => {
    expect(occupiedMinutes({ date: start, duration: 30, status: "completed", completedAt: null })).toBe(30);
  });
});
