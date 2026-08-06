import { useState, useRef, useCallback, useEffect } from "react";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useMicrFont } from "@/hooks/use-micr-font";
import { DesktopOnlyNotice } from "@/components/DesktopOnlyNotice";

// ─── Check physical dimensions — standard business payroll blank stock ────────
const CHECK_W_IN = 8.5;
const CHECK_H_IN = 3.667;

// ─── Types ──────────────────────────────────────────────────────────────────
type FontStyle = "Regular" | "Bold" | "Italic" | "Bold Italic";

interface CheckItem {
  id: string;
  label: string;
  text: string;
  x: number;        // inches from left edge of check
  y: number;        // inches from top edge of check
  visible: boolean;
  fontName: string;
  fontSize: number; // points
  fontStyle: FontStyle;
  multiline?: boolean;
  isMicr?: boolean;
  isLine?: boolean;
  xEnd?: number;
  yEnd?: number;
}

// ─── Default layout — professional U.S. payroll check (ADP / Paychex style) ──
const DEFAULT_ITEMS: CheckItem[] = [
  // ── Company info (top-left, 0.25" margins) ────────────────────────────────
  {
    id: "companyName", label: "Company Name",
    text: "Acme Supplies Corp.",
    x: 0.25, y: 0.25, visible: true,
    fontName: "Arial", fontSize: 11, fontStyle: "Bold",
  },
  {
    id: "companyAddress", label: "Company Address",
    text: "475 Knapp Avenue\nAnytown, USA 10101",
    x: 0.25, y: 0.40, visible: true,
    fontName: "Arial", fontSize: 9, fontStyle: "Regular", multiline: true,
  },
  {
    id: "companyPhone", label: "Company Phone",
    text: "555-012-3456",
    x: 0.25, y: 0.60, visible: true,
    fontName: "Arial", fontSize: 9, fontStyle: "Regular",
  },
  // ── Check info box (top-right) — label left / value right columns ─────────
  {
    id: "checkNumLabel", label: "Check Number Label",
    text: "Check No.:",
    x: 5.50, y: 0.25, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Bold",
  },
  {
    id: "checkNumber", label: "Check Number",
    text: "000001",
    x: 7.75, y: 0.25, visible: true,
    fontName: "Courier New", fontSize: 8, fontStyle: "Bold",
  },
  {
    id: "dateLabel", label: "Date Label",
    text: "Pay Date:",
    x: 5.50, y: 0.38, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Bold",
  },
  {
    id: "date", label: "Date",
    text: "July 19, 2026",
    x: 6.90, y: 0.38, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Regular",
  },
  {
    id: "periodLabel", label: "Period Label",
    text: "Pay Period:",
    x: 5.50, y: 0.51, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Bold",
  },
  {
    id: "periodValue", label: "Period Value",
    text: "Jul 5, 2026 \u2013 Jul 19, 2026",
    x: 6.60, y: 0.51, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Regular",
  },
  // ── PAY TO THE ORDER OF ────────────────────────────────────────────────────
  {
    id: "payToLabel", label: "Pay To Label",
    text: "PAY TO THE ORDER OF:",
    x: 0.25, y: 1.10, visible: true,
    fontName: "Arial", fontSize: 7, fontStyle: "Bold",
  },
  {
    id: "payeeName", label: "Payee Name",
    text: "Jane Lee Dow",
    x: 0.25, y: 1.24, visible: true,
    fontName: "Arial", fontSize: 12, fontStyle: "Bold",
  },
  {
    id: "payeeAddrName", label: "Payee Street",
    text: "123 Main Street",
    x: 0.25, y: 1.42, visible: true,
    fontName: "Arial", fontSize: 9, fontStyle: "Regular",
  },
  {
    id: "payeeAddress", label: "Payee City/State/ZIP",
    text: "Anytown, IN 12345",
    x: 0.25, y: 1.55, visible: true,
    fontName: "Arial", fontSize: 9, fontStyle: "Regular",
  },
  // ── Amount row — security asterisk format ──────────────────────────────────
  {
    id: "amountLabel", label: "Amount Label",
    text: "AMOUNT:",
    x: 0.25, y: 1.85, visible: true,
    fontName: "Arial", fontSize: 8, fontStyle: "Bold",
  },
  {
    id: "amountWritten", label: "Amount Written",
    text: "*** TWO HUNDRED NINETY-ONE AND 90/100 DOLLARS ***",
    x: 0.95, y: 1.85, visible: true,
    fontName: "Arial", fontSize: 9, fontStyle: "Regular",
  },
  {
    id: "Amount", label: "Dollar Amount",
    text: "$291.90",
    x: 7.60, y: 1.83, visible: true,
    fontName: "Courier New", fontSize: 11, fontStyle: "Bold",
  },
  // ── Signature (bottom-right, above MICR) — thin line style ───────────────
  {
    id: "signatureLine", label: "Signature Line",
    text: "________________________",
    x: 5.00, y: 2.42, visible: true,
    fontName: "Arial", fontSize: 10, fontStyle: "Regular",
  },
  {
    id: "authorizedSig", label: "Authorized Signature",
    text: "Authorized Signature",
    x: 5.08, y: 2.56, visible: true,
    fontName: "Arial", fontSize: 6, fontStyle: "Regular",
  },
  {
    id: "voidText", label: "Void Text",
    text: "Void after 90 days",
    x: 5.20, y: 2.66, visible: true,
    fontName: "Arial", fontSize: 6, fontStyle: "Regular",
  },
  // ── Bank info — hidden by default; bank info conveyed through MICR line ───
  // Enable and move to upper check area (near check info box) if desired.
  {
    id: "bankName", label: "Bank Name",
    text: "First National Bank",
    x: 3.50, y: 0.25, visible: false,
    fontName: "Arial", fontSize: 7, fontStyle: "Bold",
  },
  {
    id: "bankAddress", label: "Bank Address",
    text: "Street Address\nCity State ZIP",
    x: 3.50, y: 0.38, visible: false,
    fontName: "Arial", fontSize: 6, fontStyle: "Regular", multiline: true,
  },
  // ── MICR line — ANSI X9.27: centered in 0.625" band, ~0.25" above bottom ─
  {
    id: "micrLine", label: "MICR Line",
    text: "\u2446122000496\u2446  \u24464964040110\u2446\u2447  0001\u2446",
    x: 1.00, y: 3.10, visible: true,
    fontName: "Courier New", fontSize: 12, fontStyle: "Regular", isMicr: true,
  },
];

const FONT_NAMES = [
  "Times New Roman", "Arial", "Helvetica", "Courier New", "Georgia",
  "Verdana", "Tahoma", "Trebuchet MS", "Garamond",
];
const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
const FONT_STYLES: FontStyle[] = ["Regular", "Bold", "Italic", "Bold Italic"];

const STORAGE_KEY = "certxa_check_layout_v2";

function loadSaved(): CheckItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CheckItem[];
  } catch {}
  return DEFAULT_ITEMS.map(i => ({ ...i }));
}

// ─── Ruler component ─────────────────────────────────────────────────────────
function HRuler({ checkRef }: { checkRef: React.RefObject<HTMLDivElement | null> }) {
  const [pxPerIn, setPxPerIn] = useState(96);
  useEffect(() => {
    const update = () => {
      if (checkRef.current) {
        const rect = checkRef.current.getBoundingClientRect();
        setPxPerIn(rect.width / CHECK_W_IN);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [checkRef]);

  const ticks: JSX.Element[] = [];
  const totalTicks = Math.ceil(CHECK_W_IN * 8); // every 0.125"
  for (let i = 0; i <= totalTicks; i++) {
    const inchVal = i / 8;
    const px = inchVal * pxPerIn;
    const isMajor = i % 8 === 0;
    const isHalf = i % 4 === 0 && !isMajor;
    const isQtr = i % 2 === 0 && !isHalf && !isMajor;
    const h = isMajor ? 14 : isHalf ? 10 : isQtr ? 7 : 4;
    ticks.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: px,
          bottom: 0,
          width: 1,
          height: h,
          backgroundColor: "#555",
        }}
      />,
    );
    if (isMajor && inchVal > 0) {
      ticks.push(
        <div
          key={`label-${i}`}
          style={{
            position: "absolute",
            left: px - 4,
            top: 1,
            fontSize: 9,
            color: "#333",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {inchVal}
        </div>,
      );
    }
  }

  return (
    <div
      style={{
        position: "relative",
        height: 22,
        backgroundColor: "#e8e8e8",
        borderBottom: "1px solid #aaa",
        marginLeft: 22,
        width: `${CHECK_W_IN}in`,
        flexShrink: 0,
      }}
    >
      {ticks}
    </div>
  );
}

function VRuler({ checkRef }: { checkRef: React.RefObject<HTMLDivElement | null> }) {
  const [pxPerIn, setPxPerIn] = useState(96);
  useEffect(() => {
    const update = () => {
      if (checkRef.current) {
        const rect = checkRef.current.getBoundingClientRect();
        setPxPerIn(rect.height / CHECK_H_IN);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [checkRef]);

  const ticks: JSX.Element[] = [];
  const totalTicks = Math.ceil(CHECK_H_IN * 8);
  for (let i = 0; i <= totalTicks; i++) {
    const inchVal = i / 8;
    const px = inchVal * pxPerIn;
    const isMajor = i % 8 === 0;
    const isHalf = i % 4 === 0 && !isMajor;
    const isQtr = i % 2 === 0 && !isHalf && !isMajor;
    const w = isMajor ? 14 : isHalf ? 10 : isQtr ? 7 : 4;
    ticks.push(
      <div
        key={i}
        style={{
          position: "absolute",
          top: px,
          right: 0,
          height: 1,
          width: w,
          backgroundColor: "#555",
        }}
      />,
    );
    if (isMajor && inchVal > 0) {
      ticks.push(
        <div
          key={`label-${i}`}
          style={{
            position: "absolute",
            top: px - 5,
            left: 2,
            fontSize: 9,
            color: "#333",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {inchVal}
        </div>,
      );
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: 22,
        height: `${CHECK_H_IN}in`,
        backgroundColor: "#e8e8e8",
        borderRight: "1px solid #aaa",
        flexShrink: 0,
      }}
    >
      {ticks}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function CheckLayoutEditor() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<CheckItem[]>(loadSaved);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_ITEMS[15].id); // Dollar Amount
  const [showMicr, setShowMicr] = useState(true);

  const checkRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    itemId: string;
    startMouseX: number;
    startMouseY: number;
    startItemX: number;
    startItemY: number;
    pxPerIn: number;
  } | null>(null);

  const selectedItem = items.find(i => i.id === selectedId) ?? items[0];

  // ── Update a single field on the selected item ───────────────────────────
  const updateItem = useCallback((id: string, patch: Partial<CheckItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  // ── Drag logic ───────────────────────────────────────────────────────────
  const handleItemMouseDown = useCallback((e: React.MouseEvent, item: CheckItem) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(item.id);
    if (!checkRef.current) return;
    const rect = checkRef.current.getBoundingClientRect();
    const pxPerIn = rect.width / CHECK_W_IN;
    dragState.current = {
      itemId: item.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      pxPerIn,
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = (e.clientX - ds.startMouseX) / ds.pxPerIn;
      const dy = (e.clientY - ds.startMouseY) / ds.pxPerIn;
      const newX = Math.max(0, Math.min(CHECK_W_IN - 0.1, ds.startItemX + dx));
      const newY = Math.max(0, Math.min(CHECK_H_IN - 0.1, ds.startItemY + dy));
      setItems(prev =>
        prev.map(it =>
          it.id === ds.itemId
            ? { ...it, x: Math.round(newX * 100) / 100, y: Math.round(newY * 100) / 100 }
            : it,
        ),
      );
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Save / restore ───────────────────────────────────────────────────────
  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    toast({ title: "Layout saved", description: "Check layout has been saved." });
  };

  const handleRestoreDefault = () => {
    const defaults = DEFAULT_ITEMS.map(i => ({ ...i }));
    setItems(defaults);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    toast({ title: "Restored", description: "Layout reset to defaults." });
  };

  // ── CSS font helpers ─────────────────────────────────────────────────────
  const fontWeight = (fs: FontStyle) =>
    fs === "Bold" || fs === "Bold Italic" ? "bold" : "normal";
  const fontStyleCss = (fs: FontStyle) =>
    fs === "Italic" || fs === "Bold Italic" ? "italic" : "normal";

  const itemStyle = (item: CheckItem): React.CSSProperties => ({
    position: "absolute",
    left: `${item.x}in`,
    top: `${item.y}in`,
    // MICR must use monospace fallback so Courier New renders correctly in
    // browsers that don't have it — matches the PrintChecks page rendering.
    fontFamily: item.isMicr
      ? `'${item.fontName}', Courier, monospace`
      : `'${item.fontName}', Arial, sans-serif`,
    fontSize: `${item.fontSize}pt`,
    fontWeight: fontWeight(item.fontStyle),
    fontStyle: fontStyleCss(item.fontStyle),
    color: item.id === selectedId ? "#cc0000" : "#000",
    whiteSpace: item.multiline || item.isMicr ? "pre" : "nowrap",
    cursor: "move",
    userSelect: "none",
    lineHeight: 1.3,
    // 0.18em matches the PrintChecks MICR rendering exactly
    letterSpacing: item.isMicr ? "0.18em" : undefined,
    padding: "1px 2px",
    outline: item.id === selectedId ? "1px dashed #cc0000" : "none",
  });

  return (
    <DesktopOnlyNotice title="Check Layout Editor" description="This drag-and-drop print designer requires a large screen. Open it on a desktop or laptop.">
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#c8c8c8",
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      {/* ── Title bar ── */}
      <div
        style={{
          backgroundColor: "#003080",
          color: "#fff",
          padding: "4px 10px",
          fontSize: 13,
          fontWeight: "bold",
          flexShrink: 0,
        }}
      >
        Certxa — Check Layout Editor
        <span style={{ fontWeight: "normal", fontSize: 11, marginLeft: 16, opacity: 0.85 }}>
          {CHECK_W_IN}" × {CHECK_H_IN}" · Drag items to reposition · Selected item shown in red
        </span>
      </div>

      {/* ── Check canvas area ── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: "#a0a0a0",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <HRuler checkRef={checkRef} />
        <div style={{ display: "flex", flexDirection: "row" }}>
          <VRuler checkRef={checkRef} />

          {/* The actual check — CSS in units = physical/actual size */}
          <div
            ref={checkRef}
            style={{
              position: "relative",
              width: `${CHECK_W_IN}in`,
              height: `${CHECK_H_IN}in`,
              backgroundImage: "url('/check-background.png')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              border: "1.5px solid #1a3a7a",
              boxSizing: "border-box",
              flexShrink: 0,
              overflow: "hidden",
            }}
            onClick={() => setSelectedId("")}
          >
            {/* Horizontal divider lines matching the image layout */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "0.95in",
                borderTop: "0.5px solid #bbb",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "1.38in",
                borderTop: "0.5px solid #bbb",
              }}
            />
            {/* MICR zone — ANSI X9.27: 0.55" band + 0.075" clearance = 0.625" total */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "0.625in",
                backgroundColor: "#fff",
                borderTop: "0.5px solid #ccc",
              }}
            />

            {/* Render items */}
            {items
              .filter(item => item.visible && (showMicr || !item.isMicr))
              .map(item => (
                <div
                  key={item.id}
                  style={itemStyle(item)}
                  onMouseDown={e => handleItemMouseDown(e, item)}
                  onClick={e => { e.stopPropagation(); setSelectedId(item.id); }}
                >
                  {item.text}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Editor panel ── */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: "#d4d0c8",
          borderTop: "2px solid #808080",
          padding: "6px 8px",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 8,
          minHeight: 220,
        }}
      >
        {/* Left: Item Picker + Properties */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Item Picker */}
          <PanelBox label="Item Picker">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={selectStyle}
            >
              {items.map(it => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
            </select>
          </PanelBox>

          {/* Item Properties */}
          <PanelBox label="Item Properties">
            <PropRow label="Visible">
              <input
                type="checkbox"
                checked={selectedItem?.visible ?? true}
                onChange={e => updateItem(selectedId, { visible: e.target.checked })}
              />
            </PropRow>
            <PropRow label="Item Name">
              <input
                style={{ ...inputStyle, color: "#888", backgroundColor: "#e8e8e8" }}
                value={selectedItem?.label ?? ""}
                readOnly
              />
            </PropRow>
            <PropRow label="Item Text">
              <input
                style={inputStyle}
                value={selectedItem?.text.replace(/\n/g, " ↵ ") ?? ""}
                onChange={e =>
                  updateItem(selectedId, { text: e.target.value.replace(/ ↵ /g, "\n") })
                }
              />
            </PropRow>
            <PropRow label="Font Name">
              <select
                style={selectStyle}
                value={selectedItem?.fontName ?? "Times New Roman"}
                onChange={e => updateItem(selectedId, { fontName: e.target.value })}
              >
                {FONT_NAMES.map(f => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label="Font Size">
              <select
                style={{ ...selectStyle, width: 70 }}
                value={selectedItem?.fontSize ?? 10}
                onChange={e => updateItem(selectedId, { fontSize: Number(e.target.value) })}
              >
                {FONT_SIZES.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label="Font Style">
              <select
                style={selectStyle}
                value={selectedItem?.fontStyle ?? "Regular"}
                onChange={e =>
                  updateItem(selectedId, { fontStyle: e.target.value as FontStyle })
                }
              >
                {FONT_STYLES.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </PropRow>
          </PanelBox>
        </div>

        {/* Right: Actions + Location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Action buttons */}
          <PanelBox label="Action">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ActionBtn onClick={handleSave}>Save</ActionBtn>
              <ActionBtn onClick={() => navigate("/payouts/checks")}>Close</ActionBtn>
              <ActionBtn onClick={handleRestoreDefault}>Restore to Default</ActionBtn>
              <ActionBtn
                onClick={() =>
                  toast({
                    title: "Check Layout Editor",
                    description:
                      "Select an item from the picker, then drag it on the check to reposition. Edit font, size, and text in Item Properties. X/Y positions are in inches from the top-left corner of the check.",
                  })
                }
              >
                Help
              </ActionBtn>
            </div>
          </PanelBox>

          {/* Item Location */}
          <PanelBox label="Item Location">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
              <LocationField
                label="X Position"
                value={selectedItem?.x ?? 0}
                onChange={v => updateItem(selectedId, { x: v })}
              />
              <LocationField
                label="X End Position"
                value={selectedItem?.xEnd ?? 0}
                onChange={v => updateItem(selectedId, { xEnd: v })}
                disabled={!selectedItem?.isLine}
              />
              <LocationField
                label="Y Position"
                value={selectedItem?.y ?? 0}
                onChange={v => updateItem(selectedId, { y: v })}
              />
              <LocationField
                label="Y End Position"
                value={selectedItem?.yEnd ?? 0}
                onChange={v => updateItem(selectedId, { yEnd: v })}
                disabled={!selectedItem?.isLine}
              />
            </div>

            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <PropRow label="Line Size">
                <select style={{ ...selectStyle, width: 90 }} disabled>
                  <option />
                </select>
              </PropRow>
            </div>

            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Image</div>
              <textarea
                style={{
                  width: "100%",
                  height: 36,
                  fontSize: 11,
                  border: "1px solid #888",
                  backgroundColor: "#f0f0f0",
                  resize: "none",
                  padding: 2,
                }}
                disabled
              />
            </div>
          </PanelBox>

          {/* MICR + note row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "4px 2px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={showMicr}
                onChange={e => setShowMicr(e.target.checked)}
              />
              Display MICR line
            </label>
            <span style={{ color: "#c00000", fontSize: 11, fontStyle: "italic" }}>
              Note: Drag the red item to adjust location.
            </span>
          </div>
        </div>
      </div>
    </div>
    </DesktopOnlyNotice>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PanelBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset
      style={{
        border: "1px solid #808080",
        margin: 0,
        padding: "2px 6px 6px",
        backgroundColor: "#d4d0c8",
      }}
    >
      <legend
        style={{
          fontSize: 11,
          padding: "0 4px",
          color: "#000",
          fontWeight: "normal",
        }}
      >
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 2,
        fontSize: 11,
      }}
    >
      <span style={{ width: 72, color: "#333", flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "2px 12px",
        fontSize: 12,
        border: "1px solid #808080",
        backgroundColor: "#d4d0c8",
        cursor: "pointer",
        boxShadow: "1px 1px 0 #fff inset, -1px -1px 0 #808080 inset",
        minWidth: 60,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function LocationField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      <span style={{ width: 90, flexShrink: 0, color: disabled ? "#888" : "#333" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #888", backgroundColor: disabled ? "#e8e8e8" : "#fff" }}>
        <input
          type="number"
          step="0.01"
          min={0}
          max={10}
          value={value.toFixed(2)}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{
            width: 52,
            border: "none",
            outline: "none",
            fontSize: 11,
            padding: "1px 3px",
            backgroundColor: "transparent",
            color: disabled ? "#888" : "#000",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #aaa" }}>
          <button
            disabled={disabled}
            onClick={() => !disabled && onChange(Math.round((value + 0.01) * 100) / 100)}
            style={{ ...spinBtn, borderBottom: "1px solid #aaa" }}
          >
            ▲
          </button>
          <button
            disabled={disabled}
            onClick={() => !disabled && onChange(Math.max(0, Math.round((value - 0.01) * 100) / 100))}
            style={spinBtn}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared style objects ────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  border: "1px solid #888",
  padding: "1px 4px",
  fontSize: 11,
  width: "100%",
  backgroundColor: "#fff",
  height: 18,
};

const selectStyle: React.CSSProperties = {
  border: "1px solid #888",
  padding: "1px 2px",
  fontSize: 11,
  backgroundColor: "#fff",
  height: 20,
  width: "100%",
};

const spinBtn: React.CSSProperties = {
  width: 14,
  height: 9,
  fontSize: 6,
  border: "none",
  padding: 0,
  lineHeight: 1,
  cursor: "pointer",
  backgroundColor: "#d4d0c8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
