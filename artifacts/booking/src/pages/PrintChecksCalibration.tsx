import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Printer, SlidersHorizontal, Target, CheckCircle2,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, Info,
} from "lucide-react";
import { PAPER_PROFILES } from "@/lib/checkLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaperLayout = "top" | "middle" | "bottom";

export type CalibrationSettings = {
  paperLayout: PaperLayout;
  topOffsetIn: number;   // positive = shift content DOWN, negative = UP
  leftOffsetIn: number;  // positive = shift content RIGHT, negative = LEFT
};

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  paperLayout: "top",
  topOffsetIn: 0,
  leftOffsetIn: 0,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_H = 11 / 3; // 3.6667" per check zone

const ZONE_START: Record<PaperLayout, number> = {
  top:    0,
  middle: ZONE_H,
  bottom: ZONE_H * 2,
};

// Key field positions relative to zone top (in inches)
const FIELD_ANCHORS = [
  { id: "header",    rel: 0.21, label: "COMPANY NAME",               isMicr: false },
  { id: "payee",     rel: 0.65, label: "PAYEE NAME",                 isMicr: false },
  { id: "amount",    rel: 0.87, label: "AMOUNT",                     isMicr: false },
  { id: "memo",      rel: 1.10, label: "MEMO",                       isMicr: false },
  { id: "signature", rel: 1.47, label: "SIGNATURE",                  isMicr: false },
  { id: "micr",      rel: 2.35, label: "MICR NUMBERS",               isMicr: true  },
];

const MICR_ANCHOR = FIELD_ANCHORS.find(f => f.id === "micr")!;

// ── Row label helpers (A0–K9, 110 rows, each 0.1")  ──────────────────────────
// A0 = row 1 = 0.0"    A9 = row 10 = 0.9"
// B0 = row 11 = 1.0"   ...   K9 = row 110 = 10.9"

export function rowLabel(rowNum: number): string {
  const idx    = rowNum - 1;
  const letter = String.fromCharCode(65 + Math.floor(idx / 10));
  const digit  = idx % 10;
  return `${letter}${digit}`;
}

export function labelToRow(label: string): number | null {
  const s = label.trim().toUpperCase();
  if (!/^[A-K][0-9]$/.test(s)) return null;
  return (s.charCodeAt(0) - 65) * 10 + parseInt(s[1]) + 1;
}

function inchToRow(inches: number): number {
  return Math.round(inches * 10) + 1;
}

export function expectedMicrLabel(layout: PaperLayout, topOffsetIn: number): string {
  const row = inchToRow(ZONE_START[layout] + MICR_ANCHOR.rel + topOffsetIn);
  const clamped = Math.max(1, Math.min(110, row));
  return rowLabel(clamped);
}

// ─── CalibrationPrintSheet ────────────────────────────────────────────────────
// Three columns — LEFT · MIDDLE · RIGHT — each running A0–K9 top to bottom.
// Hidden on-screen; shown during print when body has .printing-calibration.

const COL_FILL = [
  // LEFT — sequential alpha
  (row: number) => {
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: 26 }, (_, i) => alpha[(i + row * 2) % 26]).join(" ");
  },
  // MIDDLE — sequential digits
  (row: number) => {
    return Array.from({ length: 26 }, (_, i) => String((i + row * 3) % 10)).join(" ");
  },
  // RIGHT — reverse alpha
  (row: number) => {
    const alpha = "ZYXWVUTSRQPONMLKJIHGFEDCBA";
    return Array.from({ length: 26 }, (_, i) => alpha[(i + row) % 26]).join(" ");
  },
];

const COL_NAMES = ["LEFT", "MIDDLE", "RIGHT"];

export function CalibrationPrintSheet({
  paperLayout, topOffsetIn, leftOffsetIn,
}: CalibrationSettings) {
  const layoutLabel = { top: "TOP", middle: "MIDDLE", bottom: "BOTTOM" }[paperLayout];
  const zoneStart   = ZONE_START[paperLayout] + topOffsetIn;
  const zoneEnd     = zoneStart + ZONE_H;

  // Which rows carry a highlighted field label
  type FieldInfo = { label: string; isMicr: boolean };
  const fieldRowMap = new Map<number, FieldInfo>();
  for (const f of FIELD_ANCHORS) {
    const r = inchToRow(zoneStart + f.rel);
    if (r >= 1 && r <= 110) fieldRowMap.set(r, { label: f.label, isMicr: f.isMicr });
  }

  const zoneStartRow = inchToRow(zoneStart);
  const zoneEndRow   = inchToRow(zoneEnd);

  return (
    <div
      id="calibration-print-area"
      style={{
        display: "none",
        width: "8.5in",
        height: "11in",
        overflow: "hidden",
        fontFamily: "'Courier New', Courier, monospace",
        boxSizing: "border-box",
        marginLeft: leftOffsetIn !== 0 ? `${leftOffsetIn}in` : undefined,
      }}
    >
      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <div style={{
        height: "0.1in",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 6px",
        background: "#0f172a",
        color: "#f8fafc",
        fontSize: "5.5pt",
        fontWeight: "bold",
        boxSizing: "border-box",
        flexShrink: 0,
      }}>
        <span>CERTXA — Check Calibration Grid  |  Layout: CHECK ON {layoutLabel}</span>
        <span>Read MIDDLE column at MICR row · A0–K9 (each row = 0.1")</span>
      </div>

      {/* ── Column headers ─────────────────────────────────────────────── */}
      <div style={{
        height: "0.12in",
        display: "flex",
        boxSizing: "border-box",
        background: "#1e293b",
        flexShrink: 0,
      }}>
        {/* Row-label gutter */}
        <div style={{ width: "0.28in", flexShrink: 0 }} />
        {COL_NAMES.map((name, ci) => (
          <div key={ci} style={{
            flex: 1,
            borderLeft: ci === 0 ? "none" : "1.5px solid #475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: ci === 1 ? "#fbbf24" : "#94a3b8",
            fontSize: "6pt",
            fontWeight: "bold",
            letterSpacing: "0.15em",
          }}>
            {name}{ci === 1 ? " ★" : ""}
          </div>
        ))}
      </div>

      {/* ── Ruler rows (110 × 0.1" = 11") ─────────────────────────────── */}
      {Array.from({ length: 110 }, (_, i) => {
        const rowNum  = i + 1;
        const inch    = i * 0.1;
        const label   = rowLabel(rowNum);
        const isInch  = i % 10 === 0;
        const field   = fieldRowMap.get(rowNum);
        const isZoneStart = rowNum === zoneStartRow;
        const isZoneEnd   = rowNum === zoneEndRow;
        const isSpecial   = field || isZoneStart || isZoneEnd;

        const rowBg =
          field?.isMicr  ? "#fffbeb"
          : field        ? "#f0fdf4"
          : isZoneStart || isZoneEnd ? "#eff6ff"
          : isInch       ? "#f8fafc"
          : "transparent";

        const topBorder =
          field?.isMicr  ? "1.5px solid #f59e0b"
          : field        ? "1px solid #86efac"
          : isZoneStart || isZoneEnd ? "1.5px solid #3b82f6"
          : isInch       ? "1px solid #e2e8f0"
          : "none";

        return (
          <div
            key={rowNum}
            style={{
              height: "0.1in",
              display: "flex",
              alignItems: "center",
              background: rowBg,
              borderTop: topBorder,
              boxSizing: "border-box",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Row label (shared gutter) */}
            <div style={{
              width: "0.28in",
              textAlign: "right",
              paddingRight: "3px",
              fontSize: "6pt",
              fontWeight: "bold",
              color: field?.isMicr ? "#b45309" : isZoneStart || isZoneEnd ? "#2563eb" : isInch ? "#64748b" : "#94a3b8",
              flexShrink: 0,
              lineHeight: 1,
            }}>
              {label}
            </div>

            {/* Three columns */}
            {[0, 1, 2].map(ci => {
              const isMiddle = ci === 1;
              const contentColor =
                field?.isMicr  ? "#b45309"
                : field        ? "#166534"
                : isZoneStart || isZoneEnd ? "#1d4ed8"
                : isMiddle     ? "#475569"
                : "#94a3b8";
              const contentSize   = isSpecial ? "6.5pt" : "5pt";
              const contentWeight = isSpecial ? "bold" : "normal";
              const letterSpacing = isSpecial ? "0.04em" : "0.12em";

              let text: string;
              if (isZoneStart) {
                text = ci === 1
                  ? `━━━━ CHECK ZONE START (${layoutLabel}) ━━━━`
                  : `───────────────────────────────────`;
              } else if (isZoneEnd) {
                text = ci === 1
                  ? `━━━━ CHECK ZONE END ━━━━━━━━━━━━━━━━`
                  : `───────────────────────────────────`;
              } else if (field) {
                text = ci === 1
                  ? `◀◀  ${field.label}  ▶▶`
                  : `─── ${field.label} ───`;
              } else {
                text = COL_FILL[ci](rowNum).slice(0, 38);
              }

              return (
                <div
                  key={ci}
                  style={{
                    flex: 1,
                    borderLeft: ci === 0 ? "none" : "1px solid #e2e8f0",
                    paddingLeft: "3px",
                    paddingRight: "2px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    fontSize: contentSize,
                    fontWeight: contentWeight,
                    letterSpacing,
                    color: contentColor,
                    lineHeight: 1,
                    boxSizing: "border-box",
                  }}
                >
                  {text}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── PaperCalibrationTab ──────────────────────────────────────────────────────

type Step = "setup" | "printed" | "done";

export function PaperCalibrationTab({
  calibration, onChange, paperType = "standard",
}: {
  calibration: CalibrationSettings;
  onChange: (c: CalibrationSettings) => void;
  paperType?: string;
}) {
  const [step,       setStep]       = useState<Step>("setup");
  const [micrInput,  setMicrInput]  = useState("");
  const [micrError,  setMicrError]  = useState("");

  const expLabel = expectedMicrLabel(calibration.paperLayout, calibration.topOffsetIn);

  function handlePrintCalibration() {
    document.body.classList.add("printing-calibration");
    const prev = document.title;
    document.title = `Calibration — Check on ${calibration.paperLayout.toUpperCase()}`;
    window.print();
    document.title = prev;
    document.body.classList.remove("printing-calibration");
    setStep("printed");
  }

  function handleCalculateOffset() {
    const actual = labelToRow(micrInput.trim());
    if (!actual) {
      setMicrError("Enter a label like A0–K9 (e.g. D5)");
      return;
    }
    setMicrError("");
    const expRow      = labelToRow(expLabel)!;
    const expectedInch = (expRow - 1) * 0.1;
    const actualInch   = (actual - 1) * 0.1;
    const newTop       = calibration.topOffsetIn + (expectedInch - actualInch);
    onChange({ ...calibration, topOffsetIn: Math.round(newTop * 20) / 20 });
    setStep("done");
    setMicrInput("");
  }

  function nudgeTop(delta: number) {
    onChange({ ...calibration, topOffsetIn: Math.round((calibration.topOffsetIn + delta) * 20) / 20 });
  }
  function nudgeLeft(delta: number) {
    onChange({ ...calibration, leftOffsetIn: Math.round((calibration.leftOffsetIn + delta) * 20) / 20 });
  }
  function resetOffsets() {
    onChange({ ...calibration, topOffsetIn: 0, leftOffsetIn: 0 });
  }

  const LAYOUTS: Array<{ id: PaperLayout; label: string; desc: string; diagram: React.ReactNode }> = [
    {
      id: "top",
      label: "Check on Top",
      desc: "Check at top, stubs below",
      diagram: (
        <div className="w-10 h-14 border-2 border-slate-300 rounded overflow-hidden flex flex-col">
          <div className="flex-1 bg-blue-100 border-b border-dashed border-slate-300 flex items-center justify-center text-[9px] text-blue-600 font-bold">✓</div>
          <div className="flex-1 bg-slate-50 border-b border-dashed border-slate-200" />
          <div className="flex-1 bg-slate-50" />
        </div>
      ),
    },
    {
      id: "middle",
      label: "Check in Middle",
      desc: "Check in center",
      diagram: (
        <div className="w-10 h-14 border-2 border-slate-300 rounded overflow-hidden flex flex-col">
          <div className="flex-1 bg-slate-50 border-b border-dashed border-slate-200" />
          <div className="flex-1 bg-blue-100 border-b border-dashed border-slate-300 flex items-center justify-center text-[9px] text-blue-600 font-bold">✓</div>
          <div className="flex-1 bg-slate-50" />
        </div>
      ),
    },
    {
      id: "bottom",
      label: "Check on Bottom",
      desc: "Check at bottom",
      diagram: (
        <div className="w-10 h-14 border-2 border-slate-300 rounded overflow-hidden flex flex-col">
          <div className="flex-1 bg-slate-50 border-b border-dashed border-slate-200" />
          <div className="flex-1 bg-slate-50 border-b border-dashed border-slate-300" />
          <div className="flex-1 bg-blue-100 flex items-center justify-center text-[9px] text-blue-600 font-bold">✓</div>
        </div>
      ),
    },
  ];

  const profile = PAPER_PROFILES[paperType] ?? PAPER_PROFILES["standard"];

  // Accent color per paper type
  const profileColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    officeDepotBlue: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700" },
    preprinted:      { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   badge: "bg-blue-100 text-blue-700"   },
    standard:        { bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-700",  badge: "bg-slate-100 text-slate-600"  },
  };
  const pc = profileColors[paperType] ?? profileColors["standard"];

  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Active paper profile banner ──────────────────────────────────── */}
      <div className={`${pc.bg} ${pc.border} border rounded-2xl p-4 flex items-start gap-3`}>
        <Info className={`w-4 h-4 ${pc.text} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-semibold ${pc.text}`}>Calibrating: {profile.name}</p>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${pc.badge}`}>
              {profile.paperWidth}"×{profile.paperHeight}"
            </span>
          </div>
          <p className={`text-[10px] ${pc.text} opacity-75 mt-0.5`}>
            Check zone {profile.checkArea.height}" · MICR baseline {profile.micrBand.baseline}" from bottom · Clear band {profile.micrBand.clearBandHeight}"
          </p>
          {paperType !== "standard" && (
            <p className={`text-[10px] ${pc.text} opacity-60 mt-0.5`}>
              Calibration offsets are saved independently for this paper stock.
            </p>
          )}
        </div>
      </div>

      {/* ── Step 1: Layout ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Select your blank check paper layout</p>
            <p className="text-xs text-slate-400 mt-0.5">Where is the check section on your blank paper?</p>
          </div>
        </div>
        <div className="p-5 grid grid-cols-3 gap-3">
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              onClick={() => { onChange({ ...calibration, paperLayout: l.id }); setStep("setup"); setMicrInput(""); }}
              className={cn(
                "flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 text-center transition-all",
                calibration.paperLayout === l.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              )}
            >
              {l.diagram}
              <div>
                <p className={cn("text-xs font-semibold", calibration.paperLayout === l.id ? "text-blue-700" : "text-slate-700")}>{l.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{l.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 2: Print ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Print the calibration grid</p>
            <p className="text-xs text-slate-400 mt-0.5">Load <strong>blank check paper</strong> into your printer first.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 leading-relaxed space-y-1.5">
              <p className="font-semibold">How the 3-column grid works</p>
              <p>
                Like a Cricut calibration page, the sheet prints <strong>three side-by-side columns</strong> — LEFT, MIDDLE, and RIGHT — each running row codes <strong>A0 through K9</strong> top to bottom. Every row is exactly <strong>0.1 inch</strong> tall. The MIDDLE column (marked ★) is your primary reference.
              </p>
              <p>
                After printing on your blank check paper, find the highlighted <strong>"MICR NUMBERS"</strong> row in the MIDDLE column and read its 2-character label (like <strong>D5</strong>). Enter that in Step 3. If LEFT and RIGHT show a <em>different</em> code at the MICR line, your paper may be feeding at an angle.
              </p>
            </div>
          </div>

          {/* Miniature preview of what the printed grid looks like */}
          <div className="border border-slate-200 rounded-xl overflow-hidden font-mono text-[9px]">
            <div className="flex bg-slate-700 text-slate-300 divide-x divide-slate-600">
              <div className="w-8 shrink-0" />
              <div className="flex-1 text-center py-1 text-slate-400 text-[8px]">LEFT</div>
              <div className="flex-1 text-center py-1 text-amber-400 font-bold text-[8px]">MIDDLE ★</div>
              <div className="flex-1 text-center py-1 text-slate-400 text-[8px]">RIGHT</div>
            </div>
            {[
              { label: "D3", field: false },
              { label: "D4", field: false },
              { label: "D5", field: true, text: "MICR NUMBERS" },
              { label: "D6", field: false },
            ].map((r, i) => (
              <div key={i} className={cn("flex items-center divide-x divide-slate-100 h-5", r.field ? "bg-amber-50 border-t border-amber-300" : "")}>
                <div className={cn("w-8 text-right pr-1.5 shrink-0 font-bold", r.field ? "text-amber-700" : "text-slate-400")}>{r.label}</div>
                {[0, 1, 2].map(ci => (
                  <div key={ci} className={cn("flex-1 px-1.5 truncate", ci === 1 && r.field ? "font-bold text-amber-700" : "text-slate-300")}>
                    {r.field
                      ? (ci === 1 ? `◀◀  ${r.text}  ▶▶` : `─── ${r.text} ───`)
                      : (ci === 0 ? "A B C D E F G H I J" : ci === 1 ? "1 2 3 4 5 6 7 8 9 0" : "Z Y X W V U T S R Q")
                    }
                  </div>
                ))}
              </div>
            ))}
            <div className="bg-slate-50 px-3 py-1.5 text-[8px] text-slate-400">
              In this example the MICR row label is <strong className="text-slate-600">D5</strong> — you'd enter that in Step 3.
            </div>
          </div>

          <Button onClick={handlePrintCalibration} className="gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl">
            <Printer className="w-4 h-4" />
            Print Calibration Grid
          </Button>
          {step !== "setup" && (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Calibration grid sent to printer.
            </p>
          )}
        </div>
      </div>

      {/* ── Step 3: Enter measurement ────────────────────────────────────── */}
      <div className={cn(
        "bg-white rounded-2xl border border-slate-200 overflow-hidden transition-opacity",
        step === "setup" ? "opacity-40 pointer-events-none" : "opacity-100"
      )}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Read the MIDDLE column and enter the MICR row label</p>
            <p className="text-xs text-slate-400 mt-0.5">Look at the amber highlighted row in the MIDDLE column. What 2-character label is shown? (e.g. D5)</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">
              MICR row label from MIDDLE column
            </label>
            <div className="flex gap-2 items-start">
              <div className="flex-1 max-w-[140px]">
                <Input
                  type="text"
                  maxLength={2}
                  placeholder={`e.g. ${expLabel}`}
                  value={micrInput}
                  onChange={e => { setMicrInput(e.target.value.toUpperCase()); setMicrError(""); }}
                  className="h-10 text-lg text-center rounded-xl border-slate-200 font-mono tracking-widest uppercase"
                />
                {micrError && <p className="text-xs text-red-500 mt-1">{micrError}</p>}
                <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                  Expected: <span className="font-mono font-semibold text-slate-600">{expLabel}</span>
                  {" · "}A0 = top of page, K9 = bottom
                  {calibration.topOffsetIn !== 0 && (
                    <span className="block mt-0.5 text-slate-400">
                      (includes {calibration.topOffsetIn >= 0 ? "+" : ""}{calibration.topOffsetIn.toFixed(2)}" current offset)
                    </span>
                  )}
                </p>
              </div>
              <Button
                onClick={handleCalculateOffset}
                disabled={micrInput.trim().length < 2}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-1.5 h-10"
              >
                <Target className="w-3.5 h-3.5" />
                Calculate
              </Button>
            </div>
          </div>

          <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick label reference</p>
            <div className="grid grid-cols-4 gap-1">
              {["A=0–1\"", "B=1–2\"", "C=2–3\"", "D=3–4\"", "E=4–5\"", "F=5–6\"", "G=6–7\"", "H=7–8\"", "I=8–9\"", "J=9–10\"", "K=10–11\"", "digit=0.1\""].map(s => (
                <span key={s} className="text-[9px] text-slate-400 font-mono">{s}</span>
              ))}
            </div>
          </div>

          {step === "done" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800">
                <p className="font-semibold">Offset applied!</p>
                <p className="mt-0.5">
                  Top offset: <span className="font-mono font-bold">{calibration.topOffsetIn >= 0 ? "+" : ""}{calibration.topOffsetIn.toFixed(2)}"</span>.
                  Print the calibration grid again to verify alignment.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Fine-tune ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Fine-tune offsets</p>
            <p className="text-xs text-slate-400 mt-0.5">Nudge ±0.05" (1.27 mm) after calibration.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Vertical</p>
              <div className="flex items-center gap-2">
                <button onClick={() => nudgeTop(-0.05)} disabled={calibration.topOffsetIn <= -1}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors" title="Move UP">
                  <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-sm font-mono font-bold text-slate-800">{calibration.topOffsetIn >= 0 ? "+" : ""}{calibration.topOffsetIn.toFixed(2)}"</p>
                  <p className="text-[9px] text-slate-400">{calibration.topOffsetIn > 0 ? "down" : calibration.topOffsetIn < 0 ? "up" : "center"}</p>
                </div>
                <button onClick={() => nudgeTop(0.05)} disabled={calibration.topOffsetIn >= 1}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors" title="Move DOWN">
                  <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Horizontal</p>
              <div className="flex items-center gap-2">
                <button onClick={() => nudgeLeft(-0.05)} disabled={calibration.leftOffsetIn <= -0.5}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors" title="Move LEFT">
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-sm font-mono font-bold text-slate-800">{calibration.leftOffsetIn >= 0 ? "+" : ""}{calibration.leftOffsetIn.toFixed(2)}"</p>
                  <p className="text-[9px] text-slate-400">{calibration.leftOffsetIn > 0 ? "right" : calibration.leftOffsetIn < 0 ? "left" : "center"}</p>
                </div>
                <button onClick={() => nudgeLeft(0.05)} disabled={calibration.leftOffsetIn >= 0.5}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors" title="Move RIGHT">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>
          </div>
          {(calibration.topOffsetIn !== 0 || calibration.leftOffsetIn !== 0) && (
            <button onClick={resetOffsets} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset offsets to zero
            </button>
          )}
        </div>
      </div>

      {/* ── Current settings summary ────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Current calibration:
              <span className="text-slate-500 font-normal ml-1">
                {LAYOUTS.find(l => l.id === calibration.paperLayout)?.label}
                {" · "}top {calibration.topOffsetIn >= 0 ? "+" : ""}{calibration.topOffsetIn.toFixed(2)}"
                {" · "}left {calibration.leftOffsetIn >= 0 ? "+" : ""}{calibration.leftOffsetIn.toFixed(2)}"
              </span>
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Settings are saved automatically</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrintCalibration} className="gap-1.5 rounded-xl text-xs">
          <Printer className="w-3.5 h-3.5" /> Print again
        </Button>
      </div>
    </div>
  );
}
