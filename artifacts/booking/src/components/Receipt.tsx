import { useCallback } from "react";
import type { Service, Addon, Customer, Staff, Store } from "@shared/schema";

type ReceiptItem = {
  service: Service;
  addons: Addon[];
  staffId: number | null;
};

export type ReceiptData = {
  store: Store | null;
  client: Customer | null;
  staff: Staff | null;
  items: ReceiptItem[];
  subtotal: number;
  taxAmount?: number;
  tipAmount: number;
  grandTotal: number;
  paymentMethod?: string;
  transactionId: string;
  dateStr: string;
  timeStr: string;
};

export function createReceiptData(params: {
  store: Store | null;
  client: Customer | null;
  staff: Staff | null;
  items: ReceiptItem[];
  subtotal: number;
  tipAmount: number;
  grandTotal: number;
  paymentMethod?: string;
}): ReceiptData {
  const now = new Date();
  const tz = params.store?.timezone || undefined;
  const tzOpts = tz ? { timeZone: tz } : {};
  return {
    ...params,
    transactionId: Math.random().toString(36).substring(2, 10).toUpperCase(),
    dateStr: new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", ...tzOpts }).format(now),
    timeStr: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, ...tzOpts }).format(now),
  };
}

function ReceiptContent({ data }: { data: ReceiptData }) {
  return (
    <div className="receipt-content" style={{
      width: "302px",
      fontFamily: "'Courier New', 'Lucida Console', monospace",
      fontSize: "12px",
      lineHeight: "1.4",
      color: "#000",
      background: "#fff",
      padding: "12px 8px",
    }}>
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "18px", fontWeight: "bold", letterSpacing: "1px" }}>
          {data.store?.name || "Salon"}
        </div>
        {data.store?.address && (
          <div style={{ fontSize: "11px", marginTop: "2px" }}>{data.store.address}</div>
        )}
        {data.store?.phone && (
          <div style={{ fontSize: "11px" }}>Tel: {data.store.phone}</div>
        )}
        {data.store?.email && (
          <div style={{ fontSize: "11px" }}>{data.store.email}</div>
        )}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
        <span>Date: {data.dateStr}</span>
        <span>Time: {data.timeStr}</span>
      </div>
      {data.staff && (
        <div style={{ fontSize: "11px" }}>Staff: {data.staff.name}</div>
      )}
      {data.client && (
        <div style={{ fontSize: "11px" }}>Client: {data.client.name}</div>
      )}
      <div style={{ fontSize: "11px" }}>Txn: #{data.transactionId}</div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div style={{ marginBottom: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "11px", marginBottom: "4px" }}>
          <span>ITEM</span>
          <span>PRICE</span>
        </div>
        {data.items.map((item, index) => (
          <div key={index} style={{ marginBottom: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ flex: 1, marginRight: "8px", wordBreak: "break-word" }}>{item.service.name}</span>
              <span>${Number(item.service.price).toFixed(2)}</span>
            </div>
            <div style={{ fontSize: "11px", color: "#444" }}>
              {item.service.duration} min
            </div>
            {item.addons.map((addon) => (
              <div key={addon.id} style={{ display: "flex", justifyContent: "space-between", paddingLeft: "8px", fontSize: "11px" }}>
                <span>+ {addon.name}</span>
                <span>${Number(addon.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <div style={{ fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>${data.subtotal.toFixed(2)}</span>
        </div>
        {data.tipAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Tip</span>
            <span>${data.tipAmount.toFixed(2)}</span>
          </div>
        )}
        {(data.taxAmount ?? 0) > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Tax</span>
            <span>${(data.taxAmount ?? 0).toFixed(2)}</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid #000", margin: "6px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "16px" }}>
        <span>TOTAL</span>
        <span>${data.grandTotal.toFixed(2)}</span>
      </div>

      {data.paymentMethod && (
        <>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Payment</span>
            <span>{data.paymentMethod}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Amount Paid</span>
            <span>${data.grandTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Change</span>
            <span>$0.00</span>
          </div>
        </>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

      <div style={{ textAlign: "center", fontSize: "11px" }}>
        <div>Thank you for visiting!</div>
        <div style={{ marginTop: "2px" }}>We look forward to seeing you again.</div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

      <div style={{ textAlign: "center", fontSize: "10px", color: "#666" }}>
        {data.dateStr} {data.timeStr}
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReceiptHtml(data: ReceiptData): string {
  return `<!DOCTYPE html>
<html>
<head>
<title>Receipt</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Courier New', 'Lucida Console', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #000;
  background: #fff;
  width: 302px;
  padding: 12px 8px;
}
.center { text-align: center; }
.bold { font-weight: bold; }
.row { display: flex; justify-content: space-between; }
.dashed { border-top: 1px dashed #000; margin: 6px 0; }
.solid { border-top: 1px solid #000; margin: 6px 0; }
.small { font-size: 11px; }
.tiny { font-size: 10px; color: #666; }
.total { font-size: 16px; font-weight: bold; }
.addon { padding-left: 8px; font-size: 11px; }
.store-name { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
.item-block { margin-bottom: 4px; }
.duration { font-size: 11px; color: #444; }
@media print {
  @page { margin: 0; size: 80mm auto; }
  body { width: 100%; }
}
</style>
</head>
<body>
<div class="center" style="margin-bottom:8px">
  <div class="store-name">${escapeHtml(data.store?.name || "Salon")}</div>
  ${data.store?.address ? `<div class="small">${escapeHtml(data.store.address)}</div>` : ""}
  ${data.store?.phone ? `<div class="small">Tel: ${escapeHtml(data.store.phone)}</div>` : ""}
  ${data.store?.email ? `<div class="small">${escapeHtml(data.store.email)}</div>` : ""}
</div>
<div class="dashed"></div>
<div class="row small">
  <span>Date: ${escapeHtml(data.dateStr)}</span>
  <span>Time: ${escapeHtml(data.timeStr)}</span>
</div>
${data.staff ? `<div class="small">Staff: ${escapeHtml(data.staff.name)}</div>` : ""}
${data.client ? `<div class="small">Client: ${escapeHtml(data.client.name)}</div>` : ""}
<div class="small">Txn: #${escapeHtml(data.transactionId)}</div>
<div class="dashed"></div>
<div class="row bold small" style="margin-bottom:4px">
  <span>ITEM</span>
  <span>PRICE</span>
</div>
${data.items.map((item) => `
<div class="item-block">
  <div class="row">
    <span>${escapeHtml(item.service.name)}</span>
    <span>$${Number(item.service.price).toFixed(2)}</span>
  </div>
  <div class="duration">${item.service.duration} min</div>
  ${item.addons.map((addon) => `
  <div class="row addon">
    <span>+ ${escapeHtml(addon.name)}</span>
    <span>$${Number(addon.price).toFixed(2)}</span>
  </div>`).join("")}
</div>`).join("")}
<div class="dashed"></div>
<div class="row">
  <span>Subtotal</span>
  <span>$${data.subtotal.toFixed(2)}</span>
</div>
${data.tipAmount > 0 ? `
<div class="row">
  <span>Tip</span>
  <span>$${data.tipAmount.toFixed(2)}</span>
</div>` : ""}
${(data.taxAmount ?? 0) > 0 ? `
<div class="row">
  <span>Tax</span>
  <span>$${(data.taxAmount ?? 0).toFixed(2)}</span>
</div>` : ""}
<div class="solid"></div>
<div class="row total">
  <span>TOTAL</span>
  <span>$${data.grandTotal.toFixed(2)}</span>
</div>
${data.paymentMethod ? `
<div class="dashed"></div>
<div class="row small">
  <span>Payment</span>
  <span>${escapeHtml(data.paymentMethod)}</span>
</div>
<div class="row small">
  <span>Amount Paid</span>
  <span>$${data.grandTotal.toFixed(2)}</span>
</div>
<div class="row small">
  <span>Change</span>
  <span>$0.00</span>
</div>` : ""}
<div class="dashed"></div>
<div class="center small">
  <div>Thank you for visiting!</div>
  <div>We look forward to seeing you again.</div>
</div>
<div class="dashed"></div>
<div class="center tiny">
  ${escapeHtml(data.dateStr)} ${escapeHtml(data.timeStr)}
</div>
</body>
</html>`;
}

export function useReceiptPrinter() {
  const printReceipt = useCallback((data: ReceiptData) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-10000px";
    iframe.style.left = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(buildReceiptHtml(data));
    doc.close();

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  }, []);

  return { printReceipt };
}

export { ReceiptContent };
