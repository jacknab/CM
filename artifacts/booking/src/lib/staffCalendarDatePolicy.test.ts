import { describe, expect, it } from "vitest";
import {
  isStaffDateSelectable,
  isStaffSlotBookable,
} from "@/lib/staffCalendarDatePolicy";

const storeNow = new Date(Date.UTC(2026, 6, 23, 15, 30, 0)); // Jul 23, 3:30 PM salon time
const yesterday = new Date(Date.UTC(2026, 6, 22));
const today = new Date(Date.UTC(2026, 6, 23));
const tomorrow = new Date(Date.UTC(2026, 6, 24));
const later = new Date(Date.UTC(2026, 6, 30));

describe("staff calendar date boundary", () => {
  it("rejects yesterday while keeping today, tomorrow, and later dates selectable", () => {
    expect(isStaffDateSelectable(yesterday, storeNow)).toBe(false);
    expect(isStaffDateSelectable(today, storeNow)).toBe(true);
    expect(isStaffDateSelectable(tomorrow, storeNow)).toBe(true);
    expect(isStaffDateSelectable(later, storeNow)).toBe(true);
  });

  it("allows only future time slots on today", () => {
    expect(isStaffSlotBookable(today, 15, 29, storeNow)).toBe(false);
    expect(isStaffSlotBookable(today, 15, 30, storeNow)).toBe(false);
    expect(isStaffSlotBookable(today, 15, 31, storeNow)).toBe(true);
    expect(isStaffSlotBookable(today, 16, 0, storeNow)).toBe(true);
  });

  it("rejects every slot on yesterday and keeps tomorrow/later available", () => {
    expect(isStaffSlotBookable(yesterday, 23, 59, storeNow)).toBe(false);
    expect(isStaffSlotBookable(tomorrow, 0, 0, storeNow)).toBe(true);
    expect(isStaffSlotBookable(later, 9, 0, storeNow)).toBe(true);
  });
});
