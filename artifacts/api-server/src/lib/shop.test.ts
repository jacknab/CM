import { describe, it, expect } from "vitest";
import { isPoBox, priceShopCart, shopAddressProblem } from "@shared/shopCatalog";

const ok = { name: "Ana Diaz", line1: "120 Main St", city: "Phoenix", state: "AZ", zip: "85004" };

describe("shop address rules", () => {
  it("accepts a US street address", () => {
    expect(shopAddressProblem(ok)).toBeNull();
    expect(shopAddressProblem({ ...ok, zip: "85004-1234", state: "az" })).toBeNull();
  });

  it("refuses PO boxes however they are written", () => {
    for (const line of ["PO Box 12", "P.O. Box 12", "p o box 12", "Post Office Box 9", "POB 44", "Box 301"]) {
      expect(isPoBox(line)).toBe(true);
    }
    expect(shopAddressProblem({ ...ok, line1: "P.O. Box 12" })).toMatch(/PO box/);
    expect(shopAddressProblem({ ...ok, line2: "PO Box 7" })).toMatch(/PO box/);
  });

  it("does not mistake ordinary streets for PO boxes", () => {
    for (const line of ["120 Boxwood Ln", "45 Post Rd", "9 Pobla St", "Suite 12, 3 Boxer Ave"]) {
      expect(isPoBox(line)).toBe(false);
    }
  });

  it("refuses addresses outside the United States and bad ZIP codes", () => {
    expect(shopAddressProblem({ ...ok, state: "ON" })).toMatch(/United States/);
    expect(shopAddressProblem({ ...ok, zip: "K1A 0B1" })).toMatch(/ZIP/);
  });
});

describe("shop cart pricing", () => {
  it("prices from the catalog, never from the request", () => {
    const cart = priceShopCart([{ sku: "kiosk", qty: 2 }, { sku: "cash-drawer", qty: 1 }]);
    expect(cart?.subtotalCents).toBe(39900 * 2 + 9900);
  });

  it("rejects unknown products and impossible quantities", () => {
    expect(priceShopCart([{ sku: "nope", qty: 1 }])).toBeNull();
    expect(priceShopCart([{ sku: "kiosk", qty: 0 }])).toBeNull();
    expect(priceShopCart([{ sku: "kiosk", qty: 11 }])).toBeNull();
    expect(priceShopCart([{ sku: "kiosk", qty: 1.5 }])).toBeNull();
    expect(priceShopCart([])).toBeNull();
  });
});
