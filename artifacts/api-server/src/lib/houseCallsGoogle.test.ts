import { afterEach, describe, expect, it, vi } from "vitest";
import { drivingMiles, googleGeocode } from "./houseCalls";

const address = { line1: "12 Elm St", city: "Denver", state: "CO", postcode: "80203" };
const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 403, json: async () => body }));
const hit = (over: Record<string, unknown> = {}, type = "ROOFTOP") =>
  ({ status: "OK", results: [{ geometry: { location: { lat: 39.7, lng: -104.9 }, location_type: type }, ...over }] });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("house-call addresses and driving miles from Google", () => {
  it("takes an exact match only: a made-up address must not pass as the street or city", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_KEY", "k");
    vi.stubGlobal("fetch", answer(hit()));
    expect(await googleGeocode(address)).toEqual({ lat: 39.7, lng: -104.9 });
    vi.stubGlobal("fetch", answer(hit({ partial_match: true })));
    expect(await googleGeocode(address)).toBeNull();
    vi.stubGlobal("fetch", answer(hit({}, "APPROXIMATE")));
    expect(await googleGeocode(address)).toBeNull();
    vi.stubGlobal("fetch", answer({ status: "REQUEST_DENIED" }));
    expect(await googleGeocode(address)).toBeNull();
  });

  it("gives driving miles, and null when Google can't, so the check can fall back", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_KEY", "k");
    const from = { lat: 1, lng: 1 }, to = { lat: 2, lng: 2 };
    vi.stubGlobal("fetch", answer({ routes: [{ distanceMeters: 13770 }] }));
    expect(await drivingMiles(from, to)).toBe(8.6);
    vi.stubGlobal("fetch", answer({}));
    expect(await drivingMiles(from, to)).toBeNull();
    vi.stubGlobal("fetch", answer({ error: {} }, false));
    expect(await drivingMiles(from, to)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await drivingMiles(from, to)).toBeNull();
  });

  it("asks nothing of Google without a key", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_KEY", "");
    const fetchMock = answer(hit());
    vi.stubGlobal("fetch", fetchMock);
    expect(await googleGeocode(address)).toBeNull();
    expect(await drivingMiles({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
