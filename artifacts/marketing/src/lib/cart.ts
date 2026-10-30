import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine {
  sku: string;
  qty: number;
}

export const MAX_QTY = 10;

/** Product names on the Hardware page mapped to shop SKUs. */
export const SKU_BY_NAME: Record<string, string> = {
  'Certxa Station': 'station',
  'Certxa Kiosk': 'kiosk',
  'Stripe M2 Card Reader': 'card-reader',
  'T-Mobile REVVL TAB 2 5G | 64GB 10.1" Tablet': 'customer-screen', // the customer facing screen (owner, 2026-10-24)
  'IP Thermal Receipt Printer': 'receipt-printer',
  'Cash Drawer': 'cash-drawer',
};

interface CartState {
  lines: CartLine[];
  add: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (sku) =>
        set((s) => {
          const found = s.lines.find((l) => l.sku === sku);
          if (found) {
            return { lines: s.lines.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l)) };
          }
          return { lines: [...s.lines, { sku, qty: 1 }] };
        }),
      setQty: (sku, qty) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.sku === sku ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)),
        })),
      remove: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'certxa-cart' },
  ),
);

export interface ShopStatus {
  open: boolean;
  /** Stripe's publishable key, for the card fields at checkout (only when the shop is open). */
  publishableKey?: string | null;
  products: { sku: string; name: string; priceCents: number }[];
}

export async function fetchShopStatus(): Promise<ShopStatus> {
  const res = await fetch('/api/shop/status');
  if (!res.ok) throw new Error('Shop status unavailable');
  return res.json();
}

let statusRequest: Promise<ShopStatus> | null = null;

/**
 * Shop status for the current visitor: undefined until it has loaded. Asked again every time a page using it opens
 * (owner, 2026-10-30: moving to /products inside the site showed the prices written on the page, or the first ones
 * seen, until a hard refresh) — only requests made at the same moment share one answer. Only in the browser, so
 * rendering a page on the server never starts a request. The prices it brings are also put where priceLabel reads them.
 */
export function useShopStatus(): ShopStatus | undefined {
  const [status, setStatus] = useState<ShopStatus | undefined>(undefined);
  useEffect(() => {
    let live = true;
    statusRequest ??= fetchShopStatus().finally(() => { statusRequest = null; });
    statusRequest.then((s) => {
      // The current prices ({ sku: cents }), for priceLabel / livePriceCents on this and the next page.
      if (s.products?.length) (window as any).__CERTXA_SHOP_PRICES__ = Object.fromEntries(s.products.map((p) => [p.sku, p.priceCents]));
      if (live) setStatus(s);
    }).catch(() => live && setStatus({ open: false, products: [] }));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

export const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** "$69", "$1,299", "$149.99". */
export const formatPrice = (cents: number) =>
  cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-US')}` : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/**
 * A product's price as set on the /isAdmin Hardware Prices page, in cents: the server puts every price in the page
 * (window.__CERTXA_SHOP_PRICES__, by SKU; on the server, the same global) so it's in the HTML. Null when it isn't.
 */
export function livePriceCents(productName: string): number | null {
  const sku = SKU_BY_NAME[productName];
  if (!sku) return null;
  const prices = (typeof window !== 'undefined' ? (window as any).__CERTXA_SHOP_PRICES__ : (globalThis as any).__CERTXA_SHOP_PRICES__) as Record<string, number> | undefined;
  const cents = prices?.[sku];
  return typeof cents === 'number' ? cents : null;
}

/** The price to show for a product: the admin's, or the one written on the page when there is none. */
export function priceLabel(productName: string, fallback: string): string {
  const cents = livePriceCents(productName);
  return cents == null ? fallback : formatPrice(cents);
}
