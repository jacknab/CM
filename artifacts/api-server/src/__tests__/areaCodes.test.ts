import { describe, expect, test } from "vitest";
import { checkQuickAreaCodes, isValidUsAreaCode, readQuickAreaCodes } from "@shared/areaCodes";

describe("isValidUsAreaCode", () => {
  test("real geographic area codes pass", () => {
    for (const c of ["720", "303", "719", "212", "310", "989", "929", "469", "202"]) expect(isValidUsAreaCode(c)).toBe(true);
  });
  test("bad shapes fail", () => {
    for (const c of ["", "72", "7200", "abc", "72a", "120", "020", "011", "7 2", "+72"]) expect(isValidUsAreaCode(c)).toBe(false);
  });
  test("service, reserved and toll-free/premium codes fail", () => {
    for (const c of ["211", "411", "911", "370", "379", "960", "969", "800", "888", "900", "700", "500"]) expect(isValidUsAreaCode(c)).toBe(false);
  });
});

describe("checkQuickAreaCodes", () => {
  test("three valid codes, strings kept as-is", () => {
    expect(checkQuickAreaCodes(["720", "303", "719"])).toEqual({ ok: true, codes: ["720", "303", "719"] });
  });
  test("blank buttons are allowed (unconfigured)", () => {
    expect(checkQuickAreaCodes(["720", "", ""])).toEqual({ ok: true, codes: ["720", "", ""] });
    expect(checkQuickAreaCodes(["", "", ""])).toEqual({ ok: true, codes: ["", "", ""] });
    expect(checkQuickAreaCodes([" 720 ", null, undefined])).toEqual({ ok: true, codes: ["720", "", ""] });
  });
  test("exactly three entries", () => {
    expect(checkQuickAreaCodes(["720", "303"]).ok).toBe(false);
    expect(checkQuickAreaCodes(["720", "303", "719", "212"]).ok).toBe(false);
    expect(checkQuickAreaCodes("720").ok).toBe(false);
    expect(checkQuickAreaCodes(undefined).ok).toBe(false);
  });
  test("each value: exactly 3 digits and a valid US area code, and names the bad button", () => {
    const r1 = checkQuickAreaCodes(["720", "30", "719"]);
    expect(r1.ok).toBe(false);
    if (!r1.ok) { expect(r1.index).toBe(1); expect(r1.error).toMatch(/3 digits/); }
    const r2 = checkQuickAreaCodes(["720", "303", "911"]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) { expect(r2.index).toBe(2); expect(r2.error).toMatch(/valid US area code/); }
    expect(checkQuickAreaCodes([720, "303", "719"] as any).ok).toBe(false); // numbers are rejected: strings only
  });
});

describe("readQuickAreaCodes", () => {
  test("never-configured / junk always reads back as three blanks", () => {
    expect(readQuickAreaCodes(null)).toEqual(["", "", ""]);
    expect(readQuickAreaCodes(undefined)).toEqual(["", "", ""]);
    expect(readQuickAreaCodes({})).toEqual(["", "", ""]);
    expect(readQuickAreaCodes(["720"])).toEqual(["720", "", ""]);
    expect(readQuickAreaCodes(["720", "bad", "303", "719"])).toEqual(["720", "", "303"]);
  });
});
