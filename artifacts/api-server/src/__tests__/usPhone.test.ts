import { describe, expect, test } from "vitest";
import { isValidUsPhone, isValidUsPhonePrefix, usPhoneProblem, exchangeProblem } from "@shared/usPhone";
import { US_AREA_CODES } from "@shared/usAreaCodes";

describe("assigned US area codes", () => {
  test("real geographic codes are in (states, DC, territories)", () => {
    for (const c of ["212", "310", "415", "714", "657", "720", "305", "202", "907", "808", "787", "939", "671", "340", "684", "670", "984", "986"]) expect(US_AREA_CODES.has(c)).toBe(true);
  });
  test("toll-free, premium, personal, N11, reserved, fictitious, Canadian and Caribbean codes are out", () => {
    for (const c of ["800", "833", "844", "855", "866", "877", "888", "900", "500", "533", "544", "566", "577", "588", "211", "311", "411", "511", "611", "711", "811", "911",
      "370", "379", "960", "969", "555", "222", "333", "444", "666", "777", "999", "123", "000", "100", "456", "710", "700",
      "416", "604", "514", "242", "876", "809"]) expect(US_AREA_CODES.has(c)).toBe(false);
  });
});

describe("usPhoneProblem (a complete number)", () => {
  test("a real number passes, a 555 number does not", () => {
    expect(usPhoneProblem("7205551234")).not.toBeNull(); // 555 exchange is fictitious
    expect(usPhoneProblem("7202345678")).toBeNull();
    expect(usPhoneProblem("2125550100")).not.toBeNull();
    expect(isValidUsPhone("6579876543")).toBe(true);
  });
  test("must be exactly 10 digits, digits only", () => {
    for (const bad of ["", "720234567", "72023456789", "72023456ab", "(720) 234-5678", "+17202345678"]) expect(isValidUsPhone(bad)).toBe(false);
    expect(usPhoneProblem("720234567")).toMatch(/10 digits/);
  });
  test("area code must be an assigned US geographic code", () => {
    for (const npa of ["800", "833", "844", "855", "866", "877", "888"]) expect(usPhoneProblem(npa + "2345678")).toMatch(/Toll-free/);
    for (const npa of ["900", "500", "211", "911", "370", "960", "123", "416", "876", "555", "222", "999"]) expect(isValidUsPhone(npa + "2345678")).toBe(false);
  });
  test("exchange: starts 2-9, no N11, no reserved/fictitious, never one repeated digit", () => {
    for (const nxx of ["055", "155", "911", "411", "211", "555", "950", "958", "959", "222", "333", "444", "666", "777", "888", "999"]) expect(isValidUsPhone("720" + nxx + "1234")).toBe(false);
    for (const nxx of ["234", "292", "512", "912", "956", "957", "976", "200"]) expect(isValidUsPhone("720" + nxx + "1234")).toBe(true);
    expect(exchangeProblem("555")).toMatch(/reserved/);
    expect(exchangeProblem("055")).toMatch(/2–9/);
  });
  test("555-555-1234 style numbers are rejected on both the area code and the exchange", () => {
    expect(isValidUsPhone("5555551234")).toBe(false);
    expect(isValidUsPhone("2225551234")).toBe(false);
    expect(isValidUsPhone("7202221234")).toBe(false);
  });
});

describe("isValidUsPhonePrefix (digit by digit)", () => {
  test("accepts the start of real numbers at every length", () => {
    const n = "7202345678";
    for (let i = 0; i <= 10; i++) expect(isValidUsPhonePrefix(n.slice(0, i))).toBe(true);
  });
  test("refuses the digit that makes a real area code impossible", () => {
    expect(isValidUsPhonePrefix("0")).toBe(false);
    expect(isValidUsPhonePrefix("1")).toBe(false);
    expect(isValidUsPhonePrefix("96")).toBe(false);     // 96X reserved
    expect(isValidUsPhonePrefix("37")).toBe(false);     // 37X reserved
    expect(isValidUsPhonePrefix("55")).toBe(true);      // 551 (NJ) is real…
    expect(isValidUsPhonePrefix("555")).toBe(false);    // …555 is not
    expect(isValidUsPhonePrefix("80")).toBe(true);      // 801, 802… are real
    expect(isValidUsPhonePrefix("800")).toBe(false);    // toll-free
    expect(isValidUsPhonePrefix("711")).toBe(false);    // N11
    expect(isValidUsPhonePrefix("999")).toBe(false);
    expect(isValidUsPhonePrefix("123")).toBe(false);
  });
  test("refuses a bad exchange as soon as it is complete, and a leading 0/1", () => {
    expect(isValidUsPhonePrefix("7200")).toBe(false);
    expect(isValidUsPhonePrefix("7201")).toBe(false);
    expect(isValidUsPhonePrefix("72055")).toBe(true);
    expect(isValidUsPhonePrefix("720555")).toBe(false);
    expect(isValidUsPhonePrefix("720222")).toBe(false);
    expect(isValidUsPhonePrefix("720911")).toBe(false);
    expect(isValidUsPhonePrefix("720958")).toBe(false);
    expect(isValidUsPhonePrefix("720234")).toBe(true);
    expect(isValidUsPhonePrefix("72023456789")).toBe(false); // more than 10
    expect(isValidUsPhonePrefix("72a")).toBe(false);
  });
});
