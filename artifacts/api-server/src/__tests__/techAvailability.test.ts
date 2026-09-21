import { describe, expect, test } from "vitest";
import { decideAvailability, techStateOf } from "../lib/techAvailability";

const NOW = new Date("2026-09-21T15:00:00Z");
const EARLIER = new Date("2026-09-21T14:40:00Z");

describe("techStateOf", () => {
  test("not clocked in is 'off' whatever else is set", () => {
    expect(techStateOf({ clockedIn: false, paused: true, currentStatus: "busy" })).toBe("off");
  });
  test("break beats busy; busy beats available", () => {
    expect(techStateOf({ clockedIn: true, paused: true, currentStatus: "busy" })).toBe("break");
    expect(techStateOf({ clockedIn: true, currentStatus: "on_break" })).toBe("break");
    expect(techStateOf({ clockedIn: true, currentStatus: "busy" })).toBe("busy");
    expect(techStateOf({ clockedIn: true, currentStatus: "available" })).toBe("available");
    expect(techStateOf({ currentStatus: "available" })).toBe("available");
  });
});

describe("decideAvailability", () => {
  test("nothing stored yet: seeded from what the day already shows, never 'now' when it knows better", () => {
    expect(decideAvailability({ prevState: null, prevSince: null, state: "available", now: NOW, seedSince: EARLIER })).toEqual({ state: "available", since: EARLIER });
  });
  test("nothing stored and nothing known: starts now", () => {
    expect(decideAvailability({ prevState: null, prevSince: null, state: "off", now: NOW })).toEqual({ state: "off", since: NOW });
  });
  test("a seed in the future is ignored", () => {
    expect(decideAvailability({ prevState: null, prevSince: null, state: "available", now: NOW, seedSince: new Date("2026-09-21T16:00:00Z") })?.since).toEqual(NOW);
  });
  test("same state: nothing changes (the timer keeps running — never restarts)", () => {
    expect(decideAvailability({ prevState: "available", prevSince: EARLIER, state: "available", now: NOW })).toBeNull();
  });
  test("a new state starts its timer now", () => {
    expect(decideAvailability({ prevState: "available", prevSince: EARLIER, state: "busy", now: NOW })).toEqual({ state: "busy", since: NOW });
    expect(decideAvailability({ prevState: "busy", prevSince: EARLIER, state: "available", now: NOW })).toEqual({ state: "available", since: NOW });
    expect(decideAvailability({ prevState: "off", prevSince: EARLIER, state: "available", now: NOW })?.since).toEqual(NOW);
  });
});
