import { describe, expect, it } from "vitest";
import {
  generateCardNumber, generatePin, generateStoreCode, formatCardNumber, normalizeCardNumber, isNewFormat, storeCodeOf, isValidPin, hashPin, pinMatches,
} from "../lib/giftCardNumbers";

describe("card numbers", () => {
  it("are 12 digits, numeric only, with the salon's store code as the middle group", () => {
    for (let i = 0; i < 500; i++) {
      const n = generateCardNumber("1936");
      expect(n).toMatch(/^\d{12}$/);
      expect(storeCodeOf(n)).toBe("1936");
    }
  });
  it("use only what the random source gives (leading zeros kept, range 0000–9999)", () => {
    expect(generateCardNumber("0007", () => 0)).toBe("000000070000");
    expect(generateCardNumber("0007", () => 9999)).toBe("999900079999");
  });
  it("are not sequential: 2,000 cards for one salon are all different and not in order", () => {
    const seen = new Set<string>();
    let ascending = 0;
    let prev = "";
    for (let i = 0; i < 2000; i++) {
      const n = generateCardNumber("4321");
      seen.add(n);
      if (prev && n > prev) ascending++;
      prev = n;
    }
    expect(seen.size).toBeGreaterThan(1990);          // 10^8 possibilities per salon — a repeat in 2,000 is vanishingly rare
    expect(ascending).toBeGreaterThan(800);           // neither always rising nor always falling
    expect(ascending).toBeLessThan(1200);
  });
  it("draw both random groups independently (the first and last group are not linked)", () => {
    const pairs = new Set<string>();
    for (let i = 0; i < 300; i++) { const n = generateCardNumber("1111"); pairs.add(n.slice(0, 4) + n.slice(8)); }
    expect(pairs.size).toBeGreaterThan(295);
  });
  it("refuse a store code that is not 4 digits", () => {
    for (const bad of ["", "123", "12345", "abcd", "12 4"]) expect(() => generateCardNumber(bad)).toThrow();
  });
  it("format as 4827 1936 7054, and leave a legacy code alone", () => {
    expect(formatCardNumber("482719367054")).toBe("4827 1936 7054");
    expect(formatCardNumber("GC-AB12CD34")).toBe("GC-AB12CD34");
  });
  it("normalize what was typed or scanned", () => {
    expect(normalizeCardNumber("4827 1936 7054")).toBe("482719367054");
    expect(normalizeCardNumber(" 4827-1936-7054 ")).toBe("482719367054");
    expect(normalizeCardNumber("  gc-ab12 cd34 ")).toBe("GC-AB12CD34");
    expect(normalizeCardNumber(null)).toBe("");
    expect(isNewFormat("482719367054")).toBe(true);
    expect(isNewFormat("48271936705")).toBe(false);
    expect(isNewFormat("GC-AB12CD34")).toBe(false);
  });
});

describe("store codes", () => {
  it("are 4 digits", () => { for (let i = 0; i < 200; i++) expect(generateStoreCode()).toMatch(/^\d{4}$/); });
});

describe("PINs", () => {
  it("are 3 digits and validated as exactly 3 digits", () => {
    for (let i = 0; i < 300; i++) expect(generatePin()).toMatch(/^\d{3}$/);
    expect(generatePin(() => 7)).toBe("007");
    expect(isValidPin("042")).toBe(true);
    for (const bad of ["12", "1234", "abc", "", 123, null, undefined, "1 2"]) expect(isValidPin(bad)).toBe(false);
  });
  it("cover the whole 000–999 range", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(generatePin());
    expect(seen.size).toBeGreaterThan(990);
  });
});

describe("PIN hashing", () => {
  const secret = "test-secret";
  it("never contains the PIN, and only the right number + PIN match", () => {
    const h = hashPin("482719367054", "123", secret);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123");
    expect(pinMatches("482719367054", "123", h, secret)).toBe(true);
    expect(pinMatches("482719367054", "124", h, secret)).toBe(false);
    expect(pinMatches("482719367055", "123", h, secret)).toBe(false); // the same PIN on another card is a different hash
    expect(pinMatches("482719367054", "123", h, "other-secret")).toBe(false);
  });
  it("two cards with the same PIN do not share a hash", () => {
    expect(hashPin("111122223333", "555", secret)).not.toBe(hashPin("111122224444", "555", secret));
  });
  it("a corrupt stored hash never matches", () => {
    expect(pinMatches("482719367054", "123", "zz-not-hex", secret)).toBe(false);
    expect(pinMatches("482719367054", "123", "", secret)).toBe(false);
  });
});
