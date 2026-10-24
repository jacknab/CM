/**
 * Printing a receipt again on the tablet's receipt printer (owner, 2026-10-24: the paper ran out and there was no way
 * to print the receipt again). Two ways in:
 *   - a paid ticket's receipt, opened by its ticket # (ReceiptDialog → Print), from the receipt saved with the sale;
 *   - the last receipt this tablet printed (the Reprint function key), kept on the tablet by CheckoutMode.
 * Both go to the Certxa tablet app over the same PRINT_RECEIPT message a sale uses, and wait for its answer.
 */
import { buildNativeReceiptPayload } from "@/lib/receiptPayload";
import { isNativeApp } from "./useCardPayments";

/** The receipt saved with a paid ticket (receipt_snapshot), as ReceiptDialog shows it. */
export interface SavedReceipt {
  storeName: string; storeAddress?: string; storePhone?: string;
  ticketNumber: number | string; dateIso: string; clientName?: string; staffName?: string;
  items: { label: string; price: number; section?: string; kind?: "service" | "product" | "tip" }[];
  subtotal: number; discount: number; tax?: number; tip: number; total: number;
  tenders: { method: string; amount: number }[];
  cardDetails?: { paymentIntentId?: string };
}

/** Same key CheckoutMode keeps the last printed receipt under. */
const LAST_RECEIPT_KEY = "certxa.nail.lastReceipt";

export const canPrintReceipts = () => isNativeApp() && !!(window as any).CERTXA_PRINT_BRIDGE;

/** The customer's copy, printed by the tablet app. Resolves with null when it printed, else the reason it did not. */
function sendToPrinter(receipt: unknown, paymentIntentId: string | null): Promise<string | null> {
  if (!canPrintReceipts()) return Promise.resolve("Receipts print from the Certxa tablet app with a receipt printer set up.");
  return new Promise((resolve) => {
    const requestId = `rp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let done = false;
    const finish = (error: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_print_result", onResult);
      resolve(error);
    };
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finish(d.ok ? null : String(d.error || "The receipt did not print."));
    };
    const timer = setTimeout(() => finish("The printer did not respond. Check that it is on, has paper, and is connected."), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "PRINT_RECEIPT", requestId, copy: "customer", paymentIntentId, receipt }));
  });
}

/** Print a paid ticket's saved receipt again. */
export function printSavedReceipt(r: SavedReceipt): Promise<string | null> {
  const receipt = buildNativeReceiptPayload({
    storeName: r.storeName, storeAddress: r.storeAddress, storePhone: r.storePhone,
    ticketNumber: r.ticketNumber, dateIso: r.dateIso, clientName: r.clientName, staffName: r.staffName,
    items: r.items, subtotal: r.subtotal, discount: r.discount, tax: r.tax ?? 0, tip: r.tip, grandTotal: r.total,
    tenders: r.tenders, changeDue: 0,
  });
  return sendToPrinter(receipt, r.cardDetails?.paymentIntentId ?? null);
}

/** Print the last receipt this tablet printed again. */
export function reprintLastReceipt(): Promise<string | null> {
  let last: { receipt: unknown | null; paymentIntentId: string | null } | null = null;
  try { const raw = localStorage.getItem(LAST_RECEIPT_KEY); last = raw ? JSON.parse(raw) : null; } catch { last = null; }
  if (!last?.receipt) return Promise.resolve("No receipt has been printed on this tablet yet. Open the ticket by its # to print its receipt.");
  return sendToPrinter(last.receipt, last.paymentIntentId ?? null);
}
