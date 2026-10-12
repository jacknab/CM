/**
 * Hardware sold on certxa.com/products.
 *
 * The server prices every order from this list; the page only displays it.
 * `weightLb` and `dimsIn` are the BOXED shipping weight and size of one unit.
 * UPS rates cannot be requested for a product until they are filled in.
 */
export interface ShopProduct {
  sku: string;
  name: string;
  priceCents: number;
  weightLb: number | null;
  dimsIn: { length: number; width: number; height: number } | null;
}

export const SHOP_CATALOG: ShopProduct[] = [
  { sku: "station", name: "Certxa Station", priceCents: 79900, weightLb: null, dimsIn: null },
  { sku: "kiosk", name: "Certxa Kiosk", priceCents: 39900, weightLb: null, dimsIn: null },
  { sku: "card-reader", name: "Wireless Card Reader", priceCents: 14900, weightLb: null, dimsIn: null },
  { sku: "customer-screen", name: "Customer Facing Screen", priceCents: 14900, weightLb: null, dimsIn: null },
  { sku: "receipt-printer", name: "IP Thermal Receipt Printer", priceCents: 19900, weightLb: null, dimsIn: null },
  { sku: "cash-drawer", name: "Cash Drawer", priceCents: 9900, weightLb: null, dimsIn: null },
  { sku: "barcode-scanner", name: "Barcode Scanner", priceCents: 8900, weightLb: null, dimsIn: null },
];

export const SHOP_MAX_QTY = 10;

export function findShopProduct(sku: string): ShopProduct | undefined {
  return SHOP_CATALOG.find((p) => p.sku === sku);
}

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);

export interface ShopAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * True when a street line names a post office box. UPS cannot deliver to one.
 * Catches "PO Box 12", "P.O. Box 12", "Post Office Box 12", "POB 12", "Box 12" alone.
 */
export function isPoBox(line: string): boolean {
  const s = line.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  return /\b(p ?o ?b(ox)?|post office box|postal box)\b/.test(s) || /^box \d+/.test(s);
}

/** Checks a shipping address. Returns the reason it cannot be shipped to, or null when it can. */
export function shopAddressProblem(a: ShopAddress): string | null {
  if (!a.name?.trim()) return "Please enter the name for the delivery.";
  if (!a.line1?.trim()) return "Please enter a street address.";
  if (isPoBox(a.line1) || (a.line2 && isPoBox(a.line2))) return "We can't ship to a PO box. Please enter a street address.";
  if (!a.city?.trim()) return "Please enter a city.";
  if (!US_STATES.has((a.state || "").toUpperCase())) return "We ship to United States addresses only. Please choose a US state.";
  if (!/^\d{5}(-\d{4})?$/.test((a.zip || "").trim())) return "Please enter a valid US ZIP code.";
  return null;
}

export interface ShopCartLine {
  sku: string;
  qty: number;
}

/** Prices a cart from the catalog. Returns null if any line is not a real product or quantity. */
export function priceShopCart(lines: ShopCartLine[]): { items: { sku: string; name: string; qty: number; unitCents: number }[]; subtotalCents: number } | null {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const items = [];
  let subtotalCents = 0;
  for (const line of lines) {
    const product = findShopProduct(String(line?.sku));
    const qty = Number(line?.qty);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > SHOP_MAX_QTY) return null;
    items.push({ sku: product.sku, name: product.name, qty, unitCents: product.priceCents });
    subtotalCents += product.priceCents * qty;
  }
  return { items, subtotalCents };
}
