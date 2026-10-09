import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, AlertCircle, Clock } from "lucide-react";
import { formatInTz } from "@/lib/timezone";

// ─────────────────────────────────────────────────────────────────────────
// The Z Report is printed on 80mm thermal paper, so its markup is a plain
// monospace HTML string (like components/Receipt.tsx's buildReceiptHtml) —
// not a desktop report squeezed onto receipt paper. This is the ONE renderer:
// the on-screen preview shows this exact HTML inside an iframe (srcDoc), and
// printing calls window.print() on that same iframe, so preview and print can
// never drift apart — the printed page is always exactly what was previewed.
// ─────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "$1,234.56" for a positive amount, "-$1,234.56" for a negative one. */
function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-$" : "$") + abs;
}

function int(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", card: "Credit/Debit", credit: "Credit/Debit", credit_card: "Credit/Debit", debit: "Debit",
  stripe: "Card", m2: "Card (M2)", tap: "Tap to Pay", gift: "Gift Card", check: "Check",
  venmo: "Venmo", zelle: "Zelle", cashapp: "Cash App",
};
function paymentLabel(key: string): string {
  return PAYMENT_LABELS[key.toLowerCase()] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

function sumValues(obj: Record<string, number> | null | undefined): number {
  return Object.values(obj || {}).reduce((s: number, v) => s + (Number(v) || 0), 0);
}

// ── row builders (plain strings — this is print markup, not JSX) ──────────
function row(label: string, value: string, opts: { bold?: boolean } = {}): string {
  return `<div class="row${opts.bold ? " bold" : ""}"><span>${esc(label)}</span><span>${value}</span></div>`;
}
function row2(label: string, today: string, ytd: string, opts: { bold?: boolean } = {}): string {
  return `<div class="row3${opts.bold ? " bold" : ""}"><span class="lbl">${esc(label)}</span><span class="v">${today}</span><span class="v">${ytd}</span></div>`;
}
function header(title: string): string {
  return `<div class="section-header">${esc(title)}</div>`;
}
const DASHED = `<div class="dashed"></div>`;
const SOLID = `<div class="solid"></div>`;
const SPACER = `<div class="spacer"></div>`;

export function buildZReportHtml(report: any): string {
  const h = report.header;
  const businessDateLabel = h.businessDate
    ? new Date(`${h.businessDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "";
  const closedLabel = h.closedAt ? formatInTz(h.closedAt, h.timezone, "h:mm a") : "Not yet closed";

  const fs = report.financialSummary;
  const ps = report.paymentSummary;
  const cd = report.cashDrawer;
  const ss = report.serviceSales;
  const tc = report.technicianCommissions as any[];
  const tcTotals = report.technicianCommissionTotals;
  const tips = report.tips;
  const adj = report.adjustments;
  const gc = report.giftCards;
  const loy = report.loyalty;
  const tSales = report.technicianSales as any[];
  const txn = report.transactionSummary;
  const se = report.salonEarnings;

  // Union of payment methods that had any activity today or YTD — never a hard-coded list.
  const methodKeys = Array.from(new Set([...Object.keys(ps.today), ...Object.keys(ps.ytd)]))
    .filter((k) => (ps.today[k] || 0) > 0 || (ps.ytd[k] || 0) > 0)
    .sort((a, b) => (ps.ytd[b] || 0) - (ps.ytd[a] || 0));

  const categoryKeys = Array.from(new Set([...Object.keys(ss.today), ...Object.keys(ss.ytd)]))
    .filter((k) => (ss.today[k] || 0) > 0 || (ss.ytd[k] || 0) > 0)
    .sort((a, b) => (ss.ytd[b] || 0) - (ss.ytd[a] || 0));

  const body = `
${SPACER}
<div class="center">
  <div class="brand">CERTXA</div>
  <div class="salon-name">${esc(h.salonName)}</div>
  <div class="bold" style="margin-top:4px">DAY CLOSE / Z REPORT</div>
</div>
${DASHED}
${row("Business Date:", esc(businessDateLabel))}
${row("Closed:", esc(closedLabel))}
${h.closedBy ? row("Closed By:", esc(h.closedBy)) : ""}
${h.registerName ? row("Register:", esc(h.registerName)) : ""}
${DASHED}

${header("FINANCIAL SUMMARY")}
${row2("", "TODAY", "YTD", { bold: true })}
${row2("Gross Sales", money(fs.today.grossSales), money(fs.ytd.grossSales))}
${row2("Discounts", money(-fs.today.discounts), money(-fs.ytd.discounts))}
${fs.today.refunds > 0 || fs.ytd.refunds > 0 ? row2("Refunds", money(-fs.today.refunds), money(-fs.ytd.refunds)) : ""}
${row2("NET SALES", money(fs.today.netSales), money(fs.ytd.netSales), { bold: true })}
${row2("Sales Tax", money(fs.today.salesTax), money(fs.ytd.salesTax))}
${row2("TOTAL COLLECTED", money(fs.today.totalCollected), money(fs.ytd.totalCollected), { bold: true })}
${row2("Tips", money(fs.today.tips), money(fs.ytd.tips))}
${row2("Tickets", int(fs.today.tickets), int(fs.ytd.tickets))}
${row2("Avg Ticket", money(fs.today.avgTicket), money(fs.ytd.avgTicket))}
${SPACER}

${header("PAYMENT SUMMARY")}
${row2("", "TODAY", "YTD", { bold: true })}
${methodKeys.length ? methodKeys.map((k) => row2(paymentLabel(k), money(ps.today[k] || 0), money(ps.ytd[k] || 0))).join("") : `<div class="small center" style="margin:4px 0">No transactions.</div>`}
${row2("TOTAL", money(sumValues(ps.today)), money(sumValues(ps.ytd)), { bold: true })}
${SPACER}

${header("CASH DRAWER")}
${row("Opening Cash", money(cd.openingCash))}
${row("Cash Sales", "+" + money(cd.cashSales))}
${cd.cashRefunds > 0 ? row("Cash Refunds", money(-cd.cashRefunds)) : ""}
${cd.cashPaidIn > 0 ? row("Cash Paid In", "+" + money(cd.cashPaidIn)) : ""}
${cd.cashPaidOut > 0 ? row("Cash Paid Out", money(-cd.cashPaidOut)) : ""}
${row("Expected Cash", money(cd.expectedCash), { bold: true })}
${SPACER}
${cd.actualCashCounted != null ? row("Actual Cash Counted", money(cd.actualCashCounted)) : `<div class="small">Actual Cash Counted: pending count</div>`}
${cd.variance != null ? row("VARIANCE", (cd.variance >= 0 ? "+" : "") + money(cd.variance), { bold: true }) : ""}
${row("Cash Remaining / Deposit", money(cd.cashDeposit))}
${SPACER}

${categoryKeys.length ? `
${header("SERVICE SALES")}
${row2("", "TODAY", "YTD", { bold: true })}
${categoryKeys.map((k) => row2(k, money(ss.today[k] || 0), money(ss.ytd[k] || 0))).join("")}
${SPACER}` : ""}

${header("TECHNICIAN COMMISSIONS")}
${tc.length ? `
<div class="row4 bold small"><span class="lbl">TECH</span><span class="v">RATE</span><span class="v">TODAY</span><span class="v">YTD</span></div>
${tc.map((t) => `<div class="row4 small"><span class="lbl">${esc(t.name)}</span><span class="v">${t.ratePct.toFixed(0)}%</span><span class="v">${money(t.commissionToday)}</span><span class="v">${money(t.commissionYtd)}</span></div>`).join("")}
${DASHED}
<div class="row4 bold small"><span class="lbl">TOTAL</span><span class="v"></span><span class="v">${money(tcTotals.commissionToday)}</span><span class="v">${money(tcTotals.commissionYtd)}</span></div>
` : `<div class="small center" style="margin:4px 0">No commissionable revenue today.</div>`}
${SPACER}

${header("SALON EARNINGS")}
${row2("", "TODAY", "YTD", { bold: true })}
${row2("Net Service Revenue", money(se.today.netServiceRevenue), money(se.ytd.netServiceRevenue))}
${row2("Technician Commissions", money(-se.today.technicianCommissions), money(-se.ytd.technicianCommissions))}
${row2("SALON EARNINGS", money(se.today.salonEarnings), money(se.ytd.salonEarnings), { bold: true })}
<div class="tiny" style="margin-top:2px">After technician commissions; before operating expenses.</div>
${se.openHour.totalOpenHours != null ? `
${SPACER}
<div class="bold">SALON EARNINGS / OPEN HOUR</div>
${row("Business Open:", esc(se.openHour.businessOpen || ""))}
${row("Total Open Hours:", `${se.openHour.totalOpenHours.toFixed(1)} hours`)}
${row("Salon Earnings:", money(se.today.salonEarnings))}
${row("PER OPEN HOUR", money(se.openHour.salonEarningsPerOpenHour), { bold: true })}
` : ""}
${SPACER}

${header("TIPS")}
${row2("", "TODAY", "YTD", { bold: true })}
${row2("Tips Collected", money(tips.today.total), money(tips.ytd.total))}
${row2("Cash Tips", money(tips.today.cash), money(tips.ytd.cash))}
${row2("Card Tips", money(tips.today.card), money(tips.ytd.card))}
${SPACER}

${header("ADJUSTMENTS")}
${row("Discounts", money(-adj.discounts.today))}
${adj.refunds.today > 0 ? row("Refunds", money(-adj.refunds.today)) : ""}
${SPACER}

${gc ? `
${header("GIFT CARDS")}
${row("Sold Today", money(gc.today.sold))}
${row("Redeemed Today", money(gc.today.redeemed))}
${row("YTD Sold", money(gc.ytd.sold))}
${row("YTD Redeemed", money(gc.ytd.redeemed))}
${SPACER}` : ""}

${loy ? `
${header("LOYALTY")}
${row("Points Earned Today", int(loy.today.earned))}
${row("Points Redeemed Today", int(loy.today.redeemed))}
${loy.today.rewardValueRedeemed > 0 ? row("Reward Value Redeemed", money(loy.today.rewardValueRedeemed)) : ""}
${SPACER}` : ""}

${tSales.length ? `
${header("TECHNICIAN SALES")}
<div class="row4 bold small"><span class="lbl">TECH</span><span class="v">TICKETS</span><span class="v">SERVICE</span><span class="v">TIPS</span></div>
${tSales.map((t) => `<div class="row4 small"><span class="lbl">${esc(t.name)}</span><span class="v">${t.tickets}</span><span class="v">${money(t.serviceRevenue)}</span><span class="v">${money(t.tips)}</span></div>`).join("")}
${SPACER}` : ""}

${header("TRANSACTIONS")}
${row("Completed", int(txn.completed))}
${txn.refunded > 0 ? row("Refunded", int(txn.refunded)) : ""}
${txn.noShow > 0 ? row("No-Show", int(txn.noShow)) : ""}
${row("Total", int(txn.total), { bold: true })}
${SPACER}

${DASHED}
${header("DAY CLOSE")}
${row("Business Date:", esc(businessDateLabel))}
${h.closedBy ? row("Closed By:", esc(h.closedBy)) : ""}
${row("Close Time:", esc(closedLabel))}
${h.registerName ? row("Register:", esc(h.registerName)) : ""}
${SPACER}
${row("Expected Cash:", money(cd.expectedCash))}
${cd.actualCashCounted != null ? row("Actual Cash:", money(cd.actualCashCounted)) : ""}
${cd.variance != null ? row("Variance:", (cd.variance >= 0 ? "+" : "") + money(cd.variance)) : ""}
${SOLID}
<div class="center bold" style="margin:8px 0 4px">${h.closedAt ? "DAY CLOSED" : "PREVIEW — DAY NOT YET CLOSED"}</div>
${SPACER}
`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Z Report — ${esc(businessDateLabel)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Courier New', 'Lucida Console', monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #000;
  background: #fff;
  width: 320px;
  padding: 10px 8px;
}
.center { text-align: center; }
.bold { font-weight: bold; }
.small { font-size: 10.5px; }
.tiny { font-size: 9.5px; color: #444; }
.brand { font-size: 15px; font-weight: bold; letter-spacing: 2px; }
.salon-name { font-size: 13px; font-weight: bold; margin-top: 2px; }
.dashed { border-top: 1px dashed #000; margin: 6px 0; }
.solid { border-top: 1px solid #000; margin: 6px 0; }
.spacer { height: 8px; }
.section-header { font-weight: bold; font-size: 12px; margin: 2px 0 4px; text-transform: uppercase; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row.bold { font-weight: bold; }
.row3 { display: flex; gap: 4px; }
.row3 .lbl { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row3 .v { width: 72px; text-align: right; }
.row3.bold { font-weight: bold; }
.row4 { display: flex; gap: 4px; }
.row4 .lbl { flex: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row4 .v { width: 54px; text-align: right; }
@media print {
  @page { margin: 0; size: 80mm auto; }
  body { width: 100%; }
}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ── printing (same hidden-iframe pattern as components/Receipt.tsx) ───────
export function printZReportHtml(html: string) {
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
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore
    }
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };
}

// ── native bridge (certxa-owner Android app's USB/Bluetooth/IP thermal printer) ────────────
// Same postMessage/certxa_native_print_result contract Calendar.tsx and CheckoutMode.tsx
// already use for PRINT_RECEIPT — see apps/certxa-owner/app/index.tsx's PRINT_ZREPORT case.
export function canNativePrint(): boolean {
  return typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP && !!(window as any).CERTXA_PRINT_BRIDGE;
}

/**
 * The native layout (apps/certxa-owner/lib/zReportText.ts) expects its header pre-formatted by the web
 * caller: `businessDate` like "September 28, 2026" and `closedLabel` like "9:47 PM" / "Not yet closed",
 * in the salon's timezone. The server sends raw values (YYYY-MM-DD + an ISO closedAt), which printed as
 * "Closed: undefined" — so format them here, the one place that hands the report to the app.
 */
export function toNativeZReport(report: any): any {
  const h = report?.header ?? {};
  const tz = h.timezone || undefined;
  let businessDate = h.businessDate ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    // A calendar date, not an instant — format it at noon UTC so no timezone can shift the day.
    businessDate = new Date(`${businessDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
  }
  let closedLabel = "Not yet closed";
  if (h.closedAt) {
    try { closedLabel = new Date(h.closedAt).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }); }
    catch { closedLabel = new Date(h.closedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  }
  return { ...report, dayClosed: report?.dayClosed ?? !!h.closedAt, header: { ...h, businessDate, closedLabel } };
}

export function nativePrintZReport(report: any): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const requestId = `zr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const timer = setTimeout(() => finish(false, "The printer did not respond. Check that it is on and connected."), 45_000);
    const finish = (ok: boolean, error?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_print_result", onResult);
      resolve({ ok, error });
    };
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finish(!!d.ok, d.error || undefined);
    };
    window.addEventListener("certxa_native_print_result", onResult);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "PRINT_ZREPORT", requestId, report: toNativeZReport(report) }));
  });
}

interface ZReportDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: number | null;
}

/** Screen preview + print entry point for the Z Report — fetches the full report from
 *  the backend (the one source of truth for every number on it) and renders it inside
 *  an iframe at receipt-like proportions, so what's previewed is exactly what prints.
 *  Printing itself prefers the certxa-owner app's IP/thermal printer when running there
 *  (the register tablet's real printer), falling back to Chrome's print dialog on a
 *  regular desktop/laptop browser. */
export function ZReportDialog({ open, onClose, sessionId }: ZReportDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string>("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Custom queryFn (rather than the default getQueryFn) because a 409 UNPAID_TICKETS
  // response carries a structured body — the ticket list to show the user — that the
  // default fetcher would otherwise flatten into an unparsed error-message string.
  const { data: result, isLoading } = useQuery<
    { ok: true; report: any } | { ok: false; blocked?: { unpaidCount: number; unpaidTickets: any[] }; message: string }
  >({
    queryKey: [`/api/cash-drawer/sessions/${sessionId}/z-report-full`],
    queryFn: async () => {
      const res = await fetch(`/api/cash-drawer/sessions/${sessionId}/z-report-full`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, report: body };
      if (res.status === 409 && body.code === "UNPAID_TICKETS") {
        return { ok: false, blocked: { unpaidCount: body.unpaidCount, unpaidTickets: body.unpaidTickets ?? [] }, message: body.message };
      }
      return { ok: false, message: body.message || "Could not load the Z Report." };
    },
    enabled: open && !!sessionId,
  });

  const report = result?.ok ? result.report : null;
  const blocked = result && !result.ok ? result.blocked : undefined;
  const loadError = result && !result.ok && !blocked ? result.message : null;

  useEffect(() => {
    if (report) setHtml(buildZReportHtml(report));
  }, [report]);

  useEffect(() => {
    // Reset for next open so a stale report never flashes before the new query resolves.
    if (!open) { setHtml(""); setPrintError(null); }
  }, [open]);

  const handlePrint = useCallback(async () => {
    setPrintError(null);
    if (canNativePrint() && report) {
      setPrinting(true);
      const result = await nativePrintZReport(report);
      setPrinting(false);
      if (!result.ok) setPrintError(result.error || "The printer did not respond.");
      return;
    }
    if (html) printZReportHtml(html);
  }, [html, report]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b bg-white flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm font-semibold">Z Report Preview</DialogTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handlePrint} disabled={!html || printing || !!blocked} data-testid="button-print-zreport-full">
                <Printer className="w-3.5 h-3.5" />
                {printing ? "Printing…" : "Print"}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} data-testid="button-close-zreport-full">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        {printError && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100 flex-shrink-0">
            {printError}
          </div>
        )}
        <div className="flex-1 overflow-auto bg-gray-100 flex justify-center py-4">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading Z Report…</div>
          ) : blocked ? (
            <div className="w-full max-w-xs px-4 space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold mb-1">
                    {blocked.unpaidCount} open ticket{blocked.unpaidCount === 1 ? "" : "s"} must be checked out first
                  </p>
                  <p className="text-red-700 text-xs">
                    The Z Report can't be generated while any booking is still in progress and unpaid.
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {blocked.unpaidTickets.map((ticket: any) => (
                  <li key={ticket.id} className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs leading-snug">
                      <p className="font-medium text-gray-900">
                        {ticket.customerName ?? "Walk-in"}
                        {ticket.serviceName ? ` — ${ticket.serviceName}` : ""}
                      </p>
                      {ticket.staffName && <p className="text-gray-500">with {ticket.staffName}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : loadError ? (
            <div className="py-12 text-center text-sm text-red-600 px-4">{loadError}</div>
          ) : !html ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading Z Report…</div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={html}
              title="Z Report"
              style={{ width: 340, height: 2400, border: "1px solid #ddd", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
