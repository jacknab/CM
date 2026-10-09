import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface CardDetails {
  brand?: string;
  last4?: string;
  entryMethod?: string;
  approvalCode?: string;
  paymentIntentId?: string;
}

interface ReceiptSnapshot {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  ticketNumber: number | string;
  dateIso: string;
  clientName?: string;
  staffName?: string;
  items: { label: string; price: number }[];
  subtotal: number;
  discount: number;
  tax?: number;
  tip: number;
  total: number;
  tenders: { method: string; amount: number }[];
  cardDetails?: CardDetails;
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const DASH = "-".repeat(40);

const BRAND_LABEL: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express",
  discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay",
};
const fmtBrand = (b: string) => BRAND_LABEL[b.toLowerCase()] ?? (b.charAt(0).toUpperCase() + b.slice(1));
const ENTRY_LABEL: Record<string, string> = { chip: "INSERT", contactless: "TAP", swipe: "SWIPE", manual: "MANUAL ENTRY", nfc: "CONTACTLESS" };
const fmtEntry = (m: string) => ENTRY_LABEL[m.toLowerCase()] ?? m.toUpperCase();

/**
 * The Barber POS's own in-app view of a paid ticket's receipt — reached by re-scanning that
 * ticket's QR, or "# Enter ID"-ing it, once it's paid (see NailHome.tsx's applyLookupResult).
 * Same data/endpoint as the public /receipt/:token page texted to clients (and the same
 * receipt_snapshot every paid ticket gets — see CheckoutMode.tsx), just shown in a dialog here
 * so staff don't lose their place on the board. Styled like the physical thermal receipt this
 * data would otherwise only ever be seen as, rather than an ordinary app screen.
 */
export function ReceiptDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const [data, setData] = useState<ReceiptSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/receipt/${token}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [token]);

  const r = data;
  const date = r ? new Date(r.dateIso) : null;
  const dateStr = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "";
  const timeStr = date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
  const paymentLabel = (m: string) => (m || "").charAt(0).toUpperCase() + (m || "").slice(1);

  const mono: React.CSSProperties = { fontFamily: "'Courier New', 'Lucida Console', monospace" };

  return (
    <>
      <div className="checkin-overlay" onClick={onClose} />
      <div className="checkin-modal-wrapper" onClick={onClose}>
        <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} data-testid="barber-receipt-dialog" style={{ maxWidth: 360 }}>
          <button type="button" className="checkin-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>

          {error && <div className="empty-ticket"><p>Couldn't load that receipt.</p></div>}
          {!error && !r && <div className="empty-ticket"><p>Loading receipt…</p></div>}

          {r && (
            <div style={{ ...mono, padding: "26px 20px 20px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text, #e5e7eb)" }}>
              <div style={{ textAlign: "center" }}>
                <strong style={{ fontSize: 15 }}>{r.storeName}</strong>
                {r.storeAddress && <div>{r.storeAddress}</div>}
                {r.storePhone && <div>{r.storePhone}</div>}
              </div>
              <div style={{ whiteSpace: "pre", opacity: 0.5, margin: "8px 0" }}>{DASH}</div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Date: {dateStr}</span>
                <span>{timeStr}</span>
              </div>
              {r.clientName && <div>Client: {r.clientName}</div>}
              {r.staffName && <div>Staff: {r.staffName}</div>}
              <div>Txn: #{r.ticketNumber}</div>
              <div style={{ whiteSpace: "pre", opacity: 0.5, margin: "8px 0" }}>{DASH}</div>

              {r.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", opacity: it.label.startsWith("+") ? 0.75 : 1 }}>
                  <span>{it.label}</span>
                  <span>{money(it.price)}</span>
                </div>
              ))}
              <div style={{ whiteSpace: "pre", opacity: 0.5, margin: "8px 0" }}>{DASH}</div>

              {r.tenders.length > 0 && (
                <>
                  {r.tenders.map((t, i) => (
                    <div key={i}>{paymentLabel(t.method)}</div>
                  ))}
                  {r.cardDetails?.brand && (
                    <div>{fmtBrand(r.cardDetails.brand)}{r.cardDetails.last4 ? ` ****${r.cardDetails.last4}` : ""}</div>
                  )}
                  {r.cardDetails?.entryMethod && <div>{fmtEntry(r.cardDetails.entryMethod)}</div>}
                  {(r.cardDetails?.approvalCode || r.cardDetails?.paymentIntentId) && <div style={{ height: 6 }} />}
                  {r.cardDetails?.approvalCode && <div>Approval: {r.cardDetails.approvalCode}</div>}
                  {r.cardDetails?.paymentIntentId && <div>TRN: {r.cardDetails.paymentIntentId}</div>}
                  <div style={{ whiteSpace: "pre", opacity: 0.5, margin: "8px 0" }}>{DASH}</div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal:</span><span>{money(r.subtotal)}</span></div>
              {r.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount:</span><span>-{money(r.discount)}</span></div>}
              {(r.tax ?? 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tax:</span><span>{money(r.tax ?? 0)}</span></div>}
              {r.tip > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tip:</span><span>{money(r.tip)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>TOTAL:</span><span>{money(r.total)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Amount Paid:</span><span>{money(r.tenders.reduce((s, t) => s + t.amount, 0) || r.total)}</span></div>
              <div style={{ whiteSpace: "pre", opacity: 0.5, marginTop: 8 }}>{DASH}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
