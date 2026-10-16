import { describe, expect, it } from "vitest";
import { addressIsPrivate, bookedClientStoreView, publicAddressLine, publicStoreView } from "./publicStore";

const store = {
  id: 7, name: "Lux Nails", address: "12 Elm St", city: "Dixon", state: "CA", postcode: "95620",
  storeLatitude: "38.4", storeLongitude: "-121.8", phone: "5551234567",
  ein: "12-3456789", activationCode: "ABC123", stripeCustomerId: "cus_1", userId: "u1", smsCredits: 40,
  ownPlace: "salon", addressPrivate: false,
};

describe("what the public sees of a business (lib/publicStore.ts)", () => {
  it("never shows internal fields", () => {
    const view = publicStoreView(store) as Record<string, unknown>;
    for (const key of ["ein", "activationCode", "stripeCustomerId", "userId", "smsCredits"]) expect(view[key]).toBeUndefined();
    expect(view.name).toBe("Lux Nails");
  });

  it("shows a public address in full", () => {
    const view = publicStoreView(store);
    expect(view.address).toBe("12 Elm St");
    expect(view.addressHidden).toBe(false);
    expect(publicAddressLine(store)).toBe("12 Elm St, Dixon, CA 95620");
  });

  it("shows only the city and state of a private address, with no map position", () => {
    const priv = { ...store, ownPlace: "home", addressPrivate: true };
    const view = publicStoreView(priv);
    expect(view.address).toBeNull();
    expect(view.postcode).toBeNull();
    expect(view.storeLatitude).toBeNull();
    expect(view.storeLongitude).toBeNull();
    expect(view.city).toBe("Dixon");
    expect(view.addressHidden).toBe(true);
    expect(publicAddressLine(priv)).toBe("Dixon, CA");
  });

  it("treats a business with no place of its own (house calls only) as private", () => {
    expect(addressIsPrivate({ ownPlace: "none", addressPrivate: false })).toBe(true);
    expect(addressIsPrivate({ ownPlace: "home", addressPrivate: false })).toBe(false);
  });

  it("gives a client with a booking the full address, but no internal fields", () => {
    const view = bookedClientStoreView({ ...store, ownPlace: "home", addressPrivate: true }) as Record<string, unknown>;
    expect(view.address).toBe("12 Elm St");
    expect(view.ein).toBeUndefined();
    expect(view.activationCode).toBeUndefined();
  });
});
