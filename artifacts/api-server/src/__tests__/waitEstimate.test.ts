import { describe, expect, test } from "vitest";
import { estimateWait, formatWait, DEFAULT_SERVICE_MIN } from "@shared/waitEstimate";

const free = (id: number) => ({ id, clockedIn: true });
const busy = (id: number, remainingMin: number | null) => ({ id, clockedIn: true, busy: true, remainingMin });
const off = (id: number) => ({ id, clockedIn: false });
const onBreak = (id: number) => ({ id, clockedIn: true, paused: true });

describe("estimateWait — the cases from the front desk", () => {
  test("nobody in → no estimate (and says why)", () => {
    const e = estimateWait({ techs: [off(1), off(2)], waiting: [] });
    expect(e).toMatchObject({ minutes: null, reason: "no_staff", staffIn: 0 });
    expect(formatWait(e)).toBe("—");
  });
  test("everyone in is on break → no estimate", () => {
    expect(estimateWait({ techs: [onBreak(1), off(2)], waiting: [] })).toMatchObject({ minutes: null, reason: "all_on_break" });
  });
  test("THE BUG: nobody waiting and techs are free → 0, never a leftover average", () => {
    const e = estimateWait({ techs: [free(1), free(2), busy(3, 20)], waiting: [] });
    expect(e.minutes).toBe(0);
    expect(formatWait(e)).toBe("0 min");
  });
  test("fewer clients waiting than free techs → still no wait", () => {
    expect(estimateWait({ techs: [free(1), free(2), free(3)], waiting: [{}, {}] }).minutes).toBe(0);
  });
  test("everyone busy, nobody waiting → the wait is the soonest finish", () => {
    expect(estimateWait({ techs: [busy(1, 25), busy(2, 12), busy(3, 40)], waiting: [] }).minutes).toBe(12);
  });
  test("as many waiting as free techs → those techs are taken, so the next client waits for the next finish", () => {
    // one free tech, one waiting client (45 min default) → free tech busy for 45; other tech finishes in 30 → 30
    expect(estimateWait({ techs: [free(1), busy(2, 30)], waiting: [{}] }).minutes).toBe(30);
    // the other tech finishes AFTER the waiting client's service → 45
    expect(estimateWait({ techs: [free(1), busy(2, 60)], waiting: [{}] }).minutes).toBe(45);
  });
  test("a line: waiting clients go to whoever frees up first, first come first served", () => {
    const e = estimateWait({ techs: [busy(1, 10), busy(2, 20)], waiting: [{ durationMin: 30 }, { durationMin: 30 }] });
    // c1 → tech1 (10..40), c2 → tech2 (20..50) → next free at 40
    expect(e.minutes).toBe(40);
  });
  test("a client ticketed with a specific tech waits for THAT tech, even if another is sooner", () => {
    const e = estimateWait({ techs: [busy(1, 10), busy(2, 60)], waiting: [{ durationMin: 30, staffId: 2 }] });
    // tech 2: 60 + 30 = 90; tech 1 free at 10 → a new client waits 10
    expect(e.minutes).toBe(10);
    // and if the ticketed tech is the soonest one, they queue behind it
    expect(estimateWait({ techs: [busy(1, 10), busy(2, 60)], waiting: [{ durationMin: 30, staffId: 1 }] }).minutes).toBe(40);
  });
  test("breaks and clocked-out techs never count as available or in line", () => {
    const e = estimateWait({ techs: [onBreak(1), off(2), busy(3, 15)], waiting: [] });
    expect(e).toMatchObject({ minutes: 15, staffIn: 2, free: 0 });
  });
  test("a client waiting for a tech who is on break/out is served by whoever is working", () => {
    expect(estimateWait({ techs: [busy(1, 20)], waiting: [{ durationMin: 30, staffId: 9 }] }).minutes).toBe(50);
  });
  test("a service that has run past its time is assumed to finish in about 5 minutes", () => {
    expect(estimateWait({ techs: [busy(1, -12)], waiting: [] }).minutes).toBe(5);
    expect(estimateWait({ techs: [busy(1, 0)], waiting: [] }).minutes).toBe(5);
  });
  test("unknown time left uses the default service length; unknown durations too", () => {
    expect(estimateWait({ techs: [busy(1, null)], waiting: [] }).minutes).toBe(DEFAULT_SERVICE_MIN);
    expect(estimateWait({ techs: [busy(1, 5)], waiting: [{}] }).minutes).toBe(5 + DEFAULT_SERVICE_MIN);
    expect(estimateWait({ techs: [busy(1, null)], waiting: [], defaultServiceMin: 30 }).minutes).toBe(30);
  });
  test("rounds up to whole minutes and formats hours", () => {
    expect(estimateWait({ techs: [busy(1, 12.2)], waiting: [] }).minutes).toBe(13);
    expect(formatWait({ minutes: 65, staffIn: 1, free: 0, waiting: 0 })).toBe("1 hr 5 min");
    expect(formatWait({ minutes: 120, staffIn: 1, free: 0, waiting: 0 })).toBe("2 hr");
  });
  test("a big salon stays instant (no perf cliff): 40 techs, 200 waiting", () => {
    const techs = Array.from({ length: 40 }, (_, i) => busy(i, 10 + i));
    const t0 = performance.now();
    const e = estimateWait({ techs, waiting: Array.from({ length: 200 }, () => ({ durationMin: 30 })) });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(e.minutes).toBeGreaterThan(0);
  });
});
