/**
 * Builds the receipt sent to the Android app's thermal printer (PRINT_RECEIPT). Pure, so the
 * amounts and labels are unit-tested. The shape matches the app's ReceiptData
 * (apps/certxa-owner/lib/receiptText.ts); card details are added by the app itself.
 */
export interface ReceiptPayloadInput {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  ticketNumber: number | string;
  dateIso: string;
  clientName?: string;
  items: { label: string; price: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  grandTotal: number;
  tenders: { method: string; amount: number }[];
  changeDue: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function tenderLabel(method: string): string {
  const m = String(method || "").toLowerCase();
  if (m === "m2" || m === "tap" || m === "card") return "Card";
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "Payment";
}

export function buildNativeReceiptPayload(i: ReceiptPayloadInput) {
  const labels = Array.from(new Set(i.tenders.map((t) => tenderLabel(t.method))));
  const numeric = Number(String(i.ticketNumber).replace(/\D/g, ""));
  return {
    storeName: i.storeName || "Receipt",
    storeAddress: i.storeAddress || undefined,
    storePhone: i.storePhone || undefined,
    receiptNumber: Number.isFinite(numeric) ? numeric : 0,
    date: i.dateIso,
    clientName: i.clientName || undefined,
    items: i.items.map((x) => ({ name: String(x.label).slice(0, 40), price: r2(x.price) })),
    subtotal: r2(i.subtotal),
    discount: r2(i.discount),
    tax: r2(i.tax),
    tip: r2(i.tip),
    grandTotal: r2(i.grandTotal),
    paymentMethod: labels.join(" + ") || "Payment",
    amountPaid: r2(i.tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    changeDue: r2(i.changeDue),
  };
}
