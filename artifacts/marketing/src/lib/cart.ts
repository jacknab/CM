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
  'Wireless Card Reader': 'card-reader',
  'Customer Facing Screen': 'customer-screen',
  'IP Thermal Receipt Printer': 'receipt-printer',
  'Cash Drawer': 'cash-drawer',
  'Barcode Scanner': 'barcode-scanner',
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
  products: { sku: string; name: string; priceCents: number }[];
}

export async function fetchShopStatus(): Promise<ShopStatus> {
  const res = await fetch('/api/shop/status');
  if (!res.ok) throw new Error('Shop status unavailable');
  return res.json();
}

let statusRequest: Promise<ShopStatus> | null = null;

/**
 * Shop status for the current visitor: undefined until it has loaded. Fetched
 * once per page load and only in the browser, so rendering a page on the
 * server never starts a request or leaves a timer behind.
 */
export function useShopStatus(): ShopStatus | undefined {
  const [status, setStatus] = useState<ShopStatus | undefined>(undefined);
  useEffect(() => {
    let live = true;
    statusRequest ??= fetchShopStatus().catch((err) => {
      statusRequest = null;
      throw err;
    });
    statusRequest.then((s) => live && setStatus(s)).catch(() => live && setStatus({ open: false, products: [] }));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

export const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
