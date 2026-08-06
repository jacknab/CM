/**
 * Single source of truth for check layout.
 *
 * Every spatial value, color, and font size used by BOTH the React screen
 * preview (CheckFace / CheckStub) and the @react-pdf/renderer PDF generator
 * lives here.  Changing a value here propagates to both renderers
 * automatically — screen and PDF can never drift apart.
 *
 * Spatial values → INCHES (neutral unit)
 * Font sizes     → POINTS (pt — valid in both CSS and @react-pdf/renderer)
 * Colors         → hex strings
 */

// ─── PaperProfile — describes a single brand of blank check stock ─────────────
// Add a new entry here to support additional check paper brands without
// touching the rendering engine.  The renderer consumes these values directly.
export type PaperProfile = {
  id:   string;
  name: string;          // human-readable label for the UI

  // Physical sheet dimensions (inches)
  paperWidth:  number;
  paperHeight: number;

  // Three-zone layout (check + 2 stubs / vouchers), all in inches from top
  checkArea: {
    height:       number;   // zone 1 — the printable check area
    stub1Height:  number;   // zone 2 — first voucher / employee stub
    stub2Height:  number;   // zone 3 — second voucher / employer stub
  };

  // ANSI X9.27 / ABA MICR clear-band specification for this stock
  micrBand: {
    clearBandHeight: number;  // total reserved height at bottom of check zone
    bottomMargin:    number;  // quiet zone below MICR characters
    baseline:        number;  // distance from check-zone bottom to MICR baseline
  };

  // Default calibration offsets for this profile (user can adjust)
  defaultOffset: { x: number; y: number };
};

// ─── Known paper profiles ─────────────────────────────────────────────────────
// "standard"        — DocuGard 04502 / any standard 8.5"×11" blank check stock.
//                     Renderer prints its own security design + all fields.
// "preprinted"      — Pre-printed blue security paper (8.26"×10.76").
//                     Renderer prints text/content only; bg is the physical paper.
// "officeDepotBlue" — Office Depot Standard Blue (Item #637540 / Mfg #9297).
//                     8.5"×11", 3 equal 3.667" zones — same page dims as DocuGard
//                     but distinct calibration slot.  Renderer prints security
//                     design + all fields (same as standard).
export const PAPER_PROFILES: Record<string, PaperProfile> = {
  standard: {
    id:   "standard",
    name: "Standard Blank Stock (DocuGard 04502, 8.5\"×11\")",
    paperWidth:  8.5,
    paperHeight: 11,
    checkArea:  { height: 3.667, stub1Height: 3.667, stub2Height: 3.666 },
    micrBand:   { clearBandHeight: 0.625, bottomMargin: 0.075, baseline: 0.1875 },
    defaultOffset: { x: 0, y: 0 },
  },
  preprinted: {
    id:   "preprinted",
    name: "Pre-Printed Blue Security Paper (8.26\"×10.76\")",
    paperWidth:  8.26,
    paperHeight: 10.76,
    checkArea:  { height: 3.44, stub1Height: 3.44, stub2Height: 3.88 },
    micrBand:   { clearBandHeight: 0.625, bottomMargin: 0.075, baseline: 0.1875 },
    defaultOffset: { x: 0, y: 0 },
  },
  officeDepotBlue: {
    id:   "officeDepotBlue",
    name: "Office Depot Standard Blue (Item #637540 / Mfg #9297, 8.5\"×11\")",
    paperWidth:  8.5,
    paperHeight: 11,
    // Three equal sections per vendor spec:
    //   Section 1 (Check) Y=0.000" – 3.667"
    //   Section 2 (Stub)  Y=3.667" – 7.334"
    //   Section 3 (Stub)  Y=7.334" – 11.000"
    checkArea:  { height: 3.667, stub1Height: 3.667, stub2Height: 3.666 },
    // ANSI X9.27 MICR clear band: 0.625" total, baseline 0.250" from bottom
    micrBand:   { clearBandHeight: 0.625, bottomMargin: 0.187, baseline: 0.250 },
    defaultOffset: { x: 0, y: 0 },
  },
} as const;

// ─── DocuGard 04502 zone heights (8.5" × 11") ─────────────────────────────────
export const ZONES = {
  checkIn:  3.667, // perf at 3.667" (industry standard payroll check height)
  stub1In:  3.667, // perf at 7.334"
  stub2In:  3.666, // remaining paper to 11"
} as const;

// ─── Business Check on Top — pre-printed blue security paper (8.26" × 10.76") ─
// Measured from vendor PDF: blue security background 0"–2.93", white MICR zone
// 2.93"–3.44", perforation at 3.44", equal stub zones, page ends at 10.76".
export const BIZ_CHECK_ZONES = {
  checkIn:  3.44,  // perf at 3.44" from top
  stub1In:  3.44,  // perf at 6.88" from top
  stub2In:  3.88,  // remainder to 10.76"
  pageW:    8.26,  // page width in inches
  pageH:   10.76,  // page height in inches
  // Security background covers top ~2.93"; white writing zone is 2.93"–3.44"
  secBgEndIn: 2.93,
} as const;

// ─── MICR zone — ANSI X9.27 / ABA banking standards ─────────────────────────
// The MICR clear band occupies the bottom 0.625" of the check.
//   bottomClearIn: quiet zone below the MICR characters (bottom of check to
//                  baseline of lowest character)
//   heightIn:      height of the MICR character band
//   Total reserved = bottomClearIn + heightIn = 0.625"
export const MICR_ZONE = {
  bottomClearIn: 0.075,  // 0.075" quiet zone at very bottom of check
  heightIn:      0.550,  // 0.550" MICR character band
  // total = 0.625" from the bottom edge — matches ADP / Deluxe / DocuGard spec
} as const;

// ─── Internal padding within each zone ───────────────────────────────────────
export const PADDING = {
  check: { topIn: 0.12, rightIn: 0.35, bottomIn: 0.05, leftIn: 0.35 },
  stub:  { topIn: 0.08, rightIn: 0.35, bottomIn: 0.05, leftIn: 0.35 },
} as const;

// ─── Security band height ─────────────────────────────────────────────────────
export const BAND_HEIGHT_IN = 0.18;

// ─── Logo box ─────────────────────────────────────────────────────────────────
export const LOGO = {
  sizePt:     46,    // box width & height in points
  initialPt:  20,
  subLabelPt:  5.5,
} as const;

// ─── Typography — all font sizes in points ───────────────────────────────────
export const TYPE = {
  secBandPt:      4.5,
  companyNamePt: 11,
  companyAddrPt:  9,
  serialPt:       7,
  infoLabelPt:    8.5,
  infoValuePt:    8.5,
  payeeLabelPt:   8,
  payeeNamePt:   15,
  amountWordsPt: 10,
  amountDollarPt:14,
  bankNamePt:     7.5,
  bankAddrPt:     6.5,
  memoLabelPt:    7.5,
  memoValuePt:    9,
  signaturePt:   16,
  sigLabelPt:     6.5,
  voidPt:         6,
  micrPt:        11,
  mpTagPt:        6.5,
} as const;

// ─── Colors ───────────────────────────────────────────────────────────────────
export const COLORS = {
  // Security bands — gradient approximated as a solid midpoint in PDF
  bandTop:          "#6b7280",   // gray-500
  bandBot:          "#1d4ed8",   // blue-700
  bandText:         "rgba(255,255,255,0.65)",
  bandTextSolid:    "#ffffffa6", // PDF fallback (no rgba in react-pdf StyleSheet)

  // Accent (indigo)
  accent:           "#818cf8",
  accentLight:      "#f5f3ff",
  accentDark:       "#1e1b4b",
  accentMuted:      "#a5b4fc",

  // Typography
  companyName:      "#111827",
  companyAddr:      "#4b5563",
  infoLabel:        "#6b7280",
  infoValue:        "#111827",
  payeeName:        "#111827",
  payeeLabel:       "#6b7280",
  amountWords:      "#1f2937",
  amountDollar:     "#111827",
  amountBox:        "#374151",
  bankName:         "#1f2937",
  bankAddr:         "#4b5563",
  memoLabel:        "#9ca3af",
  memoValue:        "#374151",
  signatureText:    "#6b7280",
  sigLabel:         "#6b7280",
  voidText:         "#9ca3af",
  micrText:         "#374151",
  serial:           "#ef4444",   // red-500 (opacity applied inline)

  // Borders
  borderLight:      "#d1d5db",
  borderMedium:     "#9ca3af",
  borderDark:       "#374151",
  accentBorder:     "#818cf8",

  // Backgrounds
  white:            "#ffffff",
  stubBg:           "#f8fafc",
  perf:             "#94a3b8",
} as const;

// ─── Conversion helpers ───────────────────────────────────────────────────────

/** Inches → points  (for @react-pdf/renderer — its native unit) */
export const inToPt = (inches: number): number => Math.round(inches * 72 * 100) / 100;

/** Inches → CSS string  (for React screen components) */
export const inCss = (inches: number): string => `${inches}in`;

/** Points → CSS string  (valid CSS unit — same value in both renderers) */
export const ptCss = (pt: number): string => `${pt}pt`;
