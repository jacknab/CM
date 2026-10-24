/**
 * CheckDocumentPDF — @react-pdf/renderer document for a single check sheet.
 *
 * Layout follows the Certxa Payroll Check Specification v1.0 (coordinate-based,
 * exact inch positioning).  All elements on the check face are absolutely
 * positioned within an 8.5" × 3.667" container — identical coordinates to the
 * React screen preview (CheckFace in PrintChecks.tsx).
 *
 * MICR font: Uses Courier (always built in to @react-pdf/renderer) since the
 * optional GnuMICR OTF file may not be installed.  Install micr-e13b.otf in
 * public/fonts/ and re-enable Font.register() when ready for bank scanning.
 */
import { postalPlain, postalStreet } from "@/lib/postalAddress";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { PayrollYtd } from "@shared/payrollYtd";
import type { ViewProps } from "@react-pdf/renderer";
import { ZONES, PADDING } from "@/lib/checkLayout";
import { MICR_FONT_FAMILY, MICR_CHAR } from "@/lib/micrFont";

// MICR E-13B font embedded as base64 data URL so it loads reliably in every
// PDF render context (web worker, SSR, etc.) without an HTTP fetch that could
// fail behind the Replit proxy or a CDN timeout.
// It's a byte-for-byte copy of public/fonts/micr-e13b.ttf (the file browser printing uses). A damaged
// copy used to live here — its Windows cmap subtable read as format 41472, and react-pdf's fontkit threw
// "Unknown version 41472" on every glyph — so re-embed from that file if it ever changes.
/** One line of the payee block on the check: 10pt type at 1.4 line height, the same as the on-screen check. */
const PAYEE_LINE_IN = (10 * 1.4) / 72;

const MICR_FONT_B64 =
  "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";

const MICR_FONT_SRC = `data:font/truetype;base64,${MICR_FONT_B64}`;

// Register the MICR E-13B TTF font with react-pdf using an embedded data URL
// (avoids HTTP fetch that can fail behind the Replit proxy or in a web worker)
Font.register({ family: MICR_FONT_FAMILY, src: MICR_FONT_SRC });

// ─── Types ────────────────────────────────────────────────────────────────────

export type EarningsRow = {
  label: string;
  amount: number | string;
  sub?: string;
  indent?: boolean;
  /** One of the salon's recurring deductions, listed by name on the earnings statement. */
  deduction?: boolean;
  ytd?: number | null;
};

export type DailyBreakdownEntry = {
  date: string;       // YYYY-MM-DD
  commission: number;
  tips: number;
  count: number;      // appointment count that day (0 = no-earn day)
};

export type CheckStoreInfo = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  phone?: string | null;
};

/**
 * The salon's authorized signature for the check face — the same image and owner-chosen placement the
 * browser-printed check uses (CheckFace in PrintChecks.tsx). `aspect` is the image's width ÷ height.
 */
export type CheckPDFSignature = {
  src: string;        // data: URL of the transparent signature PNG
  aspect: number;
  offsetPx: number;   // owner's nudge in CSS px, + = lower
  scale: number;      // 0.7–1.3
};

export type CheckPDFProps = {
  signature?: CheckPDFSignature | null;
  checkNumber: string;
  date: string;
  payee: string;
  payeeStreet?: string | null;
  payeeCityStateZip?: string | null;
  amount: number;
  memo?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  store: CheckStoreInfo;
  routing: string;
  account: string;
  bankName?: string;
  bankAddress?: string;
  bankCity?: string;
  bankPhone?: string;
  earningsRows: EarningsRow[];
  stubCount?: "one" | "two";
  label?: string;
  dailyBreakdown?: DailyBreakdownEntry[];
  // New: granular earnings data for the redesigned stub
  serviceCommission?: number;
  tipAmount?: number;
  appointmentCount?: number;
  totalRevenue?: number;
  ytd?: PayrollYtd | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inches → points (72 pt = 1 in) */
const pt = (inches: number) => Math.round(inches * 72 * 100) / 100;

function fmtDay(d: string): string {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return d; }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const dt = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const y = dt.getFullYear();
    return `${m}/${day}/${y}`;
  } catch { return d; }
}
function fmtShort(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return String(d); }
}
function fmt$(n: string | number): string {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
  "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

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
  return `${toWords(dollars) || "Zero"} and ${String(cents).padStart(2, "0")}/100 DOLLARS`;
}

function buildWrittenAmount(amount: number): string {
  const words = amountToWords(amount).toUpperCase();
  const core = `***** ${words} `;
  return core.length >= 74 ? core + "*****" : core.padEnd(76, "*");
}

/** The account field of the MICR line. Exported so the browser check face prints the same thing. */
export function micrAccountField(account: string): string {
  // The account number goes in the MICR line exactly as entered (digits only, however many
  // there are). It used to be right-padded with zeros and cut to 10 digits, which printed a
  // different account number for anything that was not exactly 10 digits long. Shorter numbers are
  // padded with blanks on the left instead, so the routing and check-number fields stay where they
  // have always printed. A number longer than 10 digits makes the line longer.
  const digits = account.replace(/\D/g, "");
  // No account at all (a preview with no bank details yet) keeps the old row of zeros.
  return digits.length ? digits.padStart(10, " ") : "0000000000";
}

function micrNormalize(routing: string, account: string, checkNum: string) {
  return {
    r: routing.replace(/\D/g, "").padEnd(9, "0").slice(0, 9),
    a: micrAccountField(account),
    // 6-digit check number to match the displayed check number format exactly
    c: checkNum.replace(/\D/g, "").padStart(6, "0").slice(-6),
  };
}

/** ABA fractional transit for manual clearing backup. e.g. 122000496 → "12-4/1220" */
function buildFractionalPDF(routing: string): string {
  const r = routing.replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
  return `${r.slice(0, 2)}-${parseInt(r.slice(4, 8), 10)}/${r.slice(0, 4)}`;
}

// ─── Page / zone dimensions ───────────────────────────────────────────────────

const PAGE_W   = pt(8.5);
const PAGE_H   = pt(11);
const CHECK_H  = pt(ZONES.checkIn);   // 3.667"
const STUB1_H  = pt(ZONES.stub1In);   // 3.667"
const STUB2_H  = pt(ZONES.stub2In);   // 3.666"
const S_PAD_T  = pt(PADDING.stub.topIn);
const S_PAD_R  = pt(PADDING.stub.rightIn);
const S_PAD_B  = pt(PADDING.stub.bottomIn);
const S_PAD_L  = pt(PADDING.stub.leftIn);

// ─── Stub stylesheet ──────────────────────────────────────────────────────────

const SS = StyleSheet.create({
  page: { width: PAGE_W, height: PAGE_H, backgroundColor: "#ffffff", fontFamily: "Helvetica" },

  // Check zone — fixed height, white, dashed perf border at bottom
  checkZone: {
    height: CHECK_H,
    position: "relative",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1.5,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "dashed",
    overflow: "hidden",
  },

  // ── Stub zones ────────────────────────────────────────────────────────────
  stub1Zone: {
    height: STUB1_H,
    borderBottomWidth: 1.5,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "dashed",
    overflow: "hidden",
  },
  stub2Zone: {
    height: STUB2_H,
    overflow: "hidden",
  },
  stubBody: {
    paddingTop: S_PAD_T,
    paddingRight: S_PAD_R,
    paddingBottom: S_PAD_B,
    paddingLeft: S_PAD_L,
    flex: 1,
    backgroundColor: "#ffffff",
  },
  stubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  stubTitle: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
  },
  stubCheckNum: {
    fontSize: 8,
    color: "#94a3b8",
    fontFamily: "Courier",
  },
  stubGrid: { flexDirection: "row", gap: 24 },
  stubLeft: { flex: 1 },
  stubRight: { flex: 1 },
  stubFieldLabel: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  stubFieldValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e293b", marginBottom: 8 },
  stubFieldValueSm: { fontSize: 10, color: "#475569", marginBottom: 8 },
  earningsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 3,
    marginBottom: 4,
  },
  earningsHeaderText: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontFamily: "Helvetica-Bold",
  },
  earningsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  earningsLabel: { fontSize: 10, color: "#475569", fontFamily: "Helvetica-Bold", flex: 1 },
  earningsLabelIndent: { fontSize: 8.5, color: "#94a3b8", flex: 1, paddingLeft: 8 },
  earningsSub: { fontSize: 7.5, color: "#94a3b8", marginTop: 1 },
  earningsAmt: { fontSize: 10, color: "#475569", fontFamily: "Courier" },
  earningsAmtIndent: { fontSize: 8.5, color: "#94a3b8", fontFamily: "Courier" },
  earningsTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: "#475569",
    paddingTop: 4,
    marginTop: 3,
  },
  earningsTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  earningsTotalAmt: { fontSize: 11, fontFamily: "Courier", fontWeight: "bold", color: "#0f172a" },
});

// ─── Check face (coordinate-based, matches PrintChecks.tsx CheckFace) ─────────
// Layout mirrors the React screen preview exactly — same three-column header,
// centre-column bank, right-column ABA fractional + check#/date, bordered
// amount box, written amount stopping before the box, DOLLARS label, and
// signature/payee positions matching the visual effective coordinates after the
// screen's translateY offsets are folded in.

function CheckFacePDF({
  checkNumber, date, payee, payeeStreet, payeeCityStateZip,
  amount, periodStart, store,
  routing, account, bankName, bankAddress, bankCity,
  signature,
}: Omit<CheckPDFProps, "earningsRows" | "stubCount" | "label" | "memo" | "periodEnd" | "bankPhone">) {
  const storeCity = [store.city, store.state, store.postcode].filter(Boolean).join(", ");
  const { r, a, c } = micrNormalize(routing, account, checkNumber);
  // ANSI X9.27 business check field order: Check# → Routing Transit → Account
  // ⑈ On-Us / ⑆ Transit — emitted as the font's letter glyphs (see MICR_CHAR)
  const T = MICR_CHAR.TRANSIT, U = MICR_CHAR.ONUS;
  const micrLine = `${T}${r}${T}  ${a}${U}  ${U}${c}${U}`;
  const fractional = buildFractionalPDF(routing);
  const writtenAmt = buildWrittenAmount(amount);
  const numericAmt = `***${fmt$(amount)}`;

  // 10-screen-px top offset — shifts entire check face down to avoid clipping
  const TOP_OFFSET_IN = 10 / 96; // 10px ÷ 96dpi = 0.1042"

  // Absolute position helpers
  const abs = (left_in: number, top_in: number): object => ({
    position: "absolute" as const,
    left: pt(left_in),
    top: pt(top_in + TOP_OFFSET_IN),
  });

  return (
    <View style={SS.checkZone}>

      {/* ══════════════════════════════════════════════════════
          HEADER BAND — three columns: company | bank | check#/date
          ══════════════════════════════════════════════════════ */}

      {/* Company Name — uppercase bold, window-safe X:0.65", Y:0.24" (aligned with bank/date header row) */}
      <Text style={{ ...abs(0.65, 0.24), fontFamily: "Helvetica-Bold", fontSize: 12, color: "#111827", textTransform: "uppercase" }}>
        {store.name}
      </Text>

      {/* Company Address — USPS-standard 2-line block */}
      <Text style={{ ...abs(0.65, 0.41), fontFamily: "Helvetica", fontSize: 8, color: "#374151" }}>
        {store.address || " "}
      </Text>
      <Text style={{ ...abs(0.65, 0.54), fontFamily: "Helvetica", fontSize: 8, color: "#374151" }}>
        {storeCity || " "}
      </Text>

      {/* Bank Name — CENTER column X:3.20", Y:0.28" (matches screen left:"3.20in") */}
      <Text style={{ ...abs(3.20, 0.28), fontFamily: "Helvetica", fontSize: 9, color: "#1f2937", fontWeight: 500 }}>
        {bankName || ""}
      </Text>

      {/* Bank Address — street line then city/state/zip line below */}
      {bankAddress ? (
        <Text style={{ ...abs(3.20, 0.42), fontFamily: "Helvetica", fontSize: 8, color: "#374151" }}>
          {bankAddress}
        </Text>
      ) : null}
      {bankCity ? (
        <Text style={{ ...abs(3.20, 0.54), fontFamily: "Helvetica", fontSize: 8, color: "#374151" }}>
          {bankCity}
        </Text>
      ) : null}

      {/* Fractional ABA routing transit — between bank col and check# col */}
      <View style={{ position: "absolute", left: pt(5.55), top: pt(0.24), width: pt(0.90) }}>
        <Text style={{ fontFamily: "Helvetica", fontSize: 7.5, color: "#374151", textAlign: "center" }}>
          {fractional.split("/")[0]}
        </Text>
        <View style={{ borderTopWidth: 0.5, borderTopColor: "#374151", marginTop: 2, paddingTop: 2 }}>
          <Text style={{ fontFamily: "Helvetica", fontSize: 7.5, color: "#374151", textAlign: "center" }}>
            {fractional.split("/")[1]}
          </Text>
        </View>
      </View>

      {/* Check No. + Date — right-anchored, labels lighter so values read first */}
      <View style={{ position: "absolute", right: pt(0.30), top: pt(0.24) }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          <Text style={{ fontFamily: "Helvetica", fontSize: 7, color: "#111827", textTransform: "uppercase", marginRight: 4 }}>CHECK NO.</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, color: "#111827" }}>{checkNumber}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontFamily: "Helvetica", fontSize: 7, color: "#111827", textTransform: "uppercase", marginRight: 4 }}>CHECK DATE</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, color: "#111827" }}>{fmtDate(date)}</Text>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════
          AMOUNT BAND
          Row A: VOID AFTER 90 DAYS [right]
          Row B: PAY EXACTLY [left]  |  ***$xxx.xx box [right]
          Row C: written amount [left, stops before box] | DOLLARS [right, under box]
          ══════════════════════════════════════════════════════ */}

      {/* VOID AFTER 90 DAYS — above PAY EXACTLY row, right-aligned */}
      <Text style={{ position: "absolute", right: pt(0.38), top: pt(0.90), fontFamily: "Helvetica", fontSize: 6.5, color: "#374151", textTransform: "uppercase" }}>
        VOID AFTER 90 DAYS
      </Text>

      {/* PAY EXACTLY label */}
      <Text style={{ ...abs(0.35, 1.10), fontFamily: "Helvetica", fontSize: 8, color: "#374151", textTransform: "uppercase" }}>
        Pay Exactly
      </Text>

      {/* Amount box — bordered, right-aligned (matches screen bordered div) */}
      <View style={{
        position: "absolute", right: pt(0.38), top: pt(1.22),
        borderWidth: 1.5, borderColor: "#374151", borderRadius: 2,
        paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 16,
        minWidth: pt(1.9),
      }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111827", textAlign: "right" }}>
          {numericAmt}
        </Text>
      </View>

      {/* Written Amount — extends toward the amount box, stops ~2.30" from right */}
      <Text style={{ ...abs(0.35, 1.40), right: pt(2.30), fontFamily: "Helvetica", fontSize: 10, color: "#111827" }}>
        {writtenAmt}
      </Text>

      {/* Thin rule under written amount */}
      <View style={{ ...abs(0.35, 1.67), right: pt(2.30), borderBottomWidth: 0.5, borderBottomColor: "#9ca3af" }} />

      {/* DOLLARS — below the amount box, right-aligned */}
      <Text style={{ position: "absolute", right: pt(0.38), top: pt(1.77), fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#374151", textTransform: "uppercase" }}>
        Dollars
      </Text>

      {/* ══════════════════════════════════════════════════════
          PAYEE + SIGNATURE BAND
          ══════════════════════════════════════════════════════ */}

      {/* PAY TO THE ORDER OF label */}
      <Text style={{ ...abs(0.35, 1.92), fontFamily: "Helvetica", fontSize: 7.5, color: "#374151", textTransform: "uppercase" }}>
        Pay to the Order of
      </Text>

      {/* Employee name and address — one block like the on-screen check (owner, 2026-10-24): 10pt bold, capitals,
          one line apart (10pt × 1.4 = 0.194"), no gap between the name and the address. Window-safe X:0.65", Y:2.13". */}
      <Text style={{ ...abs(0.65, 2.13), fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111827" }}>
        {postalPlain(payee)}
      </Text>
      <Text style={{ ...abs(0.65, 2.13 + PAYEE_LINE_IN), fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111827" }}>
        {postalStreet(payeeStreet) || " "}
      </Text>
      <Text style={{ ...abs(0.65, 2.13 + 2 * PAYEE_LINE_IN), fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111827" }}>
        {postalPlain(payeeCityStateZip) || " "}
      </Text>

      {/* Authorized signature — same rule as the printed check: fitted inside a 2.2" × 0.56" box (× the
          owner's scale), centred over the signature line, its bottom 0.09" below the line so the ink
          dips through it like a pen. The line here spans 5.05"–8.05" at Y:2.50". */}
      {signature ? (() => {
        const boxW = 2.2 * signature.scale, boxH = 0.56 * signature.scale;
        const aspect = signature.aspect > 0 ? signature.aspect : boxW / boxH;
        let w = boxW, h = boxW / aspect;
        if (h > boxH) { h = boxH; w = boxH * aspect; }
        const bottom = 2.50 + TOP_OFFSET_IN + 0.09 + signature.offsetPx / 96;
        return (
          <Image
            src={signature.src}
            style={{ position: "absolute", left: pt(6.55 - w / 2), top: pt(bottom - h), width: pt(w), height: pt(h) }}
          />
        );
      })() : null}

      {/* Signature line */}
      <View style={{ ...abs(5.05, 2.50), right: pt(0.45), borderBottomWidth: 1, borderBottomColor: "#374151" }} />

      {/* MP security badge */}
      <Text style={{ position: "absolute", right: pt(0.38), top: pt(2.46), fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#374151" }}>
        [MP]
      </Text>

      {/* Authorized Signature */}
      <Text style={{ ...abs(5.05, 2.62), fontFamily: "Helvetica", fontSize: 7, color: "#6b7280", textTransform: "uppercase" }}>
        Authorized Signature
      </Text>

      {/* Void After 90 Days — under signature area */}
      <Text style={{ ...abs(5.55, 2.75), fontFamily: "Helvetica", fontSize: 6, color: "#9ca3af", textTransform: "uppercase" }}>
        Void After 90 Days
      </Text>

      {/* MICR Line — bottom-anchored, ABA / ANSI X9.27 clear-band spec */}
      <Text style={{
        position: "absolute",
        left: pt(0.35),
        right: pt(0.35),
        bottom: pt(0.1875),
        lineHeight: 1,
        fontFamily: MICR_FONT_FAMILY,
        fontSize: 11,
        color: "#374151",
        textAlign: "center",
      }}>
        {micrLine}
      </Text>

    </View>
  );
}

// ─── Stub component ───────────────────────────────────────────────────────────

// ── Shared mini-helpers for the new three-column stub layout ──────────────────

const CAP = { fontSize: 7, fontFamily: "Helvetica-Bold" as const, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 };
const SECTION_LABEL = { fontSize: 7.5, fontFamily: "Helvetica-Bold" as const, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 0.5, paddingHorizontal: 3, paddingVertical: 2, marginBottom: 3 };
const ROW_LABEL = { fontSize: 9, color: "#475569", fontFamily: "Helvetica" as const, flex: 1 };
const ROW_AMT   = { fontSize: 9, color: "#475569", fontFamily: "Courier" as const, width: 53, textAlign: "right" as const };
const ROW_YTD   = { fontSize: 9, color: "#64748b", fontFamily: "Courier" as const, width: 65, textAlign: "right" as const };
const BOLD_LABEL = { fontSize: 9, fontFamily: "Helvetica-Bold" as const, color: "#1e293b", flex: 1 };
const BOLD_AMT   = { fontSize: 9, fontFamily: "Courier" as const, color: "#1e293b", width: 53, textAlign: "right" as const, fontWeight: "bold" as const };

function PDFRow({ label, period, ytd, bold = false, topBorder = false }: { label: string; period: string; ytd: string; bold?: boolean; topBorder?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3, borderTopWidth: topBorder ? 0.5 : 0, borderTopColor: "#cbd5e1", paddingTop: topBorder ? 3 : 0, marginTop: topBorder ? 2 : 0 }}>
      <Text style={bold ? BOLD_LABEL : ROW_LABEL}>{label}</Text>
      <Text style={bold ? BOLD_AMT : ROW_AMT}>{period}</Text>
      <Text style={ROW_YTD}>{ytd}</Text>
    </View>
  );
}

function CheckStubPDF({
  checkNumber, payee, amount, periodStart, periodEnd,
  earningsRows, label, store, zoneStyle, date,
  payeeStreet, payeeCityStateZip,
  serviceCommission, tipAmount, appointmentCount, totalRevenue, ytd,
}: {
  checkNumber: string; payee: string; amount: number;
  periodStart?: string | null; periodEnd?: string | null;
  earningsRows: EarningsRow[]; label: string; store: CheckStoreInfo;
  zoneStyle: ViewProps["style"];
  dailyBreakdown?: DailyBreakdownEntry[];
  date?: string;
  payeeStreet?: string | null;
  payeeCityStateZip?: string | null;
  serviceCommission?: number;
  tipAmount?: number;
  appointmentCount?: number;
  totalRevenue?: number;
  ytd?: PayrollYtd | null;
}) {
  // Derive values — fall back to earningsRows when new props not provided
  const svcComm = serviceCommission
    ?? Number(earningsRows.find(r => r.label === "Service Commissions")?.amount ?? earningsRows.find(r => r.label === "Commission")?.amount ?? 0);
  const productComm = Number(earningsRows.find(r => r.label === "Product Commissions")?.amount ?? 0);
  const tips = tipAmount
    ?? (earningsRows.find(r => r.label === "Tips") ? Number(earningsRows.find(r => r.label === "Tips")!.amount) : 0);
  const otherEarnings = Number(earningsRows.find(r => r.label === "Other Earnings")?.amount ?? 0);
  const boothRent = Math.abs(Number(earningsRows.find(r => r.label === "Booth Rent")?.amount ?? 0));
  const otherDeductions = Math.abs(Number(earningsRows.find(r => r.label === "Other Deductions")?.amount ?? 0));
  const grossEarnings  = svcComm + productComm + tips + otherEarnings;
  // The salon's recurring deductions, one row each (name, this period, year to date).
  const itemized = earningsRows.filter(r => r.deduction).map(r => ({ label: r.label, amount: Math.abs(Number(r.amount)), ytd: r.ytd }));
  const otherYtd = earningsRows.find(r => r.label === "Other Deductions")?.ytd;
  const totalDeductions = boothRent + itemized.reduce((s, r) => s + r.amount, 0) + otherDeductions;
  const ytdAmount = (key: keyof PayrollYtd) => ytd ? fmt$(ytd[key]) : "—";
  // Street, then "City, ST ZIP" on the next line (owner, 2026-10-24).
  const storeStreet = store.address || "";
  const storeCityLine = [store.city, [store.state, store.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const avgTicket = (appointmentCount && appointmentCount > 0 && totalRevenue)
    ? Number(totalRevenue) / appointmentCount : null;

  return (
    <View style={zoneStyle}>
      <View style={SS.stubBody}>

        {/* ── DETACH HERE bar ──────────────────────────────────────── */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5, paddingVertical: 2, paddingHorizontal: 4 }}>
          <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: "#94a3b8", borderStyle: "dashed" }} />
          <Text style={{ fontSize: 5.5, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 1.2, marginHorizontal: 6 }}>
            Detach and Retain for Your Records
          </Text>
          <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: "#94a3b8", borderStyle: "dashed" }} />
        </View>

        {/* ── Full-width header ─────────────────────────────────────── */}
        <View style={{ flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#1e293b", paddingBottom: 8, marginBottom: 8 }}>
          {/* Left: business */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0f172a", textTransform: "uppercase" }}>{store.name}</Text>
            {storeStreet ? <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>{storeStreet}</Text> : null}
            {storeCityLine ? <Text style={{ fontSize: 8, color: "#64748b" }}>{storeCityLine}</Text> : null}
          </View>
          {/* Center: title */}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e293b", textTransform: "uppercase", letterSpacing: 0.5 }}>Earnings Statement</Text>
            <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>{label}</Text>
            {date ? <Text style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>Pay Date: {fmtDate(date)}</Text> : null}
            {(periodStart || periodEnd) ? <Text style={{ fontSize: 8, color: "#475569" }}>Period: {fmtShort(periodStart)} – {fmtShort(periodEnd)}</Text> : null}
            <Text style={{ fontSize: 8, color: "#475569" }}>Check No: {checkNumber}</Text>
          </View>
          {/* Right: employee */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0f172a" }}>{payee.toUpperCase()}</Text>
            {payeeStreet ? <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>{payeeStreet.toUpperCase()}</Text> : null}
            {payeeCityStateZip ? <Text style={{ fontSize: 8, color: "#64748b" }}>{payeeCityStateZip.toUpperCase()}</Text> : null}
          </View>
        </View>

        {/* ── Three-column body ─────────────────────────────────────── */}
        <View style={{ flexDirection: "row" }}>

          {/* ═══ Left: EARNINGS + DEDUCTIONS ══════════════════════════ */}
          <View style={{ flex: 1.4, paddingRight: 8 }}>
            {/* Column header row */}
            <View style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={{ flex: 1 }} />
              <Text style={{ ...CAP, width: 53, textAlign: "right" }}>This Period</Text>
              <Text style={{ ...CAP, width: 65, textAlign: "right" }}>YTD</Text>
            </View>
            {/* EARNINGS */}
            <Text style={SECTION_LABEL}>Earnings</Text>
            <PDFRow label="Service Commissions" period={fmt$(svcComm)} ytd={ytdAmount("serviceCommission")} />
            <PDFRow label="Product Commissions" period={productComm > 0 ? fmt$(productComm) : "—"} ytd={ytdAmount("productCommission")} />
            <PDFRow label="Credit Card Tips" period={tips > 0 ? fmt$(tips) : "—"} ytd={ytdAmount("tips")} />
            <PDFRow label="Other Earnings" period={otherEarnings > 0 ? fmt$(otherEarnings) : "—"} ytd={ytdAmount("otherEarnings")} />
            <PDFRow label="Total Gross Earnings" period={fmt$(grossEarnings)} ytd={ytdAmount("grossEarnings")} bold topBorder />
            {/* DEDUCTIONS */}
            <Text style={{ ...SECTION_LABEL, marginTop: 5 }}>Deductions</Text>
            {/* Booth rent is listed only when there is some: this period, or earlier this year. */}
            {(boothRent > 0 || (ytd?.boothRent ?? 0) > 0) ? <PDFRow label="Booth Rent" period={boothRent > 0 ? fmt$(boothRent) : "—"} ytd={ytdAmount("boothRent")} /> : null}
            {itemized.map((d) => <PDFRow key={d.label} label={d.label} period={d.amount > 0 ? fmt$(d.amount) : "—"} ytd={d.ytd != null ? fmt$(d.ytd) : "—"} />)}
            {(itemized.length === 0 || otherDeductions > 0 || (otherYtd ?? 0) > 0) && (
              <PDFRow label="Other Deductions" period={otherDeductions > 0 ? fmt$(otherDeductions) : "—"} ytd={otherYtd != null ? fmt$(otherYtd) : ytdAmount("otherDeductions")} />
            )}
            <PDFRow label="Total Deductions" period={fmt$(totalDeductions)} ytd={ytdAmount("totalDeductions")} bold topBorder />
          </View>

          {/* ═══ Vertical divider ══════════════════════════════════════ */}
          <View style={{ width: 0.5, backgroundColor: "#e2e8f0", marginHorizontal: 6 }} />

          {/* ═══ Right: PAY SUMMARY + PERFORMANCE ═════════════════════ */}
          <View style={{ flex: 0.95 }}>
            {/* PAY SUMMARY */}
            <Text style={SECTION_LABEL}>Pay Summary</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 }}>
              <Text style={ROW_LABEL}>Gross Earnings</Text>
              <Text style={ROW_AMT}>{fmt$(grossEarnings)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingBottom: 4 }}>
              <Text style={ROW_LABEL}>Total Deductions</Text>
              <Text style={ROW_AMT}>{fmt$(totalDeductions)}</Text>
            </View>
            {/* NET PAY hero */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: "#334155", textTransform: "uppercase", letterSpacing: 0.8 }}>Net Pay</Text>
              <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0f172a" }}>{fmt$(amount)}</Text>
            </View>
            {ytd ? <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}><Text style={ROW_LABEL}>YTD Net Pay</Text><Text style={ROW_AMT}>{fmt$(ytd.netPay)}</Text></View> : null}

            {/* PERFORMANCE */}
            {(appointmentCount !== undefined || totalRevenue !== undefined) ? (
              <>
                <Text style={{ ...SECTION_LABEL, marginTop: 2 }}>Performance</Text>
                {appointmentCount !== undefined ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 }}>
                    <Text style={ROW_LABEL}>Services Completed</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e293b" }}>{appointmentCount}</Text>
                  </View>
                ) : null}
                {totalRevenue !== undefined ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 }}>
                    <Text style={ROW_LABEL}>Total Sales Generated</Text>
                    <Text style={{ fontSize: 9, color: "#475569", fontFamily: "Courier" }}>{fmt$(totalRevenue)}</Text>
                  </View>
                ) : null}
                {avgTicket !== null ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 }}>
                    <Text style={ROW_LABEL}>Average Ticket</Text>
                    <Text style={{ fontSize: 9, color: "#475569", fontFamily: "Courier" }}>{fmt$(avgTicket)}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Thank-you note */}
            <Text style={{ fontSize: 8, color: "#94a3b8", fontStyle: "italic", marginTop: 6 }}>
              Thank you for your continued service.
            </Text>
          </View>
        </View>

      </View>
    </View>
  );
}

// ─── Main exported document ───────────────────────────────────────────────────

export function CheckDocumentPDF({
  checkNumber, date, payee, payeeStreet, payeeCityStateZip,
  amount, memo, periodStart, periodEnd, store,
  routing, account, bankName, bankAddress, bankPhone,
  earningsRows, stubCount = "two", dailyBreakdown,
  serviceCommission, tipAmount, appointmentCount, totalRevenue, ytd,
  signature,
}: CheckPDFProps) {
  return (
    <Document
      title={`Check #${checkNumber} – ${payee}`}
      author={store.name}
      creator="Certxa"
    >
      <Page size="LETTER" style={SS.page}>

        {/* ── Zone 1: Check face ──────────────────────────────────── */}
        <CheckFacePDF
          checkNumber={checkNumber} date={date}
          payee={payee} payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
          amount={amount}
          periodStart={periodStart} store={store}
          routing={routing} account={account}
          bankName={bankName} bankAddress={bankAddress}
          signature={signature}
        />

        {/* ── Zone 2: Stub 1 (Employee copy) ─────────────────────── */}
        <CheckStubPDF
          checkNumber={checkNumber} payee={payee} amount={amount}
          periodStart={periodStart} periodEnd={periodEnd}
          earningsRows={earningsRows} label="Employee Copy"
          store={store} zoneStyle={SS.stub1Zone}
          date={date} payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
          serviceCommission={serviceCommission} tipAmount={tipAmount}
          ytd={ytd}
          appointmentCount={appointmentCount} totalRevenue={totalRevenue}
        />

        {/* ── Zone 3: Stub 2 or blank ─────────────────────────────── */}
        {stubCount === "two" ? (
          <CheckStubPDF
            checkNumber={checkNumber} payee={payee} amount={amount}
            periodStart={periodStart} periodEnd={periodEnd}
            earningsRows={earningsRows} label="Employer Copy"
            store={store} zoneStyle={SS.stub2Zone}
            date={date} payeeStreet={payeeStreet} payeeCityStateZip={payeeCityStateZip}
            serviceCommission={serviceCommission} tipAmount={tipAmount}
            ytd={ytd}
            appointmentCount={appointmentCount} totalRevenue={totalRevenue}
          />
        ) : (
          <View style={SS.stub2Zone} />
        )}

      </Page>
    </Document>
  );
}
