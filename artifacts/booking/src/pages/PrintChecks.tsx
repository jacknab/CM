import { useState, useRef, useCallback, lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Printer, ChevronRight, CheckCircle2, Clock, FileText,
  User, Banknote, Settings, Zap, AlertTriangle, Search,
  XCircle, MoreHorizontal, Eye, EyeOff, SlidersHorizontal,
  Building2, Mail, Package, RefreshCw, Layers, RotateCcw,
  CheckSquare, Square, MapPin, History,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PaperCalibrationTab, CalibrationPrintSheet,
  DEFAULT_CALIBRATION, type CalibrationSettings, type PaperLayout,
} from "./PrintChecksCalibration";
import { BIZ_CHECK_ZONES, MICR_ZONE, PAPER_PROFILES } from "@/lib/checkLayout";
import { useMicrFont } from "@/hooks/use-micr-font";

// ─── PDF download — lazy-loaded so @react-pdf/renderer doesn't block first paint
const CheckPDFDownload = lazy(() =>
  import("@/components/pdf/CheckPDFDownload").then(m => ({ default: m.CheckPDFDownload }))
);

// ─── Types ────────────────────────────────────────────────────────────────────

type PayrollRun = {
  id: number; storeId: number; periodStart: string; periodEnd: string;
  status: string; totalCommission: string; contractorCount: number;
  notes: string | null; createdBy: string | null; createdAt: string; finalizedAt: string | null;
};

type DailyBreakdownEntry = { date: string; commission: number; tips: number; count: number };

type PayrollCheckItem = {
  id: number; staffId: number; staffName: string; commissionRate: string;
  appointmentCount: number; serviceRevenue: string; addonRevenue: string;
  totalRevenue: string; commissionAmount: string; tipsAmount: number;
  hoursWorked: number; totalPay: number; status: string; notes: string | null;
  dailyBreakdown?: DailyBreakdownEntry[];
};

type CheckData = {
  run: PayrollRun;
  store: { name: string; address: string | null; city: string | null; state: string | null; postcode: string | null; phone: string | null; email: string | null; };
  items: PayrollCheckItem[];
};

type ContractorCheck = {
  id: number; storeId: number; contractorId: number; contractorName: string;
  checkNumber: number; amount: string; payeeName: string; memo: string | null;
  periodStart: string | null; periodEnd: string | null;
  printStatus: string; voidStatus: string; clearedStatus: string;
  issuedAt: string; printedAt: string | null; voidedAt: string | null; clearedAt: string | null;
  // 1099 mailing address from linked staff record
  mailingAddress1: string | null; mailingAddress2: string | null;
  mailingCity: string | null; mailingState: string | null; mailingZip: string | null;
};

type StoreInfo = {
  name: string; address?: string | null; city?: string | null;
  state?: string | null; postcode?: string | null; phone?: string | null;
};

type CorporateAddress = {
  id?: number;
  userId?: string;
  officeName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
};

type PrintBatch = {
  id: number;
  batchId: string;
  storeId: number;
  periodStart: string | null;
  periodEnd: string | null;
  checkCount: number;
  totalAmount: string;
  envelopeType: string;
  checksData: Array<{ checkNumber: string; payeeName: string; amount: number }> | null;
  mailerPrinted: boolean;
  printedAt: string;
  reprintedAt: string | null;
};

type PrintSettings = {
  startingCheckNumber: number;
  // Bank details (printed on check)
  bankName: string;
  bankAddress: string;
  bankCity: string;
  bankPhone: string;
  // Draw account details (salon owner)
  accountHolderName: string;
  accountAddress: string;
  routingNumber: string;
  accountNumber: string;
  stubCount: "one" | "two";
  calibration: CalibrationSettings;
  /**
   * "standard"        – blank white check stock (DocuGard 04502, 8.5"×11").
   *                     Renderer prints its own security design + all fields.
   * "preprinted"      – pre-printed blue security background paper (8.26"×10.76").
   *                     Renderer prints text/content only; backgrounds suppressed.
   * "officeDepotBlue" – Office Depot Standard Blue (Item #637540, 8.5"×11").
   *                     Same rendering as standard; separate calibration slot.
   */
  paperType: "standard" | "preprinted" | "officeDepotBlue";
  /** Per-profile calibration offsets — keyed by paperType string. */
  calibrationByProfile: Partial<Record<string, CalibrationSettings>>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(typeof d === "string" && d.includes("T") ? parseISO(d) : new Date(d + "T00:00:00"), "MM/dd/yyyy"); } catch { return d; }
}
function fmtShort(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(typeof d === "string" && d.includes("T") ? parseISO(d) : new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return String(d); }
}
function fmt$(n: string | number) {
  return `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function toWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWords(n % 100) : "");
  if (n < 1_000_000) return toWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + toWords(n % 1000) : "");
  return toWords(Math.floor(n / 1_000_000)) + " Million" + (n % 1_000_000 ? " " + toWords(n % 1_000_000) : "");
}

function amountToWords(amount: number): string {
  const dollars = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - dollars) * 100);
  const words = toWords(dollars) || "Zero";
  return `${words} and ${String(cents).padStart(2, "0")}/100 DOLLARS`;
}

/** Written-amount line with leading + trailing asterisks (fraud protection) */
function buildWrittenAmount(amount: number): string {
  const words = amountToWords(amount).toUpperCase();
  const core = `***** ${words} `;
  return core.length >= 74 ? core + "*****" : core.padEnd(76, "*");
}

function maskAccount(acct: string): string {
  if (acct.length <= 4) return acct;
  return "*".repeat(acct.length - 4) + acct.slice(-4);
}

/**
 * ABA fractional transit number — required for manual clearing backup.
 * Format: [fed-district]-[institution] / [fed-routing-prefix]
 * Derived algorithmically from the 9-digit ABA routing number.
 * e.g. routing 122000496 → "12-4/1220"
 */
function buildFractional(routing: string): string {
  const r = routing.replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
  const fedDistrict = r.slice(0, 2);
  const institution = parseInt(r.slice(4, 8), 10); // strip leading zeros
  const denominator = r.slice(0, 4);
  return `${fedDistrict}-${institution}/${denominator}`;
}

// ─── CheckFace component ─────────────────────────────────────────────────────
// Coordinate-based layout — every element placed at exact (X, Y) inches per
// the Certxa Payroll Check Specification v1.0.
// Check size: 8.5" × 3.667"  (standard business payroll check stock)

function CheckFace({
  checkNumber, date, payee, payeeStreet, payeeCityStateZip,
  amount, memo, periodStart, periodEnd,
  store, routing, account, isPrint = false,
  bankName, bankAddress, bankCity, bankPhone, paperType = "standard",
}: {
  checkNumber: string; date: string; payee: string;
  payeeStreet?: string | null; payeeCityStateZip?: string | null;
  amount: number;
  memo?: string | null; periodStart?: string | null; periodEnd?: string | null;
  store: StoreInfo; routing: string; account: string; isPrint?: boolean;
  bankName?: string; bankAddress?: string; bankCity?: string; bankPhone?: string;
  paperType?: PrintSettings["paperType"];
}) {
  const isPreprinted  = paperType === "preprinted";
  // officeDepotBlue renders identically to standard (same 8.5"×11" sheet,
  // same 3.667" zone height, same security design) — only the calibration
  // slot differs so users can dial in offsets independently per stock.
  const suppressBg   = isPreprinted && isPrint;
  const storeCity    = [store.city, store.state, store.postcode].filter(Boolean).join(", ");
  const micrRouting  = routing.replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
  const micrAccount  = account.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
  // 6-digit check number — matches displayed check number format exactly (ANSI X9.27)
  const micrCheck    = checkNumber.replace(/\D/g, "").padStart(6, "0").slice(-6);
  const fractional   = buildFractional(routing);
  const micrFont     = useMicrFont();
  const writtenAmt   = buildWrittenAmount(amount);
  // Dollar sign lives inside the protected amount string (***$206.93) — commercial standard
  const numericAmt   = `***${fmt$(amount)}`;

  // Resolve physical dimensions from profile table
  const profile    = PAPER_PROFILES[paperType ?? "standard"] ?? PAPER_PROFILES["standard"];
  const checkZoneH = `${profile.checkArea.height}in`;
  // MICR baseline from bottom of check zone — per profile spec
  const micrBottom = `${profile.micrBand.baseline}in`;

  return (
    <div
      className="check-face select-none"
      style={{
        position: "relative",
        // Print: fill the full zone width so coordinates map to physical inches.
        // Screen: fixed width so the preview is true-to-size (scrollable).
        width: isPrint ? "100%" : (isPreprinted ? "8.26in" : "8.5in"),
        // Height from profile table — preprinted is 3.44", all others 3.667"
        height: checkZoneH,
        fontFamily: "Arial, Helvetica, sans-serif",
        // Background logic:
        //   • Print + preprinted → transparent (physical paper provides bg)
        //   • Print + standard  → white (blank check stock)
        //   • Screen (any)      → real check background image
        backgroundColor: suppressBg ? "transparent" : (isPrint ? "#ffffff" : "transparent"),
        backgroundImage: !isPrint ? "url('/check-background.png')" : "none",
        backgroundSize: !isPrint ? "100% 100%" : undefined,
        backgroundRepeat: !isPrint ? "no-repeat" : undefined,
        // No border — perforations on physical check stock provide the visual
        // boundary; on screen the background image is the visual boundary.
        border: "none",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Shift all check text down 10px */}
      <div style={{ position: "absolute", inset: 0, transform: "translateY(10px)" }}>
      {/* ════════════════════════════════════════════════════════════
          HEADER BAND — three columns: company | bank | check#/date
          ════════════════════════════════════════════════════════════ */}

      {/* Company Name — uppercase bold 13pt
          Window-safe X: 0.65", Y: 0.24" (aligned with bank and check#/date header row) */}
      <div style={{ position: "absolute", left: "0.65in", top: "0.24in", fontWeight: 700, fontSize: "13pt", color: "#111827", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1 }}>
        {store.name}
      </div>

      {/* Company Address — USPS-standard abbreviations, tight under name
          Fixed 3-line block so every check folds identically in window envelope */}
      <div style={{ position: "absolute", left: "0.65in", top: "0.41in", fontSize: "8pt", color: "#374151", lineHeight: 1.55 }}>
        <div style={{ minHeight: "1.2em" }}>{store.address || "\u00A0"}</div>
        <div style={{ minHeight: "1.2em" }}>{storeCity || "\u00A0"}</div>
      </div>

      {/* Bank info — center column, 8pt; tighter leading per commercial check standard */}
      {/* Displays bank name and city/state/ZIP only — no street address or phone */}
      <div style={{ position: "absolute", left: "3.20in", top: "0.24in", fontSize: "8pt", color: "#374151", lineHeight: 1.35 }}>
        <div>{bankName || <span style={{ color: "#374151" }}>Bank Name</span>}</div>
        <div>{bankCity || <span>City, State ZIP</span>}</div>
      </div>

      {/* Check No. + Date — right-anchored; labels lighter so values read first */}
      <div style={{ position: "absolute", right: "calc(0.30in + 10px)", top: "0.24in", color: "#374151", display: "grid", gridTemplateColumns: "auto auto", columnGap: "5px", rowGap: "2px", alignItems: "baseline" }}>
        <span style={{ textTransform: "uppercase", fontSize: "7pt", letterSpacing: "0.4px", whiteSpace: "nowrap", color: "#111827" }}>Check No.</span>
        <span style={{ fontWeight: 700, fontSize: "8pt", whiteSpace: "nowrap", color: "#111827" }}>{checkNumber}</span>
        <span style={{ textTransform: "uppercase", fontSize: "7pt", letterSpacing: "0.4px", whiteSpace: "nowrap", color: "#111827" }}>Check Date</span>
        <span style={{ fontWeight: 700, fontSize: "8pt", whiteSpace: "nowrap", color: "#111827" }}>{fmtDate(date)}</span>
      </div>

      {/* Fractional ABA routing transit — moved closer to the Check No./Date block */}
      <div style={{ position: "absolute", left: "5.55in", top: "0.24in", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "8pt", fontWeight: "normal", color: "#374151", lineHeight: 1.2, textAlign: "center" }}>
        <div>{fractional.split("/")[0]}</div>
        <div style={{ borderTop: "1px solid #374151", marginTop: "2px", paddingTop: "2px" }}>{fractional.split("/")[1]}</div>
      </div>

      {/* ── Shift amount band → MICR down 10px ── */}
      <div style={{ position: "absolute", inset: 0, transform: "translateY(10px)" }}>

      {/* ════════════════════════════════════════════════════════════
          AMOUNT BAND — PAY EXACTLY label + numeric on same row,
          written amount asterisk-padded on next row
          ════════════════════════════════════════════════════════════ */}

      {/* ── AMOUNT BAND ─────────────────────────────────────────────
          Row A (top: 0.86in): 🔒 VOID AFTER 90 DAYS [right]
          Row B (top: 1.08in): PAY EXACTLY [left]  |  $ [box] [right]
          Row C (top: 1.38in): **** written amount **** [full left]
                               DOLLARS [right, under box]
          ────────────────────────────────────────────────────── */}

      {/* 🔒 VOID AFTER 180 DAYS — above PAY EXACTLY row */}
      <div style={{ position: "absolute", right: "calc(0.38in + 12px)", top: "0.86in", fontSize: "7.5pt", color: "#374151", textTransform: "uppercase", letterSpacing: "0.6px", display: "flex", alignItems: "center", gap: "5px" }}>
        <img src="/padlock.png" alt="" style={{ width: "12px", height: "14px", objectFit: "contain", opacity: 0.55 }} />
        <span>Void After 180 Days</span>
      </div>

      {/* "PAY EXACTLY" label — same row as $ box, left side */}
      <div style={{ position: "absolute", left: "0.35in", top: "1.03in", fontSize: "7.5pt", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Pay Exactly
      </div>

      {/* Written amount — extends close to the amount box for tamper resistance */}
      <div style={{ position: "absolute", left: "0.35in", right: "2.30in", top: "1.28in", fontSize: "10pt", color: "#111827", overflow: "hidden", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
        {writtenAmt}
      </div>

      {/* Amount box — dollar sign inside the protected field (***$206.93 standard),
          taller box with vertical centering, extra right padding */}
      <div style={{ position: "absolute", right: "0.38in", top: "1.20in" }}>
        <div style={{ border: "1.5px solid #374151", padding: "7px 18px 7px 12px", fontWeight: 700, fontSize: "10pt", color: "#111827", whiteSpace: "nowrap", minWidth: "1.9in", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontWeight: 700 }}>$</span>
          <span>{numericAmt}</span>
        </div>
      </div>

      {/* DOLLARS — below the amount box */}
      <div style={{ position: "absolute", right: "0.38in", top: "1.60in", fontSize: "6.5pt", color: "#374151", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 700 }}>
        Dollars
      </div>

      {/* ════════════════════════════════════════════════════════════
          PAYEE + SIGNATURE BAND
          Left:  PAY TO THE ORDER OF → employee name → address
          Right: signature line (aligned to name) → labels below
          ════════════════════════════════════════════════════════════ */}

      {/* "PAY TO THE ORDER OF" label — moved up 15px */}
      <div style={{ position: "absolute", left: "0.35in", top: "calc(1.82in - 15px)", fontSize: "7pt", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Pay to the Order of
      </div>

      {/* Payee name + address — single flowing block, moved up 20px.
          Name and address share the same 10pt regular-weight font with no blank
          line between them. Two address lines always reserved so every check folds
          identically and the lower #10 envelope window is always populated.
          Window-safe X: 0.65" (lower envelope window area: X:0.65", Y:2.05") */}
      <div style={{ position: "absolute", left: "0.65in", top: "calc(2.08in - 20px)", fontSize: "10pt", fontWeight: 400, color: "#111827", lineHeight: 1.4 }}>
        <div>{payee}</div>
        <div style={{ minHeight: "1.2em", color: "#374151" }}>{payeeStreet ?? "\u00A0"}</div>
        <div style={{ minHeight: "1.2em", color: "#374151" }}>{payeeCityStateZip ?? "\u00A0"}</div>
      </div>

      {/* Signature line — extended 0.50" longer for commercial standard appearance */}
      <div style={{ position: "absolute", left: "5.20in", right: "0.80in", top: "2.44in", borderBottom: "1.5px solid #111827" }} />

      {/* "AUTHORIZED SIGNATURE" — centered under line, moved down a few points so it
          doesn't crowd the line */}
      <div style={{ position: "absolute", left: "5.20in", right: "0.80in", top: "2.54in", fontSize: "6pt", color: "#374151", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Authorized Signature
      </div>

      {/* MP (Microprint) security badge — adjacent to signature line */}
      <div style={{ position: "absolute", right: "0.38in", top: "2.46in", fontSize: "6pt", color: "#374151", fontWeight: 700, border: "1px solid #9ca3af", borderRadius: "2px", padding: "1px 3px", lineHeight: 1.3, letterSpacing: "0.5px" }}>
        MP
      </div>

      {/* Security border text — repeating strip for fraud/copy protection */}
      <div style={{
        display: "none",
      }}>
      </div>

      </div>{/* end amount→MICR shift */}
      </div>{/* end translateY wrapper */}

      {/* ════════════════════════════════════════════════════════════
          MICR LINE — bottom-anchored, outside all translateY wrappers
          so physical inch coordinates map exactly to the spec.
          ANSI X9.27 business check field order:
            [Routing Transit] → [Account Number] → [Check Serial #]
          ⑈ (U+2448) = On-Us symbol   ⑆ (U+2446) = Transit symbol

          ABA / ANSI X9.27 clear-band spec:
            • Bottom of MICR characters: 3/16" (0.1875") from check bottom edge
            • MICR baseline:             ≈ 0.25" from bottom edge
            • Total clear band height:   0.625" (occupied by the MICR band)
          ════════════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute",
        left: 0,
        right: 0,
        /* 3/16" (0.1875") quiet zone between bottom edge and bottom of glyphs. */
        /* baseline from profile spec — 0.1875" standard, 0.250" Office Depot Blue */
        bottom: micrBottom,
        lineHeight: 1,
        textAlign: "center",
        fontFamily: micrFont.fontFamily,
        /* ANSI X9.27 nominal character height = 0.117".
           Em-square ÷ cap-height ratio ≈ 0.7, so font-size ≈ 0.117/0.7 ≈ 14pt */
        fontSize: "14pt",
        color: "#374151",
        letterSpacing: micrFont.isLoaded ? "0" : "0.1em",
        userSelect: "all",
      }}>
        ⑆{micrRouting}⑆&nbsp;&nbsp;{micrAccount}⑈&nbsp;&nbsp;⑈{micrCheck}⑈
      </div>
    </div>
  );
}

// ─── CheckStub component ──────────────────────────────────────────────────────

function fmtDay(d: string) {
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

/** One row of an earnings/deductions mini-table */
function StubTableRow({
  label, period, ytd, bold = false, topBorder = false,
}: { label: string; period: string; ytd: string; bold?: boolean; topBorder?: boolean }) {
  const base = bold
    ? "flex items-center text-[8px] font-bold text-slate-800"
    : "flex items-center text-[8px] text-slate-600";
  return (
    <div className={cn(base, topBorder && "border-t border-slate-300 pt-0.5 mt-0.5")}>
      <span className="flex-1 leading-tight">{label}</span>
      <span className="w-[52px] text-right font-mono tabular-nums">{period}</span>
      <span className="w-[40px] text-right font-mono tabular-nums text-slate-400">{ytd}</span>
    </div>
  );
}

function CheckStub({
  checkNumber, payee, amount, periodStart, periodEnd,
  earningsRows, label, store, isPrint = false,
  // New: granular earnings data for the redesigned three-column stub
  serviceCommission, tipAmount, appointmentCount, totalRevenue,
  payeeStreet, payeeCityStateZip, payDate,
}: {
  checkNumber: string; payee: string; amount: number;
  periodStart?: string | null; periodEnd?: string | null;
  earningsRows: Array<{ label: string; amount: number | string; sub?: string; indent?: boolean }>;
  label: string; store: StoreInfo; isPrint?: boolean;
  dailyBreakdown?: DailyBreakdownEntry[];
  // Optional extras — passed from payroll tab for richer layout
  serviceCommission?: number;
  tipAmount?: number;
  appointmentCount?: number;
  totalRevenue?: number;
  payeeStreet?: string | null;
  payeeCityStateZip?: string | null;
  payDate?: string | null;
}) {
  // Derive values — fall back to earningsRows when new props not provided
  const svcComm = serviceCommission
    ?? (earningsRows.find(r => r.label === "Commission") ? Number(earningsRows.find(r => r.label === "Commission")!.amount) : 0);
  const tips = tipAmount
    ?? (earningsRows.find(r => r.label === "Tips") ? Number(earningsRows.find(r => r.label === "Tips")!.amount) : 0);
  const grossEarnings = svcComm + tips;
  const totalDeductions = 0; // deduction data not yet in API
  const netPay = amount;

  const avgTicket = (appointmentCount && appointmentCount > 0 && totalRevenue)
    ? Number(totalRevenue) / appointmentCount
    : null;

  const storeAddr = [store.address, [store.city, store.state, store.postcode].filter(Boolean).join(", ")]
    .filter(Boolean).join(" · ");

  return (
    <div
      className={cn("check-stub bg-white relative select-none", isPrint ? "border-0" : "")}
      style={{ minHeight: isPrint ? "3.6in" : "auto", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {/* ── DETACH HERE top bar — screen only, suppressed when printing ── */}
      {!isPrint && (
        <div className="flex items-center gap-2 px-4 py-[3px] bg-slate-100 border-t-2 border-dashed border-slate-400">
          <div className="flex-1 border-t border-dotted border-slate-400" />
          <span className="text-[7px] uppercase tracking-[0.18em] font-bold text-slate-500 whitespace-nowrap">✂ Detach and Retain for Your Records</span>
          <div className="flex-1 border-t border-dotted border-slate-400" />
        </div>
      )}

      {/* ── Full-width header ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-x-3 px-4 pt-2 pb-1.5 border-b-2 border-slate-800">
        {/* Left: business */}
        <div className="flex flex-col gap-[2px]" style={{ marginLeft: "-12px" }}>
          <div className="text-[9.5px] font-bold text-slate-900 uppercase leading-tight tracking-wide">{store.name}</div>
          {storeAddr && <div className="text-[7.5px] text-slate-500 leading-tight">{storeAddr}</div>}
        </div>
        {/* Center: title + metadata */}
        <div className="flex flex-col gap-[2px] text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-800">Earnings Statement</div>
          <div className="text-[7px] text-slate-500">{label}</div>
          {payDate && <div className="text-[7.5px] text-slate-600">Pay Date: <span className="font-semibold">{fmtDate(payDate)}</span></div>}
          {(periodStart || periodEnd) && (
            <div className="text-[7.5px] text-slate-600">Period: <span className="font-semibold">{fmtShort(periodStart)} – {fmtShort(periodEnd)}</span></div>
          )}
          <div className="text-[7.5px] text-slate-600">Check No: <span className="font-mono font-semibold">{checkNumber}</span></div>
        </div>
        {/* Right: employee */}
        <div className="flex flex-col gap-[2px] text-right">
          <div className="text-[9.5px] font-bold text-slate-900 leading-tight">{payee}</div>
          {payeeStreet && <div className="text-[7.5px] text-slate-500 leading-tight">{payeeStreet}</div>}
          {payeeCityStateZip && <div className="text-[7.5px] text-slate-500 leading-tight">{payeeCityStateZip}</div>}
        </div>
      </div>

      {/* ── Three-column body ─────────────────────────────────────── */}
      <div className="grid px-4 pt-1.5 pb-2" style={{ gridTemplateColumns: "1fr 1px 0.72fr" }}>

        {/* ═══ Left: EARNINGS + DEDUCTIONS tables ════════════════════ */}
        <div className="pr-3">
          {/* Column headers */}
          <div className="flex items-center text-[6.5px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">
            <span className="flex-1" />
            <span className="w-[52px] text-right">This Period</span>
            <span className="w-[40px] text-right">YTD</span>
          </div>

          {/* EARNINGS section */}
          <p className="text-[6.5px] uppercase tracking-wide font-bold text-slate-500 bg-slate-100 px-1 py-px mb-0.5">Earnings</p>
          <StubTableRow label="Service Commissions" period={`${fmt$(svcComm)}`} ytd="—" />
          <StubTableRow label="Product Commissions" period="—" ytd="—" />
          <StubTableRow label="Credit Card Tips" period={tips > 0 ? `${fmt$(tips)}` : "—"} ytd="—" />
          <StubTableRow label="Total Gross Earnings" period={`${fmt$(grossEarnings)}`} ytd="—" bold topBorder />

          {/* DEDUCTIONS section */}
          <p className="text-[6.5px] uppercase tracking-wide font-bold text-slate-500 bg-slate-100 px-1 py-px mt-1.5 mb-0.5">Deductions</p>
          <StubTableRow label="Booth Rent" period="—" ytd="—" />
          <StubTableRow label="Product Charges" period="—" ytd="—" />
          <StubTableRow label="Loan Repayment" period="—" ytd="—" />
          <StubTableRow label="Total Deductions" period={`${fmt$(totalDeductions)}`} ytd="—" bold topBorder />
        </div>

        {/* ═══ Vertical divider ══════════════════════════════════════ */}
        <div className="bg-slate-200 self-stretch mx-2" />

        {/* ═══ Right: PAY SUMMARY + PERFORMANCE ══════════════════════ */}
        <div className="pl-3">
          {/* PAY SUMMARY */}
          <p className="text-[6.5px] uppercase tracking-wide font-bold text-slate-500 bg-slate-100 px-1 py-px mb-1">Pay Summary</p>
          <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
            <span>Gross Earnings</span>
            <span className="font-mono tabular-nums">${fmt$(grossEarnings)}</span>
          </div>
          <div className="flex justify-between text-[8px] text-slate-600 mb-1 border-b border-slate-200 pb-1">
            <span>Total Deductions</span>
            <span className="font-mono tabular-nums">${fmt$(totalDeductions)}</span>
          </div>
          {/* NET PAY — hero number */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[7.5px] uppercase tracking-widest font-bold text-slate-700">Net Pay</span>
            <span className="text-[16px] font-bold text-slate-900 font-mono leading-none">${fmt$(netPay)}</span>
          </div>

          {/* PERFORMANCE SUMMARY */}
          {(appointmentCount !== undefined || totalRevenue !== undefined) && (
            <>
              <p className="text-[6.5px] uppercase tracking-wide font-bold text-slate-500 bg-slate-100 px-1 py-px mb-1">Performance</p>
              {appointmentCount !== undefined && (
                <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                  <span>Services Completed</span>
                  <span className="font-mono tabular-nums font-semibold">{appointmentCount}</span>
                </div>
              )}
              {totalRevenue !== undefined && (
                <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                  <span>Total Sales Generated</span>
                  <span className="font-mono tabular-nums">${fmt$(totalRevenue)}</span>
                </div>
              )}
              {avgTicket !== null && (
                <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                  <span>Average Ticket</span>
                  <span className="font-mono tabular-nums">${fmt$(avgTicket)}</span>
                </div>
              )}
            </>
          )}

          {/* Thank-you note */}
          <p className="text-[6.5px] text-slate-400 italic mt-1.5 leading-tight">
            Thank you for your continued service.
          </p>
        </div>
      </div>

      {/* ── DETACH HERE bottom bar — screen only, suppressed when printing ── */}
      {!isPrint && (
        <div className="flex items-center gap-2 px-4 py-[3px] bg-slate-100 border-b-2 border-dashed border-slate-400">
          <div className="flex-1 border-t border-dotted border-slate-400" />
          <span className="text-[7px] uppercase tracking-[0.18em] font-bold text-slate-500 whitespace-nowrap">✂ Detach and Retain for Your Records</span>
          <div className="flex-1 border-t border-dotted border-slate-400" />
        </div>
      )}
    </div>
  );
}

// ─── PrintSheet: one full 8.5×11 sheet with check + stub(s) ──────────────────
// DocuGard 04502 zone layout (check on top):
//   Zone 1 (check):     3.5" — perf at 3.5" from top
//   Zone 2 (voucher 1): 3.5" — perf at 7.0" from top
//   Zone 3 (voucher 2): 4.0" — remainder

// Perforation dash used between zones (border only — height controlled by CSS class)
const PERF_BORDER_STYLE: React.CSSProperties = {
  borderTop: "2px dashed #94a3b8",
};

function PrintSheet({
  checkNumber, date, payee, amount, memo,
  periodStart, periodEnd, store, routing, account,
  earningsRows, stubCount, paperLayout,
  bankName, bankAddress, bankCity, bankPhone,
  payeeStreet, payeeCityStateZip,
  paperType = "standard", dailyBreakdown,
  serviceCommission, tipAmount, appointmentCount, totalRevenue,
}: {
  checkNumber: string; date: string; payee: string; amount: number;
  memo?: string | null; periodStart?: string | null; periodEnd?: string | null;
  store: StoreInfo; routing: string; account: string;
  earningsRows: Array<{ label: string; amount: number | string; sub?: string; indent?: boolean }>;
  stubCount: "one" | "two";
  paperLayout: PaperLayout;
  bankName?: string; bankAddress?: string; bankCity?: string; bankPhone?: string;
  payeeStreet?: string | null; payeeCityStateZip?: string | null;
  paperType?: PrintSettings["paperType"];
  dailyBreakdown?: DailyBreakdownEntry[];
  serviceCommission?: number;
  tipAmount?: number;
  appointmentCount?: number;
  totalRevenue?: number;
}) {
  const checkZone = (
    <div className="print-zone print-zone-check">
      <CheckFace
        checkNumber={checkNumber} date={date} payee={payee} amount={amount}
        memo={memo} periodStart={periodStart} periodEnd={periodEnd}
        store={store} routing={routing} account={account} isPrint
        bankName={bankName} bankAddress={bankAddress} bankCity={bankCity} bankPhone={bankPhone}
        payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
        paperType={paperType}
      />
    </div>
  );
  const stub1Zone = (
    <div className="print-zone print-zone-stub" style={PERF_BORDER_STYLE}>
      <CheckStub
        checkNumber={checkNumber} payee={payee} amount={amount}
        periodStart={periodStart} periodEnd={periodEnd}
        earningsRows={earningsRows} label="Employee Copy" store={store} isPrint
        serviceCommission={serviceCommission} tipAmount={tipAmount}
        appointmentCount={appointmentCount} totalRevenue={totalRevenue}
        payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
        payDate={date}
      />
    </div>
  );
  const stub2Zone = stubCount === "two" ? (
    <div className="print-zone print-zone-stub-last" style={PERF_BORDER_STYLE}>
      <CheckStub
        checkNumber={checkNumber} payee={payee} amount={amount}
        periodStart={periodStart} periodEnd={periodEnd}
        earningsRows={earningsRows} label="Employer Copy" store={store} isPrint
        serviceCommission={serviceCommission} tipAmount={tipAmount}
        appointmentCount={appointmentCount} totalRevenue={totalRevenue}
        payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
        payDate={date}
      />
    </div>
  ) : (
    <div className="print-zone print-zone-blank-last" style={PERF_BORDER_STYLE} />
  );

  const zones: [React.ReactNode, React.ReactNode, React.ReactNode] =
    paperLayout === "top"    ? [checkZone, stub1Zone, stub2Zone]
    : paperLayout === "middle" ? [stub1Zone, checkZone, stub2Zone]
    :                            [stub1Zone, stub2Zone, checkZone];

  return (
    <div className="print-sheet w-full" style={{ pageBreakAfter: "always", position: "relative" }}>
      {zones[0]}{zones[1]}{zones[2]}
    </div>
  );
}

// ─── MailerSheet: final page of a payroll batch print job ────────────────────
// Designed to work with #10 double-window and 8.5"×11" large envelopes.
// Addresses are positioned so they align with envelope windows when folded.
//
// Envelope types:
//   window10 — standard #10 double-window (9.5" × 4.125")
//     Tri-fold: bottom third up, top third down. Corporate return address in
//     top-left window (0.5" × 0.5" on the page). Store delivery in lower window
//     (positioned at ~3.5" from left, ~4.1" from top on page).
//   large8511 — 8.5"×11" large double-window envelope
//     Single fold at center. Addresses positioned for larger window openings.

const MAILER_CSS = `
@media print {
  #payroll-mailer-area {
    display: block !important;
    position: static;
  }
  .mailer-page {
    width: 8.5in;
    min-height: 11in;
    page-break-after: always;
    position: relative;
  }
}
`;

type EnvelopeType = "window10" | "large8511";

function MailerSheet({
  store, corporateAddress, checks, envelopeType, batchId, datePrinted,
}: {
  store: StoreInfo;
  corporateAddress: CorporateAddress;
  checks: Array<{ checkNumber: string; payeeName: string; amount: number }>;
  envelopeType: EnvelopeType;
  batchId?: string;
  datePrinted: string;
}) {
  const deliveryCity = [store.city, store.state, store.postcode].filter(Boolean).join(", ");
  const returnCity = [corporateAddress.city, corporateAddress.state, corporateAddress.zip].filter(Boolean).join(", ");
  const totalAmount = checks.reduce((s, c) => s + c.amount, 0);

  // Address window positions vary by envelope type
  const returnTop  = envelopeType === "large8511" ? "0.6in" : "0.5in";
  const returnLeft = envelopeType === "large8511" ? "0.5in" : "0.3in";
  const delivTop   = envelopeType === "large8511" ? "3.5in" : "4.1in";
  const delivLeft  = envelopeType === "large8511" ? "4.5in" : "3.6in";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MAILER_CSS }} />
      <div id="payroll-mailer-area" className="hidden print:block">
        <div className="mailer-page" style={{ width: "8.5in", minHeight: "11in", position: "relative", fontFamily: "Arial, Helvetica, sans-serif", backgroundColor: "#fff" }}>

          {/* ── RETURN ADDRESS (Corporate) — top-left window zone ── */}
          <div style={{ position: "absolute", top: returnTop, left: returnLeft, width: "3in" }}>
            <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#1e293b", lineHeight: 1.4 }}>
              {corporateAddress.officeName || "Corporate Office"}
            </div>
            {corporateAddress.address1 && (
              <div style={{ fontSize: "8pt", color: "#374151", lineHeight: 1.4 }}>{corporateAddress.address1}</div>
            )}
            {corporateAddress.address2 && (
              <div style={{ fontSize: "8pt", color: "#374151", lineHeight: 1.4 }}>{corporateAddress.address2}</div>
            )}
            {returnCity && (
              <div style={{ fontSize: "8pt", color: "#374151", lineHeight: 1.4 }}>{returnCity}</div>
            )}
          </div>

          {/* ── DELIVERY ADDRESS (Store) — main window zone ── */}
          <div style={{ position: "absolute", top: delivTop, left: delivLeft, width: "3.2in" }}>
            <div style={{ fontSize: "10pt", fontWeight: "bold", color: "#1e293b", lineHeight: 1.5 }}>
              {store.name}
            </div>
            {store.address && (
              <div style={{ fontSize: "10pt", color: "#374151", lineHeight: 1.5 }}>{store.address}</div>
            )}
            {deliveryCity && (
              <div style={{ fontSize: "10pt", color: "#374151", lineHeight: 1.5 }}>{deliveryCity}</div>
            )}
          </div>

          {/* ── HEADER: Certxa branding + title ── */}
          <div style={{ position: "absolute", top: "1.3in", left: "0.6in", right: "0.6in" }}>
            <div style={{ borderBottom: "2px solid #1e293b", paddingBottom: "0.12in", marginBottom: "0.15in" }}>
              <div style={{ fontSize: "7.5pt", letterSpacing: "0.15em", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" as const, marginBottom: "4px" }}>
                CERTXA PAYROLL
              </div>
              <div style={{ fontSize: "18pt", fontWeight: "bold", color: "#0f172a", letterSpacing: "-0.01em" }}>
                Payroll Check Distribution
              </div>
            </div>

            {/* ── Store Info block ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.15in", marginBottom: "0.2in" }}>
              {[
                { label: "Store / Location", value: store.name },
                { label: "Date Printed", value: datePrinted },
                { label: "Payroll Period", value: "See individual checks" },
                { label: "Checks Included", value: String(checks.length) },
                { label: "Total Amount", value: `$${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                ...(batchId ? [{ label: "Batch ID", value: batchId }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: "0.08in" }}>
                  <div style={{ fontSize: "6.5pt", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: "bold", color: "#94a3b8", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontSize: "9.5pt", fontWeight: "bold", color: "#1e293b" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── Employee checklist ── */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
              <div style={{ backgroundColor: "#f8fafc", padding: "0.1in 0.15in", borderBottom: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "7.5pt", textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: "bold", color: "#475569" }}>Payroll Checks Included</span>
              </div>
              <div style={{ padding: "0.08in 0.15in" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "0.6in 1fr 1.1in", gap: "0.1in", padding: "0.05in 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: "6.5pt", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: "bold", color: "#94a3b8" }}>Check #</div>
                  <div style={{ fontSize: "6.5pt", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: "bold", color: "#94a3b8" }}>Employee</div>
                  <div style={{ fontSize: "6.5pt", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: "bold", color: "#94a3b8", textAlign: "right" as const }}>Amount</div>
                </div>
                {checks.map((chk, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "0.6in 1fr 1.1in", gap: "0.1in", padding: "0.05in 0", borderBottom: i < checks.length - 1 ? "1px solid #f8fafc" : "none" }}>
                    <div style={{ fontSize: "8.5pt", fontFamily: "Courier New, monospace", color: "#475569" }}>#{chk.checkNumber}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "#22c55e", fontSize: "9pt" }}>✓</span>
                      <span style={{ fontSize: "8.5pt", fontWeight: "bold", color: "#1e293b" }}>{chk.payeeName}</span>
                    </div>
                    <div style={{ fontSize: "8.5pt", fontFamily: "Courier New, monospace", color: "#475569", textAlign: "right" as const }}>
                      ${chk.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div style={{ display: "grid", gridTemplateColumns: "0.6in 1fr 1.1in", gap: "0.1in", padding: "0.06in 0 0.02in", borderTop: "2px solid #1e293b", marginTop: "0.04in" }}>
                  <div />
                  <div style={{ fontSize: "8.5pt", fontWeight: "bold", color: "#0f172a" }}>Total ({checks.length} check{checks.length !== 1 ? "s" : ""})</div>
                  <div style={{ fontSize: "8.5pt", fontWeight: "bold", fontFamily: "Courier New, monospace", color: "#0f172a", textAlign: "right" as const }}>
                    ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Envelope type hint ── */}
            <div style={{ marginTop: "0.15in", fontSize: "7pt", color: "#94a3b8", fontStyle: "italic" as const }}>
              {envelopeType === "window10"
                ? "Formatted for #10 Double Window Envelope — tri-fold: bottom third up, top third down."
                : "Formatted for 8.5\"×11\" Large Double Window Envelope — fold at center."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── BatchPrintTab ────────────────────────────────────────────────────────────

function BatchPrintTab({ settings }: { settings: PrintSettings }) {
  const paperType = settings.paperType ?? "standard";
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [envelopeType, setEnvelopeType] = useState<EnvelopeType>("window10");
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReprintWarn, setShowReprintWarn] = useState(false);
  const [reprintBatch, setReprintBatch] = useState<PrintBatch | null>(null);
  const [reprintMode, setReprintMode] = useState<"all" | "mailer">("all");
  const [completedBatch, setCompletedBatch] = useState<{ batchId: string; checkCount: number } | null>(null);
  const [hasPrinted, setHasPrinted] = useState(false);

  // ── Corporate address ──────────────────────────────────────────────────────
  const { data: corpAddr, isLoading: corpLoading } = useQuery<CorporateAddress | null>({
    queryKey: ["/api/contractor-payouts/corporate-address"],
    queryFn: async () => {
      const res = await fetch("/api/contractor-payouts/corporate-address", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const defaultCorp: CorporateAddress = { officeName: "", address1: "", address2: "", city: "", state: "", zip: "" };
  const [editingCorp, setEditingCorp] = useState(false);
  const [corpForm, setCorpForm] = useState<CorporateAddress>(defaultCorp);

  useEffect(() => {
    if (corpAddr) setCorpForm(corpAddr);
  }, [corpAddr]);

  const saveCorpAddr = useMutation({
    mutationFn: async (data: CorporateAddress) => {
      const res = await fetch("/api/contractor-payouts/corporate-address", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/corporate-address"] });
      setEditingCorp(false);
      toast({ title: "Corporate address saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save address", variant: "destructive" }),
  });

  // ── Pending checks ─────────────────────────────────────────────────────────
  const { data: allChecks = [], isLoading: checksLoading } = useQuery<ContractorCheck[]>({
    queryKey: ["/api/contractor-payouts/checks", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/checks?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const pendingChecks = allChecks.filter(c => c.printStatus === "queued" && c.voidStatus === "active");

  // ── Prior batches ──────────────────────────────────────────────────────────
  const { data: batches = [] } = useQuery<PrintBatch[]>({
    queryKey: ["/api/contractor-payouts/print-batches", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/print-batches?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  // Pre-select all pending checks on first load
  useEffect(() => {
    if (pendingChecks.length > 0 && selectedCheckIds.size === 0) {
      setSelectedCheckIds(new Set(pendingChecks.map(c => c.id)));
    }
  }, [pendingChecks.length]);

  const selectedChecks = pendingChecks.filter(c => selectedCheckIds.has(c.id));
  const totalAmount = selectedChecks.reduce((s, c) => s + Number(c.amount), 0);

  const storeInfo: StoreInfo = {
    name: selectedStore?.name ?? "",
    address: (selectedStore as any)?.address,
    city: (selectedStore as any)?.city,
    state: (selectedStore as any)?.state,
    postcode: (selectedStore as any)?.postcode,
    phone: (selectedStore as any)?.phone,
  };

  // ── Record batch mutation ──────────────────────────────────────────────────
  const recordBatch = useMutation({
    mutationFn: async ({ isReprint, existingBatchId }: { isReprint?: boolean; existingBatchId?: string }) => {
      const checksData = selectedChecks.map((c, i) => ({
        checkNumber: String(c.checkNumber),
        payeeName: c.payeeName,
        amount: Number(c.amount),
      }));
      const res = await fetch("/api/contractor-payouts/print-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkCount: checksData.length,
          totalAmount,
          envelopeType,
          checksData,
          mailerPrinted: true,
          isReprint: !!isReprint,
          existingBatchId,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<PrintBatch>;
    },
    onSuccess: (batch) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/print-batches", selectedStore?.id] });
      setCompletedBatch({ batchId: batch.batchId, checkCount: selectedChecks.length });
      setShowConfirm(true);
      setShowReprintWarn(false);
      setHasPrinted(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to record batch", variant: "destructive" }),
  });

  // ── Print handler ──────────────────────────────────────────────────────────
  function handlePrintBatch() {
    if (selectedChecks.length === 0) {
      toast({ title: "No checks selected", description: "Select at least one check to print.", variant: "destructive" });
      return;
    }
    const corpFilled = corpForm.officeName || corpForm.address1;
    if (!corpFilled) {
      toast({ title: "Corporate address missing", description: "Add a corporate office address in the settings below before printing.", variant: "destructive" });
      return;
    }
    window.print();
    // After print dialog closes, record the batch
    setTimeout(() => {
      setHasPrinted(true);
      recordBatch.mutate({});
    }, 1000);
  }

  function handleReprintConfirm() {
    if (reprintMode === "mailer") {
      // Print mailer only (checks not re-rendered in print area)
      window.print();
      setTimeout(() => {
        if (reprintBatch) recordBatch.mutate({ isReprint: true, existingBatchId: reprintBatch.batchId });
      }, 1000);
    } else {
      window.print();
      setTimeout(() => {
        if (reprintBatch) recordBatch.mutate({ isReprint: true, existingBatchId: reprintBatch.batchId });
      }, 1000);
    }
    setShowReprintWarn(false);
  }

  const hasNoCorp = !corpAddr && !corpLoading;
  const hasMissingStore = !storeInfo.address && !storeInfo.city;
  const corp = corpForm;
  const datePrinted = format(new Date(), "MMMM d, yyyy 'at' h:mm a");
  const checksForMailer = selectedChecks.map(c => ({
    checkNumber: String(c.checkNumber),
    payeeName: c.payeeName,
    amount: Number(c.amount),
  }));

  // Desktop indicator
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  return (
    <div className="space-y-6">

      {/* ── Mobile/tablet info banner ─────────────────────────────────────── */}
      {isMobile && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <Printer className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Desktop printer recommended</p>
            <p className="text-xs text-blue-700 mt-0.5">You can review and select checks here, but for best results print from a desktop computer connected to your printer.</p>
          </div>
        </div>
      )}

      {/* ── Warning banners ───────────────────────────────────────────────── */}
      {hasNoCorp && !editingCorp && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Corporate address not set</p>
            <p className="text-xs text-amber-700 mt-0.5">The corporate return address is required for the mailer sheet.</p>
          </div>
          <Button size="sm" onClick={() => setEditingCorp(true)} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0">
            Add Address
          </Button>
        </div>
      )}

      {hasMissingStore && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>Store address incomplete.</strong> Update your store address in Store Settings so the delivery window shows correctly on the mailer.
          </p>
        </div>
      )}

      {/* ── Corporate Office Address Card ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Corporate Office (Return Address)</p>
          </div>
          {!editingCorp && (
            <Button size="sm" variant="outline" onClick={() => setEditingCorp(true)} className="rounded-lg text-xs h-7">
              {corpAddr ? "Edit" : "Add"}
            </Button>
          )}
        </div>

        {editingCorp ? (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">Office Name</label>
                <Input value={corpForm.officeName} onChange={e => setCorpForm(f => ({ ...f, officeName: e.target.value }))} placeholder="Acme Corp Corporate HQ" className="h-8 text-sm rounded-xl border-slate-200" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">Address Line 1</label>
                <Input value={corpForm.address1} onChange={e => setCorpForm(f => ({ ...f, address1: e.target.value }))} placeholder="1234 Corporate Blvd" className="h-8 text-sm rounded-xl border-slate-200" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">Address Line 2</label>
                <Input value={corpForm.address2} onChange={e => setCorpForm(f => ({ ...f, address2: e.target.value }))} placeholder="Suite 200 (optional)" className="h-8 text-sm rounded-xl border-slate-200" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">City</label>
                <Input value={corpForm.city} onChange={e => setCorpForm(f => ({ ...f, city: e.target.value }))} placeholder="Denver" className="h-8 text-sm rounded-xl border-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">State</label>
                  <Input value={corpForm.state} onChange={e => setCorpForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="CO" className="h-8 text-sm rounded-xl border-slate-200" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">ZIP</label>
                  <Input value={corpForm.zip} onChange={e => setCorpForm(f => ({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="80201" className="h-8 text-sm rounded-xl border-slate-200" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setEditingCorp(false); if (corpAddr) setCorpForm(corpAddr); }} className="rounded-xl text-sm">Cancel</Button>
              <Button onClick={() => saveCorpAddr.mutate(corpForm)} disabled={saveCorpAddr.isPending} className="rounded-xl bg-slate-800 hover:bg-slate-700 text-sm gap-2">
                {saveCorpAddr.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Save Address"}
              </Button>
            </div>
          </div>
        ) : corpAddr ? (
          <div className="p-5">
            <div className="text-sm font-semibold text-slate-800">{corpAddr.officeName}</div>
            <div className="text-sm text-slate-500 mt-0.5">{corpAddr.address1}{corpAddr.address2 ? `, ${corpAddr.address2}` : ""}</div>
            <div className="text-sm text-slate-500">{[corpAddr.city, corpAddr.state, corpAddr.zip].filter(Boolean).join(", ")}</div>
          </div>
        ) : (
          <div className="p-5 text-center py-8">
            <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No corporate address saved yet</p>
            <p className="text-xs text-slate-400 mt-1">This address appears as the return address on payroll mailer sheets.</p>
          </div>
        )}
      </div>

      {/* ── Envelope type selector ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-500" />
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Envelope Template</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              value: "window10" as EnvelopeType,
              label: "#10 Double Window Envelope",
              sub: "9.5\" × 4.125\" · Standard business letter · Tri-fold",
              detail: "Return address aligns with top-left window. Store delivery address aligns with main lower window.",
            },
            {
              value: "large8511" as EnvelopeType,
              label: "8.5\" × 11\" Large Envelope",
              sub: "Large format with double windows · Single-fold",
              detail: "Larger address windows. Return address top-left, delivery address center-right.",
            },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setEnvelopeType(opt.value)}
              className={cn(
                "text-left p-4 rounded-2xl border-2 transition-all",
                envelopeType === opt.value
                  ? "border-slate-800 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {envelopeType === opt.value
                  ? <CheckSquare className="w-4 h-4 text-slate-800 shrink-0" />
                  : <Square className="w-4 h-4 text-slate-300 shrink-0" />
                }
                <span className="font-semibold text-sm text-slate-800">{opt.label}</span>
              </div>
              <p className="text-xs text-slate-500 mb-1 pl-6">{opt.sub}</p>
              <p className="text-xs text-slate-400 pl-6 leading-relaxed">{opt.detail}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Pending checks selector ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Pending Checks ({pendingChecks.length})
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelectedCheckIds(new Set(pendingChecks.map(c => c.id)))} className="text-xs text-slate-500 hover:text-slate-700 underline">Select all</button>
            <span className="text-slate-300">·</span>
            <button onClick={() => setSelectedCheckIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 underline">Deselect all</button>
          </div>
        </div>

        {checksLoading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : pendingChecks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-500 font-medium">No pending checks</p>
            <p className="text-xs text-slate-400 mt-1">All contractor checks have been printed, or no checks have been issued yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pendingChecks.map(chk => {
              const isSelected = selectedCheckIds.has(chk.id);
              return (
                <button
                  key={chk.id}
                  onClick={() => setSelectedCheckIds(prev => {
                    const next = new Set(prev);
                    if (next.has(chk.id)) next.delete(chk.id); else next.add(chk.id);
                    return next;
                  })}
                  className={cn("w-full text-left px-5 py-3.5 flex items-center gap-3 transition-colors", isSelected ? "bg-slate-50/70" : "hover:bg-slate-50/30")}
                >
                  {isSelected
                    ? <CheckSquare className="w-4 h-4 text-slate-800 shrink-0" />
                    : <Square className="w-4 h-4 text-slate-300 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-sm text-slate-800">{chk.payeeName}</span>
                      <span className="font-semibold text-sm text-slate-900 font-mono shrink-0">${fmt$(chk.amount)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-400 font-mono">#{chk.checkNumber}</span>
                      {chk.periodStart && <span className="text-xs text-slate-400">{fmtShort(chk.periodStart)} – {fmtShort(chk.periodEnd)}</span>}
                      {chk.memo && <span className="text-xs text-slate-400 truncate">{chk.memo}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Summary footer */}
        {pendingChecks.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">{selectedCheckIds.size} of {pendingChecks.length} selected</span>
            <span className="text-sm font-bold text-slate-800 font-mono">${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      {/* ── Batch summary + print button ──────────────────────────────────── */}
      {selectedChecks.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-white font-semibold">Batch Ready to Print</p>
            <p className="text-slate-300 text-sm mt-1">
              {selectedChecks.length} check{selectedChecks.length !== 1 ? "s" : ""}  ·  ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} total  ·  Mailer sheet included
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Print order: {selectedChecks.map(c => c.payeeName.split(" ")[0]).join(", ")} → Mailer Sheet
            </p>
          </div>
          <Button
            onClick={handlePrintBatch}
            disabled={recordBatch.isPending || !corpAddr}
            className="rounded-xl bg-white text-slate-800 hover:bg-slate-100 gap-2 font-semibold shrink-0"
          >
            <Layers className="w-4 h-4" />
            Print Payroll Batch
          </Button>
        </div>
      )}

      {/* ── Print area — portaled to body ─────────────────────────────────── */}
      {selectedChecks.length > 0 && createPortal(
        <>
          <div id="check-print-area" className="hidden print:block">
            {selectedChecks.map((chk, idx) => (
              <PrintSheet
                key={chk.id}
                checkNumber={String(chk.checkNumber).padStart(6, "0")}
                date={chk.issuedAt}
                payee={chk.payeeName}
                amount={Number(chk.amount)}
                memo={chk.memo}
                periodStart={chk.periodStart}
                periodEnd={chk.periodEnd}
                store={storeInfo}
                routing={settings.routingNumber}
                account={settings.accountNumber}
                earningsRows={[{ label: "Contractor Pay", amount: Number(chk.amount) }]}
                stubCount={settings.stubCount}
                paperLayout={activeCalibration(settings).paperLayout}
                bankName={settings.bankName}
                bankAddress={settings.bankAddress}
                bankCity={settings.bankCity}
                bankPhone={settings.bankPhone}
                payeeStreet={[chk.mailingAddress1, chk.mailingAddress2].filter(Boolean).join(", ") || null}
                payeeCityStateZip={[chk.mailingCity, chk.mailingState, chk.mailingZip].filter(Boolean).join(", ") || null}
                paperType={paperType}
              />
            ))}
          </div>
          <MailerSheet
            store={storeInfo}
            corporateAddress={corpForm}
            checks={checksForMailer}
            envelopeType={envelopeType}
            datePrinted={datePrinted}
          />
        </>,
        document.body
      )}

      {/* ── Prior batch history ───────────────────────────────────────────── */}
      {batches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Recent Print Batches</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Batch ID</th>
                <th className="text-left px-5 py-3">Checks</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Printed</th>
                <th className="text-left px-5 py-3">Reprinted</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} className="border-t border-slate-50 hover:bg-slate-50/30 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-700 text-xs">{b.batchId}</td>
                  <td className="px-5 py-3 text-slate-600">{b.checkCount}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">${Number(b.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{fmtShort(b.printedAt)}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{b.reprintedAt ? fmtShort(b.reprintedAt) : "—"}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => { setReprintBatch(b); setShowReprintWarn(true); }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Reprint
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reprint Warning dialog ────────────────────────────────────────── */}
      <Dialog open={showReprintWarn} onOpenChange={v => !v && setShowReprintWarn(false)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Already Printed
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-slate-700">
              Batch <strong>{reprintBatch?.batchId}</strong> was printed on{" "}
              <strong>{reprintBatch ? fmtShort(reprintBatch.printedAt) : ""}</strong>.
              Would you like to reprint?
            </p>
            <div className="space-y-2">
              {[
                { value: "all" as const, label: "Reprint checks + mailer sheet", sub: "Full batch reprint" },
                { value: "mailer" as const, label: "Reprint mailer sheet only", sub: "Checks only — no individual check sheets" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setReprintMode(opt.value)}
                  className={cn("w-full text-left p-3 rounded-xl border-2 transition-all text-sm", reprintMode === opt.value ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:border-slate-300")}
                >
                  <div className="font-semibold text-slate-800">{opt.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReprintWarn(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleReprintConfirm} className="rounded-xl bg-slate-800 hover:bg-slate-700 gap-2">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Confirmation dialog ─────────────────────────────────────── */}
      <Dialog open={showConfirm} onOpenChange={v => !v && setShowConfirm(false)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Payroll Batch Completed
            </DialogTitle>
          </DialogHeader>
          {completedBatch && (
            <div className="py-2 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Store", value: selectedStore?.name ?? "—" },
                  { label: "Checks Printed", value: String(completedBatch.checkCount) },
                  { label: "Mailer Sheet", value: "Yes" },
                  { label: "Batch ID", value: completedBatch.batchId },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">{label}</div>
                    <div className="font-semibold text-slate-800 text-sm font-mono">{value}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                This batch has been recorded in your payroll history. The included checks have been marked as printed.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowConfirm(false)} className="rounded-xl bg-slate-800 hover:bg-slate-700 w-full">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function SettingsLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">{children}</label>;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function SettingsPanel({
  settings, onChange,
}: {
  settings: PrintSettings;
  onChange: (s: PrintSettings) => void;
}) {
  const [showRouting, setShowRouting] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  return (
    <div className="max-w-2xl space-y-4">

      {/* ── Bank Details ──────────────────────────────────────────────── */}
      <SettingsSection title="Bank Details (printed on check)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <SettingsLabel>Bank Name</SettingsLabel>
            <Input
              value={settings.bankName}
              onChange={e => onChange({ ...settings, bankName: e.target.value })}
              placeholder="First National Bank"
              className="h-8 text-sm rounded-xl border-slate-200"
            />
          </div>
          <div>
            <SettingsLabel>Bank City, State ZIP</SettingsLabel>
            <Input
              value={settings.bankCity}
              onChange={e => onChange({ ...settings, bankCity: e.target.value })}
              placeholder="Denver, CO 80202"
              className="h-8 text-sm rounded-xl border-slate-200"
            />
          </div>
        </div>
      </SettingsSection>

      {/* ── Draw Account ──────────────────────────────────────────────── */}
      <SettingsSection title="Draw Account Details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <SettingsLabel>Account Holder Name</SettingsLabel>
            <Input
              value={settings.accountHolderName}
              onChange={e => onChange({ ...settings, accountHolderName: e.target.value })}
              placeholder="Salon legal entity or owner name"
              className="h-8 text-sm rounded-xl border-slate-200"
            />
          </div>
          <div>
            <SettingsLabel>Starting Check Number</SettingsLabel>
            <Input
              type="number" min={1001}
              value={settings.startingCheckNumber}
              onChange={e => onChange({ ...settings, startingCheckNumber: parseInt(e.target.value) || 1001 })}
              className="h-8 text-sm rounded-xl border-slate-200"
            />
          </div>
        </div>
        <div>
          <SettingsLabel>Account Address</SettingsLabel>
          <Input
            value={settings.accountAddress}
            onChange={e => onChange({ ...settings, accountAddress: e.target.value })}
            placeholder="Address checks are drawn from"
            className="h-8 text-sm rounded-xl border-slate-200"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <SettingsLabel>Routing Number</SettingsLabel>
            <div className="relative">
              <Input
                type={showRouting ? "text" : "password"}
                value={settings.routingNumber}
                onChange={e => onChange({ ...settings, routingNumber: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                placeholder="000000000"
                className="h-8 text-sm rounded-xl border-slate-200 font-mono pr-8"
              />
              <button type="button" onClick={() => setShowRouting(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showRouting ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <SettingsLabel>Account Number</SettingsLabel>
            <div className="relative">
              <Input
                type={showAccount ? "text" : "password"}
                value={settings.accountNumber}
                onChange={e => onChange({ ...settings, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 17) })}
                placeholder="••••••••••"
                className="h-8 text-sm rounded-xl border-slate-200 font-mono pr-8"
              />
              <button type="button" onClick={() => setShowAccount(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showAccount ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Masked in UI — last 4 digits shown on stubs</p>
          </div>
        </div>
      </SettingsSection>

      {/* ── Print options ─────────────────────────────────────────────── */}
      <SettingsSection title="Print Options">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <SettingsLabel>Stubs per Check</SettingsLabel>
            <Select value={settings.stubCount} onValueChange={v => onChange({ ...settings, stubCount: v as "one" | "two" })}>
              <SelectTrigger className="h-8 text-sm rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="one">1 stub (employee copy)</SelectItem>
                <SelectItem value="two">2 stubs (employee + employer)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <SettingsLabel>Check Paper Type</SettingsLabel>
            <Select value={settings.paperType ?? "standard"} onValueChange={v => onChange({ ...settings, paperType: v as PrintSettings["paperType"] })}>
              <SelectTrigger className="h-8 text-sm rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="standard">Standard blank stock (DocuGard, 8.5"×11")</SelectItem>
                <SelectItem value="officeDepotBlue">Office Depot Standard Blue #637540 (8.5"×11")</SelectItem>
                <SelectItem value="preprinted">Pre-printed blue security paper (8.26"×10.76")</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {settings.paperType === "officeDepotBlue" && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] text-indigo-800 leading-relaxed space-y-1">
            <p className="font-semibold">Office Depot Standard Blue selected (Item #637540 / Mfg #9297)</p>
            <p>
              8.5"×11" portrait, three equal 3.667" sections. The renderer prints the full security design
              and all check fields — same output as standard blank stock. This profile has its own
              calibration slot so you can fine-tune offsets independently. MICR baseline: 0.250" from
              bottom edge (ANSI X9.27 spec). Use the <strong>Paper Setup</strong> tab to align.
            </p>
          </div>
        )}
        {settings.paperType === "preprinted" && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-800 leading-relaxed space-y-1">
            <p className="font-semibold">Pre-printed blue security paper selected</p>
            <p>
              The printer will output <strong>text and field content only</strong> — the blue marble watermark,
              security border, and "VOID" banner are already on the paper. Page size is set to 8.26"×10.76"
              with check zone 3.44" / stubs 3.44" + 3.88". Use the <strong>Paper Setup</strong> tab to fine-tune
              vertical alignment if needed.
            </p>
          </div>
        )}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Routing and account numbers appear in the MICR line on printed checks and are stored locally on this device only. Sensitive fields are never sent to a third party.
        </p>
      </SettingsSection>
    </div>
  );
}

// ─── Print CSS (dynamic — inlines calibration offsets) ───────────────────────
// DocuGard 04502 perforation layout:
//   Perf 1 at 3.667" from top → zone 1 (check) height = 3.667"
//   Perf 2 at 7.334" from top → zone 2 (voucher 1) height = 3.667"
//   Remaining 3.666"          → zone 3 (voucher 2) height = 3.666"

function buildPrintCss(cal: CalibrationSettings, paperType: PrintSettings["paperType"] = "standard"): string {
  const topM   = cal.topOffsetIn >= 0 ? cal.topOffsetIn : 0;
  const topNeg = cal.topOffsetIn < 0  ? cal.topOffsetIn : 0;

  const isPreprinted    = paperType === "preprinted";
  // officeDepotBlue uses same page/zone dimensions as standard (8.5"×11", 3×3.667")
  // but gets its own CSS block so future stock-specific tweaks are isolated.
  const isOfficeDepot   = paperType === "officeDepotBlue";

  // Resolve page and zone sizes from the PAPER_PROFILES table so all profiles
  // stay in sync with a single source of truth in checkLayout.ts.
  const profile  = PAPER_PROFILES[paperType] ?? PAPER_PROFILES["standard"];
  const pageW    = profile.paperWidth;
  const pageH    = profile.paperHeight;
  const checkH   = profile.checkArea.height;
  const stub1H   = profile.checkArea.stub1Height;
  const stub2H   = profile.checkArea.stub2Height;

  // Standard / Office Depot Blue: check zone has NO padding — the coordinate-
  // based CheckFace positions every element at absolute inch coordinates
  // internally (X:0.35" etc) so any padding here would double-count margins.
  // Pre-printed paper retains tight padding to clear the pre-printed border.
  const checkPad = isPreprinted ? "0.15in 0.28in 0.04in" : "0";
  const stubPad  = isPreprinted ? "0.08in 0.28in 0.05in" : "0.08in 0.35in 0.05in";

  // Page left margin: standard/officeDepotBlue use 0 (CheckFace coordinates
  // already provide the internal left margin via X:0.35").  Pre-printed paper
  // keeps the 0.5" base for alignment with the security paper's printed border.
  const leftM = isPreprinted ? 0.5 + cal.leftOffsetIn : cal.leftOffsetIn;
  void isOfficeDepot; // same path as standard; variable kept for future use

  return `
@media print {
  body > * { display: none !important; }

  body:not(.printing-calibration) #check-print-area {
    display: block !important;
    position: static;
    margin-top: ${topNeg}in;
  }

  body.printing-calibration #calibration-print-area { display: block !important; }

  @page {
    size: ${pageW}in ${pageH}in;
    margin: ${topM}in 0in 0in ${leftM}in;
  }

  /* Zone heights adapt to paper type */
  .print-zone {
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .print-zone-check     { height: ${checkH}in; padding: ${checkPad}; }
  .print-zone-stub      { height: ${stub1H}in; padding: ${stubPad}; }
  .print-zone-stub-last { height: ${stub2H}in; padding: ${stubPad}; }
  .print-zone-blank     { height: ${stub1H}in; }
  .print-zone-blank-last{ height: ${stub2H}in; }

  .print-sheet { display: block; page-break-after: always; width: 100%; }
  .print-sheet:last-child { page-break-after: avoid; }
  /* Standard paper: light border so check zone is visible on blank stock.
     Pre-printed paper: transparent so the security-paper background shows. */
  .check-face {
    ${isPreprinted
      ? "border: none !important; background: transparent !important;"
      : "border: none !important;"}
    min-height: 0 !important;
    width: 100% !important;
  }
  .check-stub  { border: none !important; min-height: 0 !important; }
  .print\\:hidden { display: none !important; }
}
`;
}

// ─── Payroll Checks tab ───────────────────────────────────────────────────────

function PayrollChecksTab({ settings }: { settings: PrintSettings }) {
  const paperType = settings.paperType ?? "standard";
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const { data: runs = [], isLoading: runsLoading } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll-runs", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const res = await fetch(`/api/payroll-runs?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!storeId,
  });

  const { data: checkData, isLoading: checksLoading } = useQuery<CheckData>({
    queryKey: ["/api/payroll-runs", selectedRunId, "checks"],
    queryFn: async () => {
      const res = await fetch(`/api/payroll-runs/${selectedRunId}/checks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const finalizedRuns = runs.filter(r => r.status === "finalized");
  const visibleItems = checkData
    ? (selectedItemId ? checkData.items.filter(i => i.id === selectedItemId) : checkData.items)
    : [];

  function buildEarningsRows(item: PayrollCheckItem) {
    const rows: Array<{ label: string; amount: number; sub?: string; indent?: boolean }> = [
      {
        label: "Commission",
        amount: Number(item.commissionAmount),
        sub: `${Number(item.commissionRate).toFixed(0)}% × ${fmt$(item.totalRevenue)} · ${item.appointmentCount} appt${item.appointmentCount !== 1 ? "s" : ""}`,
      },
      { label: "Services Revenue", amount: Number(item.serviceRevenue), indent: true },
      { label: "Add-on Revenue",   amount: Number(item.addonRevenue),   indent: true },
    ];
    if (item.tipsAmount > 0) rows.push({ label: "Tips", amount: item.tipsAmount });
    if (item.hoursWorked > 0) rows.push({ label: "Hours Worked", amount: 0, sub: `${item.hoursWorked.toFixed(1)} hrs` });
    return rows;
  }

  function handlePrint(itemId?: number) {
    if (!checkData) return;
    const item = itemId ? checkData.items.find(i => i.id === itemId) : null;
    const prev = document.title;
    document.title = item
      ? `Paycheck – ${item.staffName} – ${fmtShort(checkData.run.periodEnd)}`
      : `Paychecks – ${checkData.store.name} – ${fmtShort(checkData.run.periodEnd)}`;
    window.print();
    document.title = prev;
  }

  const storeInfo: StoreInfo = checkData?.store ?? { name: selectedStore?.name ?? "" };

  return (
    <div className="flex gap-6">
      {/* Left: run selector */}
      <div className="w-64 shrink-0 space-y-2">
        <h3 className="text-[11px] uppercase tracking-widest font-bold text-slate-400 px-1">Finalized Runs</h3>
        {runsLoading && <p className="text-sm text-slate-400 px-1">Loading…</p>}
        {!runsLoading && finalizedRuns.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center space-y-2">
            <CheckCircle2 className="w-7 h-7 text-slate-200 mx-auto" />
            <p className="text-sm text-slate-500 font-medium">No finalized runs</p>
            <p className="text-xs text-slate-400">Finalize an earnings run first.</p>
          </div>
        )}
        {finalizedRuns.map(run => (
          <button
            key={run.id}
            onClick={() => { setSelectedRunId(run.id); setSelectedItemId(null); }}
            className={cn(
              "w-full text-left p-4 rounded-2xl border transition-all",
              selectedRunId === run.id
                ? "bg-slate-800 border-slate-800 text-white"
                : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <p className={cn("text-[10px] font-bold uppercase tracking-wide", selectedRunId === run.id ? "text-slate-300" : "text-slate-400")}>Pay Period</p>
              <ChevronRight className={cn("w-3 h-3", selectedRunId === run.id ? "text-slate-300" : "text-slate-400")} />
            </div>
            <p className={cn("font-semibold text-sm", selectedRunId === run.id ? "text-white" : "text-slate-800")}>
              {fmtShort(run.periodStart)} – {fmtShort(run.periodEnd)}
            </p>
            <p className={cn("text-xs mt-1", selectedRunId === run.id ? "text-slate-300" : "text-slate-500")}>
              {run.contractorCount} staff · {fmt$(run.totalCommission)}
            </p>
          </button>
        ))}
      </div>

      {/* Right: check previews */}
      <div className="flex-1 min-w-0 space-y-4">
        {!selectedRunId && (() => {
          // Build synthetic 14-day daily breakdown for sample preview
          const sampleAmounts = [125, 0, 87.50, 210, 155, 0, 72, 198, 0, 143, 220, 0, 88, 160];
          const periodEndMs = Date.now();
          const periodStartMs = periodEndMs - 13 * 864e5;
          const sampleDaily: DailyBreakdownEntry[] = sampleAmounts.map((amt, i) => {
            const d = new Date(periodStartMs + i * 864e5);
            return {
              date: d.toISOString().slice(0, 10),
              commission: amt,
              tips: 0,
              count: amt > 0 ? 3 : 0,
            };
          });
          const sampleStore = selectedStore
            ? { name: selectedStore.name, address: (selectedStore as any).address, city: (selectedStore as any).city, state: (selectedStore as any).state, postcode: (selectedStore as any).postcode, phone: (selectedStore as any).phone }
            : { name: "Acme Supplies Corp.", address: "475 Knapp Avenue", city: "Anytown", state: "USA", postcode: "10101" };
          const sampleTotal = sampleAmounts.reduce((s, a) => s + a, 0);
          return (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 flex items-center gap-2.5">
                <Banknote className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">Sample preview — select a finalized earnings run to print real checks</p>
              </div>
              {/* Check face — scaled to fit without horizontal scroll */}
              <div style={{ overflow: "hidden" }}>
                <div style={{ transform: "scale(0.8)", transformOrigin: "top left", width: "125%", height: "calc(3.667in * 0.8)" }}>
                  <CheckFace
                    checkNumber="000001"
                    date={new Date().toISOString()}
                    payee="Jane Lee Dow"
                    payeeStreet="123 Main Street"
                    payeeCityStateZip="Anytown, IN 12343"
                    amount={sampleTotal}
                    memo={null}
                    periodStart={new Date(periodStartMs).toISOString()}
                    periodEnd={new Date(periodEndMs).toISOString()}
                    store={sampleStore}
                    routing={settings.routingNumber || "122000496"}
                    account={settings.accountNumber || "4964040110"}
                    bankName={settings.bankName}
                    bankAddress={settings.bankAddress}
                    bankCity={settings.bankCity}
                    bankPhone={settings.bankPhone}
                    paperType={paperType}
                  />
                </div>
              </div>
              {/* Sample earnings stub — shows the redesigned three-column layout */}
              <CheckStub
                checkNumber="000001"
                payee="Jane Lee Dow"
                amount={sampleTotal}
                periodStart={new Date(periodStartMs).toISOString()}
                periodEnd={new Date(periodEndMs).toISOString()}
                earningsRows={[]}
                label="Employee Copy"
                store={sampleStore}
                serviceCommission={sampleTotal * 0.85}
                tipAmount={sampleTotal * 0.15}
                appointmentCount={18}
                totalRevenue={sampleTotal * 2}
                payeeStreet="123 Main Street"
                payeeCityStateZip="Anytown, IN 12343"
                payDate={new Date().toISOString()}
              />
            </div>
          );
        })()}

        {selectedRunId && checksLoading && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100">
            <Clock className="w-8 h-8 text-slate-200 animate-spin" />
            <p className="text-sm">Loading checks…</p>
          </div>
        )}

        {checkData && !checksLoading && (
          <>
            {/* Staff filter + print all */}
            <div className="flex items-center gap-2 flex-wrap">
              {checkData.items.length > 1 && (
                <button
                  onClick={() => setSelectedItemId(null)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors font-medium",
                    !selectedItemId ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  <User className="w-3.5 h-3.5" /> All ({checkData.items.length})
                </button>
              )}
              {checkData.items.map(item => (
                <button key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm border transition-colors",
                    selectedItemId === item.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {item.staffName}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                {visibleItems.length === 1 && (
                  <Suspense fallback={null}>
                    <CheckPDFDownload
                      checkNumber={String(settings.startingCheckNumber).padStart(6, "0")}
                      date={checkData!.run.finalizedAt ?? checkData!.run.createdAt}
                      payee={visibleItems[0].staffName}
                      amount={visibleItems[0].totalPay}
                      periodStart={checkData!.run.periodStart}
                      periodEnd={checkData!.run.periodEnd}
                      store={storeInfo}
                      routing={settings.routingNumber}
                      account={settings.accountNumber}
                      bankName={settings.bankName}
                      bankAddress={settings.bankAddress}
                      bankCity={settings.bankCity}
                      bankPhone={settings.bankPhone}
                      earningsRows={buildEarningsRows(visibleItems[0])}
                      stubCount={settings.stubCount}
                      dailyBreakdown={visibleItems[0].dailyBreakdown}
                    />
                  </Suspense>
                )}
                <Button onClick={() => handlePrint(selectedItemId ?? undefined)} className="gap-2 bg-slate-800 hover:bg-slate-700">
                  <Printer className="w-4 h-4" />
                  Print {visibleItems.length > 1 ? `All ${visibleItems.length}` : "Check"}
                </Button>
              </div>
            </div>

            {/* Print area — portaled to document.body so it is a direct body child.
                body > * { display:none } hides #root; a descendant can never
                override that, so the element MUST be a body-level sibling. */}
            {createPortal(
              <div id="check-print-area" className="hidden print:block">
                {visibleItems.map((item, idx) => (
                  <PrintSheet
                    key={item.id}
                    checkNumber={String(settings.startingCheckNumber + idx).padStart(6, "0")}
                    date={checkData.run.finalizedAt ?? checkData.run.createdAt}
                    payee={item.staffName}
                    amount={item.totalPay}
                    periodStart={checkData.run.periodStart}
                    periodEnd={checkData.run.periodEnd}
                    store={storeInfo}
                    routing={settings.routingNumber}
                    account={settings.accountNumber}
                    earningsRows={buildEarningsRows(item)}
                    stubCount={settings.stubCount}
                    paperLayout={activeCalibration(settings).paperLayout}
                    bankName={settings.bankName}
                    bankAddress={settings.bankAddress}
                    bankCity={settings.bankCity}
                    bankPhone={settings.bankPhone}
                    paperType={paperType}
                    serviceCommission={Number(item.commissionAmount)}
                    tipAmount={item.tipsAmount}
                    appointmentCount={item.appointmentCount}
                    totalRevenue={Number(item.totalRevenue)}
                  />
                ))}
              </div>,
              document.body
            )}

            {/* Screen preview */}
            <div className="space-y-8">
              {visibleItems.map((item, idx) => {
                const checkNum = String(settings.startingCheckNumber + idx).padStart(6, "0");
                return (
                  <div key={item.id} className="relative group" style={{ position: "relative" }}>
                    <div className="overflow-x-auto">
                    <CheckFace
                      checkNumber={checkNum}
                      date={checkData.run.finalizedAt ?? checkData.run.createdAt}
                      payee={item.staffName}
                      amount={item.totalPay}
                      periodStart={checkData.run.periodStart}
                      periodEnd={checkData.run.periodEnd}
                      store={storeInfo}
                      routing={settings.routingNumber}
                      account={settings.accountNumber}
                      bankName={settings.bankName}
                      bankAddress={settings.bankAddress}
                      bankCity={settings.bankCity}
                      bankPhone={settings.bankPhone}
                      paperType={paperType}
                    />
                    </div>
                    <CheckStub
                      checkNumber={checkNum}
                      payee={item.staffName}
                      amount={item.totalPay}
                      periodStart={checkData.run.periodStart}
                      periodEnd={checkData.run.periodEnd}
                      earningsRows={buildEarningsRows(item)}
                      label="Employee Copy"
                      store={storeInfo}
                      serviceCommission={Number(item.commissionAmount)}
                      tipAmount={item.tipsAmount}
                      appointmentCount={item.appointmentCount}
                      totalRevenue={Number(item.totalRevenue)}
                      payDate={checkData.run.finalizedAt ?? checkData.run.createdAt}
                    />
                    {visibleItems.length > 1 && (
                      <div className="print:hidden absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Suspense fallback={null}>
                          <CheckPDFDownload
                            checkNumber={checkNum}
                            date={checkData!.run.finalizedAt ?? checkData!.run.createdAt}
                            payee={item.staffName}
                            amount={item.totalPay}
                            periodStart={checkData!.run.periodStart}
                            periodEnd={checkData!.run.periodEnd}
                            store={storeInfo}
                            routing={settings.routingNumber}
                            account={settings.accountNumber}
                            bankName={settings.bankName}
                            bankAddress={settings.bankAddress}
                            bankCity={settings.bankCity}
                            bankPhone={settings.bankPhone}
                            earningsRows={buildEarningsRows(item)}
                            stubCount={settings.stubCount}
                            dailyBreakdown={item.dailyBreakdown}
                          />
                        </Suspense>
                        <button
                          onClick={() => { setSelectedItemId(item.id); setTimeout(() => handlePrint(item.id), 50); }}
                          className="bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-1.5 text-xs text-slate-600 flex items-center gap-1.5 hover:bg-slate-50"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Contractor Checks tab ────────────────────────────────────────────────────

function ContractorChecksTab({ settings }: { settings: PrintSettings }) {
  const paperType = settings.paperType ?? "standard";
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [printTarget, setPrintTarget] = useState<ContractorCheck | null>(null);
  const [voidTarget, setVoidTarget] = useState<ContractorCheck | null>(null);

  const { data: checks = [], isLoading } = useQuery<ContractorCheck[]>({
    queryKey: ["/api/contractor-payouts/checks", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/checks?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const markPrinted = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/mark-printed`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check marked as printed" });
      setPrintTarget(null);
    },
  });

  const markCleared = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/mark-cleared`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check marked as cleared" });
    },
  });

  const voidCheck = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/checks/${id}/void`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/checks", selectedStore?.id] });
      toast({ title: "Check voided" });
      setVoidTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = checks.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.payeeName.toLowerCase().includes(q) || String(c.checkNumber).includes(q) || (c.memo ?? "").toLowerCase().includes(q);
    const matchS = statusFilter === "all"
      || (statusFilter === "queued"      && c.printStatus === "queued"   && c.voidStatus === "active")
      || (statusFilter === "printed"     && c.printStatus === "printed"  && c.voidStatus === "active")
      || (statusFilter === "outstanding" && c.clearedStatus === "outstanding" && c.voidStatus === "active")
      || (statusFilter === "cleared"     && c.clearedStatus === "cleared")
      || (statusFilter === "voided"      && c.voidStatus === "voided");
    return matchQ && matchS;
  });

  const storeInfo: StoreInfo = { name: selectedStore?.name ?? "", address: (selectedStore as any)?.address, city: (selectedStore as any)?.city, state: (selectedStore as any)?.state, postcode: (selectedStore as any)?.postcode, phone: (selectedStore as any)?.phone };

  function handlePrintCheck(chk: ContractorCheck) {
    const prev = document.title;
    document.title = `Contractor Check #${chk.checkNumber} – ${chk.payeeName}`;
    window.print();
    document.title = prev;
  }

  const queued = checks.filter(c => c.printStatus === "queued" && c.voidStatus === "active").length;
  const outstanding = checks.filter(c => c.clearedStatus === "outstanding" && c.voidStatus === "active").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-5">
      {/* Print-only sheet — portaled to document.body (direct body child).
          The print CSS does body > * { display:none } which hides #root and all
          its descendants; no descendant can override that.  A portal makes this
          div a body sibling so the higher-specificity #check-print-area rule wins. */}
      {printTarget && createPortal(
        <div id="check-print-area" className="hidden print:block">
          <PrintSheet
            checkNumber={String(printTarget.checkNumber).padStart(6, "0")}
            date={printTarget.issuedAt}
            payee={printTarget.payeeName}
            amount={Number(printTarget.amount)}
            memo={printTarget.memo}
            periodStart={printTarget.periodStart}
            periodEnd={printTarget.periodEnd}
            store={storeInfo}
            routing={settings.routingNumber}
            account={settings.accountNumber}
            earningsRows={[
              { label: "Contractor Pay", amount: Number(printTarget.amount) },
              ...(printTarget.memo ? [{ label: printTarget.memo, amount: 0, sub: "" }] : []),
            ]}
            stubCount={settings.stubCount}
            paperLayout={activeCalibration(settings).paperLayout}
            bankName={settings.bankName}
            bankAddress={settings.bankAddress}
            bankCity={settings.bankCity}
            bankPhone={settings.bankPhone}
            payeeStreet={[printTarget.mailingAddress1, printTarget.mailingAddress2].filter(Boolean).join(", ") || null}
            payeeCityStateZip={[printTarget.mailingCity, printTarget.mailingState, printTarget.mailingZip].filter(Boolean).join(", ") || null}
            paperType={paperType}
          />
        </div>,
        document.body
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Issued", value: String(checks.filter(c => c.voidStatus === "active").length), icon: Printer, bg: "bg-slate-50", color: "text-slate-600" },
          { label: "Queued to Print", value: String(queued), icon: Clock, bg: "bg-amber-50", color: "text-amber-600" },
          { label: "Outstanding", value: fmt$(outstanding), icon: Banknote, bg: "bg-teal-50", color: "text-teal-600" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 flex items-center gap-3`}>
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <div className="text-lg font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by payee, check #, memo…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 rounded-xl border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All Checks</SelectItem>
            <SelectItem value="queued">Queued to Print</SelectItem>
            <SelectItem value="printed">Printed</SelectItem>
            <SelectItem value="outstanding">Outstanding</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Printer className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-500">No checks found</p>
            <p className="text-xs text-slate-400 mt-1">Checks are created when contractor payouts use the "Check" method</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3">Check #</th>
                <th className="text-left px-6 py-3">Payee</th>
                <th className="text-left px-6 py-3">Period</th>
                <th className="text-right px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-6 py-3">Print</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(chk => {
                const isVoided = chk.voidStatus === "voided";
                return (
                  <tr key={chk.id} className={cn("border-t border-slate-50 hover:bg-slate-50/30 transition-colors", isVoided && "opacity-50")}>
                    <td className="px-6 py-4 font-mono font-semibold text-slate-700">{chk.checkNumber}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{chk.payeeName}</div>
                      {chk.memo && <div className="text-xs text-slate-400">{chk.memo}</div>}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {chk.periodStart ? `${fmtShort(chk.periodStart)} – ${fmtShort(chk.periodEnd)}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{fmt$(chk.amount)}</td>
                    <td className="px-6 py-4 text-xs text-slate-400">{fmtShort(chk.issuedAt)}</td>
                    <td className="px-6 py-4">
                      {chk.printStatus === "queued" ? (
                        <button
                          onClick={() => setPrintTarget(chk)}
                          className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print Now
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {fmtShort(chk.printedAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isVoided ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">Voided</span>
                      ) : chk.clearedStatus === "cleared" ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Cleared</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600">Outstanding</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!isVoided && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={() => setPrintTarget(chk)}>
                              <Printer className="w-4 h-4 mr-2" /> Print / Preview
                            </DropdownMenuItem>
                            {chk.printStatus === "queued" && (
                              <DropdownMenuItem onClick={() => markPrinted.mutate(chk.id)}>
                                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Printed
                              </DropdownMenuItem>
                            )}
                            {chk.clearedStatus === "outstanding" && (
                              <DropdownMenuItem onClick={() => markCleared.mutate(chk.id)}>
                                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Cleared
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-red-600" onClick={() => setVoidTarget(chk)}>
                              <XCircle className="w-4 h-4 mr-2" /> Void Check
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Print preview modal — wider to show 8.5" check face at a readable scale */}
      <Dialog open={!!printTarget} onOpenChange={v => !v && setPrintTarget(null)}>
        <DialogContent className="max-w-[740px] w-[96vw] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>
              Check Preview — #{printTarget?.checkNumber}
            </DialogTitle>
          </DialogHeader>

          {printTarget && (
            <>
              {/* Check preview — zoomed to fit the dialog without horizontal scroll */}
              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto print:hidden bg-slate-50">
                {/* zoom: 0.82 shrinks the 8.5"-wide check to ~816px×0.82 ≈ 670px */}
                <div style={{ zoom: 0.82, transformOrigin: "top left" }}>
                  <CheckFace
                    checkNumber={String(printTarget.checkNumber).padStart(6, "0")}
                    date={printTarget.issuedAt}
                    payee={printTarget.payeeName}
                    amount={Number(printTarget.amount)}
                    memo={printTarget.memo}
                    periodStart={printTarget.periodStart}
                    periodEnd={printTarget.periodEnd}
                    store={storeInfo}
                    routing={settings.routingNumber}
                    account={settings.accountNumber}
                    bankName={settings.bankName}
                    bankAddress={settings.bankAddress}
                    bankCity={settings.bankCity}
                    bankPhone={settings.bankPhone}
                    paperType={paperType}
                  />
                </div>
                <div className="mt-3">
                  <CheckStub
                    checkNumber={String(printTarget.checkNumber).padStart(6, "0")}
                    payee={printTarget.payeeName}
                    amount={Number(printTarget.amount)}
                    periodStart={printTarget.periodStart}
                    periodEnd={printTarget.periodEnd}
                    earningsRows={[{ label: "Contractor Pay", amount: Number(printTarget.amount) }]}
                    label="Employee Copy"
                    store={storeInfo}
                  />
                </div>
              </div>

              <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white print:hidden">
                <p className="text-xs text-slate-400 mr-auto">
                  After printing, mark the check as printed to update its status.
                </p>
                <div className="flex gap-2 items-center">
                  <Button variant="outline" onClick={() => setPrintTarget(null)} className="rounded-xl">Cancel</Button>
                  <Button
                    variant="outline"
                    onClick={() => markPrinted.mutate(printTarget.id)}
                    disabled={markPrinted.isPending || printTarget.printStatus === "printed"}
                    className="rounded-xl gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {printTarget.printStatus === "printed" ? "Already Printed" : "Mark as Printed"}
                  </Button>
                  <Suspense fallback={
                    <button disabled className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-400 opacity-60 cursor-wait">
                      <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin inline-block" />
                      PDF…
                    </button>
                  }>
                    <CheckPDFDownload
                      checkNumber={String(printTarget.checkNumber).padStart(6, "0")}
                      date={printTarget.issuedAt}
                      payee={printTarget.payeeName}
                      amount={Number(printTarget.amount)}
                      memo={printTarget.memo}
                      periodStart={printTarget.periodStart}
                      periodEnd={printTarget.periodEnd}
                      store={storeInfo}
                      routing={settings.routingNumber}
                      account={settings.accountNumber}
                      bankName={settings.bankName}
                      bankAddress={settings.bankAddress}
                      bankCity={settings.bankCity}
                      bankPhone={settings.bankPhone}
                      earningsRows={[{ label: "Contractor Pay", amount: Number(printTarget.amount) }]}
                      stubCount={settings.stubCount}
                    />
                  </Suspense>
                  <Button
                    onClick={() => handlePrintCheck(printTarget)}
                    className="rounded-xl gap-2 bg-slate-800 hover:bg-slate-700"
                  >
                    <Printer className="w-4 h-4" /> Print Check
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirmation */}
      <Dialog open={!!voidTarget} onOpenChange={v => !v && setVoidTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Void Check #{voidTarget?.checkNumber}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            This will permanently void check #{voidTarget?.checkNumber} for <strong>{voidTarget?.payeeName}</strong> ({fmt$(voidTarget?.amount ?? 0)}). This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={() => voidTarget && voidCheck.mutate(voidTarget.id)}
              disabled={voidCheck.isPending}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              {voidCheck.isPending ? "Voiding…" : "Void Check"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Per-profile calibration helpers ─────────────────────────────────────────
//
// Design:
//   • `calibrationByProfile` is the single source of truth — each paper type
//     gets its own slot; slots never share state.
//   • `settings.calibration` is treated as a legacy compatibility value only.
//     On first load it is migrated into `calibrationByProfile.standard` so
//     existing users don't lose their standard-paper alignment.
//   • Updating profile A can never affect profile B.
//
// Migration on load: call `migrateCalibrationSettings()` right after
// deserialising from localStorage.

function migrateCalibrationSettings(s: PrintSettings): PrintSettings {
  // If standard profile slot is not yet set, seed it from the legacy field.
  const byProfile = s.calibrationByProfile ?? {};
  if (!byProfile["standard"]) {
    return {
      ...s,
      calibrationByProfile: { ...byProfile, standard: s.calibration },
    };
  }
  return s;
}

/** Returns the calibration for the currently active profile. */
function activeCalibration(s: PrintSettings): CalibrationSettings {
  const key = s.paperType ?? "standard";
  // Each profile falls back to DEFAULT_CALIBRATION — never to another profile's
  // slot — so profiles are fully isolated from each other.
  return s.calibrationByProfile?.[key] ?? DEFAULT_CALIBRATION;
}

/** Returns updated settings with the calibration saved under the active profile only. */
function setActiveCalibration(s: PrintSettings, cal: CalibrationSettings): PrintSettings {
  const key = s.paperType ?? "standard";
  return {
    ...s,
    // Keep legacy `calibration` in sync ONLY for the standard profile so that
    // older versions of the settings (before calibrationByProfile existed) still
    // read correctly if the localStorage value is ever downgraded.
    ...(key === "standard" ? { calibration: cal } : {}),
    calibrationByProfile: { ...(s.calibrationByProfile ?? {}), [key]: cal },
  };
}

const DEFAULT_SETTINGS: PrintSettings = {
  startingCheckNumber: 1001,
  bankName: "",
  bankAddress: "",
  bankCity: "",
  bankPhone: "",
  accountHolderName: "",
  accountAddress: "",
  routingNumber: "",
  accountNumber: "",
  stubCount: "two",
  calibration: DEFAULT_CALIBRATION,
  paperType: "standard",
  calibrationByProfile: {},
};

export default function PrintChecks() {
  const [settings, setSettings] = useState<PrintSettings>(() => {
    try {
      const saved = localStorage.getItem("certxa-print-check-settings");
      const loaded = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
      // Migrate legacy `calibration` → `calibrationByProfile.standard` on first load
      return migrateCalibrationSettings(loaded);
    } catch { return DEFAULT_SETTINGS; }
  });
  const [showSettings, setShowSettings] = useState(false);

  function updateSettings(s: PrintSettings) {
    setSettings(s);
    try { localStorage.setItem("certxa-print-check-settings", JSON.stringify(s)); } catch {}
  }

  return (
    <>
      <style>{buildPrintCss(activeCalibration(settings), settings.paperType ?? "standard")}</style>

      {/* Calibration print sheet — hidden on screen, shown during calibration print via CSS */}
      <CalibrationPrintSheet {...activeCalibration(settings)} />

      <AppLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Print Checks</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {(settings.paperType ?? "standard") === "preprinted"
                  ? "Pre-printed blue security paper — 8.26\" × 10.76\" · check on top"
                  : (settings.paperType ?? "standard") === "officeDepotBlue"
                  ? "Office Depot Standard Blue #637540 — 8.5\" × 11\" · three equal sections"
                  : "Standard blank check stock — DocuGard 04502 compatible"}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="payroll">
            <TabsList className="bg-slate-100 rounded-xl p-1 mb-6 flex-wrap h-auto gap-1">
              <TabsTrigger value="payroll" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Banknote className="w-4 h-4" /> Earnings Checks
              </TabsTrigger>
              <TabsTrigger value="contractor" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Zap className="w-4 h-4" /> Contractor Checks
              </TabsTrigger>
              <TabsTrigger value="batch" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Layers className="w-4 h-4" /> Print Payroll Batch
              </TabsTrigger>
              <TabsTrigger value="setup" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <SlidersHorizontal className="w-4 h-4" /> Paper Setup
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Settings className="w-4 h-4" /> Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="payroll">
              <PayrollChecksTab settings={settings} />
            </TabsContent>
            <TabsContent value="contractor">
              <ContractorChecksTab settings={settings} />
            </TabsContent>
            <TabsContent value="batch">
              <BatchPrintTab settings={settings} />
            </TabsContent>
            <TabsContent value="setup">
              <PaperCalibrationTab
                calibration={activeCalibration(settings)}
                paperType={settings.paperType ?? "standard"}
                onChange={cal => updateSettings(setActiveCalibration(settings, cal))}
              />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsPanel settings={settings} onChange={updateSettings} />
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </>
  );
}
