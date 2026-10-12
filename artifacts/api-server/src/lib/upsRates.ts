/**
 * UPS Ground rate lookup for hardware shop orders.
 *
 * Needs, in the server environment:
 *   UPS_CLIENT_ID, UPS_CLIENT_SECRET   UPS developer app credentials
 *   UPS_SHIPPER_NUMBER                 the UPS account that ships the boxes
 *   SHOP_SHIP_FROM_LINE1, SHOP_SHIP_FROM_CITY, SHOP_SHIP_FROM_STATE, SHOP_SHIP_FROM_ZIP
 *
 * Until those are set, `upsConfigured()` is false and the shop stays closed.
 */
import type { ShopAddress, ShopProduct } from "@shared/shopCatalog";

const UPS_BASE = process.env.UPS_API_BASE || "https://onlinetools.ups.com";
export const UPS_SERVICE_NAME = "UPS Ground";
const UPS_GROUND = "03";

export function upsConfigured(): boolean {
  const e = process.env;
  return Boolean(
    e.UPS_CLIENT_ID && e.UPS_CLIENT_SECRET && e.UPS_SHIPPER_NUMBER &&
    e.SHOP_SHIP_FROM_LINE1 && e.SHOP_SHIP_FROM_CITY && e.SHOP_SHIP_FROM_STATE && e.SHOP_SHIP_FROM_ZIP,
  );
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${UPS_BASE}/security/v1/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`UPS sign-in failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: string | number };
  token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return token.value;
}

/** One box per unit: each product ships in its own carton. */
export function upsPackages(lines: { product: ShopProduct; qty: number }[]) {
  const packages = [];
  for (const { product, qty } of lines) {
    if (product.weightLb == null) throw new Error(`No shipping weight on file for ${product.name}`);
    for (let i = 0; i < qty; i++) {
      packages.push({
        PackagingType: { Code: "02" },
        ...(product.dimsIn && {
          Dimensions: {
            UnitOfMeasurement: { Code: "IN" },
            Length: String(product.dimsIn.length),
            Width: String(product.dimsIn.width),
            Height: String(product.dimsIn.height),
          },
        }),
        PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(product.weightLb) },
      });
    }
  }
  return packages;
}

/** UPS Ground cost, in cents, to send these boxes to this address. */
export async function upsGroundRateCents(
  to: ShopAddress,
  lines: { product: ShopProduct; qty: number }[],
): Promise<number> {
  const e = process.env;
  const from = {
    AddressLine: [e.SHOP_SHIP_FROM_LINE1],
    City: e.SHOP_SHIP_FROM_CITY,
    StateProvinceCode: e.SHOP_SHIP_FROM_STATE,
    PostalCode: e.SHOP_SHIP_FROM_ZIP,
    CountryCode: "US",
  };
  const packages = upsPackages(lines);
  const res = await fetch(`${UPS_BASE}/api/rating/v2409/Rate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      transId: `certxa-${Date.now()}`,
      transactionSrc: "certxa-shop",
    },
    body: JSON.stringify({
      RateRequest: {
        Request: { TransactionReference: { CustomerContext: "certxa-shop" } },
        Shipment: {
          Shipper: { Name: "Certxa", ShipperNumber: e.UPS_SHIPPER_NUMBER, Address: from },
          ShipFrom: { Name: "Certxa", Address: from },
          ShipTo: {
            Name: to.name,
            Address: {
              AddressLine: [to.line1, to.line2].filter(Boolean),
              City: to.city,
              StateProvinceCode: to.state.toUpperCase(),
              PostalCode: to.zip.slice(0, 5),
              CountryCode: "US",
            },
          },
          PaymentDetails: { ShipmentCharge: [{ Type: "01", BillShipper: { AccountNumber: e.UPS_SHIPPER_NUMBER } }] },
          Service: { Code: UPS_GROUND },
          NumOfPieces: String(packages.length),
          Package: packages,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.response?.errors?.[0]?.message || `status ${res.status}`;
    throw new Error(`UPS could not rate this address: ${reason}`);
  }
  const rated = body?.RateResponse?.RatedShipment;
  const shipment = Array.isArray(rated) ? rated[0] : rated;
  const amount = Number(shipment?.TotalCharges?.MonetaryValue);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("UPS returned no rate for this address");
  return Math.round(amount * 100);
}
