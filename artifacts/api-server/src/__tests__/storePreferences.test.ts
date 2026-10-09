import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import { changedPreferenceKeys, mergePreferenceChanges } from "../lib/storePreferences";

describe("saving one part of a salon's preferences keeps what others saved meanwhile", () => {
  const read = { kioskSettings: { kioskEnabled: true }, turnSystem: { lockedStaffIds: [] }, loyalty: { enabled: true } };

  it("writes only the part the caller changed", () => {
    const next = { ...read, kioskSettings: { kioskEnabled: false } };
    expect(changedPreferenceKeys(read, next)).toEqual({ changed: ["kioskSettings"], removed: [] });
  });

  it("does not undo a turn-system change saved after the caller read", () => {
    // The owner opens kiosk settings (reads), a technician is locked (turn system saved), the owner saves.
    const savedNow = { ...read, turnSystem: { lockedStaffIds: [7] } };
    const ownerSaves = { ...read, kioskSettings: { kioskEnabled: false } };
    expect(mergePreferenceChanges(savedNow, read, ownerSaves)).toEqual({
      kioskSettings: { kioskEnabled: false }, turnSystem: { lockedStaffIds: [7] }, loyalty: { enabled: true },
    });
  });

  it("keeps a part another feature added in the meantime", () => {
    const savedNow = { ...read, payroll: { frequency: "weekly" } };
    const next = { ...read, loyalty: { enabled: false } };
    expect(mergePreferenceChanges(savedNow, read, next)).toEqual({ ...read, loyalty: { enabled: false }, payroll: { frequency: "weekly" } });
  });

  it("removes a part the caller deleted, and only that", () => {
    const next: Record<string, any> = { ...read };
    delete next.loyalty;
    expect(changedPreferenceKeys(read, next)).toEqual({ changed: [], removed: ["loyalty"] });
    expect(mergePreferenceChanges({ ...read, turnSystem: { lockedStaffIds: [7] } }, read, next)).toEqual({
      kioskSettings: { kioskEnabled: true }, turnSystem: { lockedStaffIds: [7] },
    });
  });

  it("changes nothing when the caller changed nothing", () => {
    expect(changedPreferenceKeys(read, { ...read })).toEqual({ changed: [], removed: [] });
  });
});
