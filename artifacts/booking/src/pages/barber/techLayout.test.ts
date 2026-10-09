import { describe, expect, it } from "vitest";
import { computeTechLayout, GAP, MIN_READABLE_SCALE } from "./techLayout";

// Stage (the space under the slim "Salon at a glance" strip) at the tablet sizes the Nail POS is checked on.
const STAGES = [{ w: 1030, h: 441 }, { w: 944, h: 600 }, { w: 728, h: 568 }, { w: 664, h: 400 }];

describe("computeTechLayout", () => {
  it("fits every count from 1 to 14 inside the stage — nothing scrolls, nothing is cut off", () => {
    for (const { w, h } of STAGES) {
      for (let n = 1; n <= 14; n++) {
        const l = computeTechLayout(n, w, h);
        expect(l.cols * l.rows).toBeGreaterThanOrEqual(n);
        expect(l.cols * l.cardW * l.scale + GAP * (l.cols - 1)).toBeLessThanOrEqual(w + 0.5);
        expect(l.rows * l.cardH * l.scale + GAP * (l.rows - 1)).toBeLessThanOrEqual(h + 0.5);
      }
    }
  });
  it("draws 12 techs at a readable size on the 1366×641 tablet (4 × 3, compact card)", () => {
    const l = computeTechLayout(12, 1030, 441);
    expect(l).toMatchObject({ cols: 4, rows: 3, compact: true });
    expect(l.scale).toBeGreaterThan(0.9);
  });
  it("keeps the roomy card while it can be drawn at a readable size, and never below the readable scale otherwise", () => {
    expect(computeTechLayout(1, 1030, 441).compact).toBe(false);
    expect(computeTechLayout(2, 1030, 441).compact).toBe(false);
    for (const { w, h } of STAGES) for (let n = 1; n <= 12; n++) {
      const l = computeTechLayout(n, w, h);
      if (!l.compact) expect(l.scale).toBeGreaterThanOrEqual(MIN_READABLE_SCALE);
    }
  });
  it("the lean card (Clocked In page) fits every count too, and stays readable up to 12 techs", () => {
    for (const { w, h } of STAGES) {
      for (let n = 1; n <= 14; n++) {
        const l = computeTechLayout(n, w, h, true);
        expect(l.cols * l.rows).toBeGreaterThanOrEqual(n);
        expect(l.cols * l.cardW * l.scale + GAP * (l.cols - 1)).toBeLessThanOrEqual(w + 0.5);
        expect(l.rows * l.cardH * l.scale + GAP * (l.rows - 1)).toBeLessThanOrEqual(h + 0.5);
      }
    }
    expect(computeTechLayout(12, 1030, 441, true).scale).toBeGreaterThan(0.85);
  });
  it("before it has been measured, falls back to a sane default", () => {
    expect(computeTechLayout(5, 0, 0)).toMatchObject({ scale: 1, compact: false });
  });
});
