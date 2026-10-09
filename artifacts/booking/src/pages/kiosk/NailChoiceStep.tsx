/**
 * The kiosk's nail steps in the nail-salon look (length · shape · design), laid out after the salon's
 * reference artwork: a cream page, a centred serif title with a copper stroke under it, and two cards a row —
 * picture on the left; name, stroke, one-line description and a blush "ribbon" style note on the right.
 *
 * PICTURES. Each card shows the salon's own image for that option when it has one; otherwise the kiosk
 * artwork uploaded for it in the admin Illustration library ("Nail Kiosk" group — the slots are listed in
 * shared/kioskArt.ts); otherwise a stand-in: a plain silhouette for a nail shape, an empty panel for the rest.
 * DECORATION. Corner flowers and a background are drawn once uploaded there, and don't appear until then.
 */
import { createContext, useContext, useState } from "react";
import { kioskArtSlug, type KioskArtKind } from "@shared/kioskArt";

/** The kiosk artwork uploaded in the admin Illustration library ("Nail Kiosk" group): slug → picture. */
const NO_ART: Record<string, string> = {};
const ArtContext = createContext<Record<string, string>>(NO_ART);
const useArt = (kind: KioskArtKind, name: string): string | undefined => useContext(ArtContext)[kioskArtSlug(kind, name)];

export interface NailChoice {
  nailVocabId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** True when imageUrl is the salon's own upload (not a stock photo the server filled in). */
  ownImage?: boolean;
  swatchHex: string | null;
  priceAdjustment: number;
}

export interface KioskLook {
  bg: string; surface: string; primary: string; primarySoft: string; border: string;
  text: string; muted: string; subtle: string; tint: string; shadow: string; shadowLg: string;
}

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

/** What the standard shapes look like and say. Keyed by the shape's name, lower-cased, spaces as "_". */
const SHAPES: Record<string, { tip: string; description: string; note: string }> = {
  square:        { tip: "L78 14 Q78 8 72 8 L28 8 Q22 8 22 14",       description: "Straight edges with flat tip.",            note: "Clean & Modern Style" },
  squoval:       { tip: "L78 26 Q78 8 60 8 L40 8 Q22 8 22 26",       description: "Flat tip, softly rounded corners.",    note: "Soft & Versatile" },
  round:         { tip: "L78 42 Q78 12 50 12 Q22 12 22 42",          description: "Short with soft circular edge.",           note: "Simple & Practical" },
  oval:          { tip: "L78 56 Q76 6 50 6 Q24 6 22 56",             description: "Rounded tip with soft curve.",             note: "Natural & Timeless" },
  almond:        { tip: "L76 82 Q70 22 50 6 Q30 22 24 82",           description: "Slim sides, softly rounded tip.",          note: "Feminine & Elegant Look" },
  coffin:        { tip: "L64 11 Q63 6 58 6 L42 6 Q37 6 36 11",       description: "Tapered sides, flat squared tip.",     note: "Trendy & Bold" },
  ballerina:     { tip: "L60 9 Q59 4 55 4 L45 4 Q41 4 40 9",         description: "Slender taper, narrow flat tip.",    note: "Graceful & Refined" },
  stiletto:      { tip: "L73 86 L50 2 L27 86",                       description: "Long and sharply pointed.",                note: "Dramatic & Edgy" },
  lipstick:      { tip: "L78 14 Q78 8 73 10 L25 30 Q22 31 22 36",    description: "Angled tip, cut on a slant.",              note: "Playful & Unique" },
  flare:         { tip: "L90 16 Q91 10 85 10 L15 10 Q9 10 10 16",    description: "Widens toward a flat tip.",                note: "Statement & Fun" },
  mountain_peak: { tip: "L78 62 L50 22 L22 62",                      description: "Short with a pointed tip.",                note: "Sharp & Chic" },
};
const shapeKey = (name: string) => name.trim().toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[\s-]+/g, "_");

/** Optional decoration (corner flowers, background): drawn only once its picture has been uploaded. */
function Decor({ name, style }: { name: string; style: React.CSSProperties }) {
  const src = useArt("decor", name);
  if (!src) return null;
  return <img src={src} alt="" aria-hidden style={{ position: "absolute", pointerEvents: "none", userSelect: "none", ...style }} />;
}

/** The hand-drawn-looking stroke under a title or a name. */
function Stroke({ color, width }: { color: string; width: string }) {
  return (
    <svg viewBox="0 0 200 12" preserveAspectRatio="none" style={{ width, height: "0.42em", display: "block" }} aria-hidden>
      <path d="M2 8 C 40 2, 90 3, 198 5" stroke={color} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".9" />
      <path d="M30 10 C 70 7, 120 7, 170 9" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".55" />
    </svg>
  );
}

function Picture({ choice, kind, look, chosen }: { choice: NailChoice | null; kind: "length" | "shape" | "design"; look: KioskLook; chosen: boolean }) {
  const [broken, setBroken] = useState(false);
  // The salon's own picture wins, then the kiosk artwork for that option, then a stand-in.
  const art = useArt(kind, choice ? choice.name : "Plain");
  const shape = choice && kind === "shape" ? SHAPES[shapeKey(choice.name)] : undefined;
  const own = choice?.imageUrl && choice.ownImage !== false ? choice.imageUrl : undefined;
  const src = own || art || (!shape ? choice?.imageUrl ?? undefined : undefined);
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: choice?.swatchHex || `linear-gradient(160deg, ${look.tint}, ${look.primarySoft})` }} data-placeholder>
      {shape && (
        <svg viewBox="0 0 100 150" style={{ height: "82%", width: "auto" }} aria-hidden>
          <defs>
            <linearGradient id="kx-polish" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6cfc9" /><stop offset="1" stopColor="#e9a9a6" />
            </linearGradient>
          </defs>
          <path d={`M22 120 Q22 144 50 144 Q78 144 78 120 ${shape.tip} Z`} fill="url(#kx-polish)" stroke="#c98f86" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M33 118 L33 60" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".45" />
        </svg>
      )}
    </div>
  );
}

/**
 * The "help me choose" guide: six hand types and the shapes that flatter each. `shapes` are keys into SHAPES;
 * only the ones the salon offers for this service are shown. `lengths` (lower-cased length names) get a
 * "Suggested" note when the client goes on to pick a length.
 * Hand pictures come from the kiosk artwork ("Hand — Short Fingers"…): an empty panel until uploaded.
 */
const HANDS: { key: string; title: string; about: string; tip: string; shapes: string[]; lengths?: string[] }[] = [
  { key: "short_fingers", title: "Short Fingers", about: "Fingers look shorter than the palm. Create the look of length.", tip: "Avoid very short or wide shapes.", shapes: ["almond", "oval"] },
  { key: "long_fingers",  title: "Long Fingers",  about: "Fingers longer than the palm. Keep them balanced and elegant.", tip: "Ballerina or almond looks softer.", shapes: ["square", "coffin"] },
  { key: "wide_hands",    title: "Wide Hands",    about: "Wider palm, fingers set apart. Go for a more slender look.", tip: "Square shapes can widen the hand.", shapes: ["almond", "oval"] },
  { key: "slim_hands",    title: "Slim Hands",    about: "Narrow palm, slender fingers. Play up the elegance.", tip: "Most shapes suit you. Go bold.", shapes: ["stiletto", "coffin", "almond"] },
  { key: "petite_hands",  title: "Petite Hands",  about: "Smaller hands, shorter fingers. Keep it soft and in proportion.", tip: "Short to medium lengths sit best.", shapes: ["oval", "squoval"], lengths: ["short", "medium"] },
  { key: "large_hands",   title: "Large Hands",   about: "Larger palm, longer fingers. Balance the size.", tip: "Medium to long lengths look beautiful.", shapes: ["coffin", "square", "almond"], lengths: ["medium", "long"] },
];

function HandPicture({ name, look }: { name: string; look: KioskLook }) {
  const src = useArt("hand", name);
  if (src) return <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }} />;
  return <div data-placeholder style={{ width: "100%", height: "100%", background: `linear-gradient(160deg, ${look.tint}, ${look.primarySoft})` }} />;
}

function Ribbon({ children, look, size }: { children: React.ReactNode; look: KioskLook; size: string }) {
  return (
    <span style={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: size, color: look.text, padding: "3px 14px 4px",
      background: `linear-gradient(90deg, ${look.primarySoft}, #f3cfc8 45%, ${look.primarySoft})`, borderRadius: "14px 30px 12px 26px / 26px 12px 30px 14px" }}>{children}</span>
  );
}

/** The guide screen. Tap a shape on a hand card, then a length — and that is the choice made. */
function HandGuide(p: {
  shapes: NailChoice[]; lengths: NailChoice[]; look: KioskLook; navBtn: React.CSSProperties;
  priceLabel: (adj: number) => string;
  onPickBoth: (shape: NailChoice, length: NailChoice) => void;
  onClose: () => void;
}) {
  const { look } = p;
  const offered = new Map(p.shapes.map((sh) => [shapeKey(sh.name), sh]));
  const hands = HANDS.map((h) => ({ ...h, picks: h.shapes.map((k) => offered.get(k)).filter((x): x is NailChoice => !!x) })).filter((h) => h.picks.length > 0);
  const [picked, setPicked] = useState<{ shape: NailChoice; suggested: string[] } | null>(null);
  return (
    <>
      <header className="shrink-0 relative text-center" style={{ padding: "clamp(14px, 2.6vh, 30px) 32px clamp(6px, 1.2vh, 14px)" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: look.primary }}>Find the most flattering shape for your hands</p>
        <h2 style={{ margin: "4px 0 0", fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(30px, 4.2vw, 54px)", lineHeight: 1.1, color: look.text }}>Which hands are most like yours?</h2>
        <div style={{ display: "flex", justifyContent: "center", fontSize: "clamp(30px, 4.2vw, 54px)" }}><Stroke color={look.primary} width="min(34vw, 380px)" /></div>
      </header>

      <main className="flex-1 min-h-0 relative" style={{ padding: "clamp(6px, 1.4vh, 16px) clamp(20px, 4vw, 64px)" }} data-testid="kiosk-nail-guide">
        <div style={{ height: "100%", maxWidth: 1240, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: `repeat(${Math.ceil(hands.length / 2)}, minmax(0, 1fr))`, gap: "clamp(8px, 1.2vh, 12px)" }}>
          {hands.map((h) => (
            <div key={h.key} style={{ minHeight: 0, minWidth: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0, 17%) minmax(0, 1fr) auto", gap: "clamp(8px, 1vw, 14px)", alignItems: "center",
              padding: "clamp(8px, 1.2vh, 14px)", background: `linear-gradient(135deg, ${look.surface}, ${look.bg})`, border: `1px solid ${look.primary}70` }}>
              <div style={{ height: "100%", minHeight: 0 }}><HandPicture name={h.title} look={look} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(17px, min(1.95vw, 3.4vh), 26px)", lineHeight: 1.12, color: look.text, whiteSpace: "nowrap" }}>
                  {h.title}
                  <Stroke color={look.primary} width="clamp(70px, 60%, 150px)" />
                </div>
                <p style={{ margin: "clamp(4px, 0.8vh, 8px) 0 0", fontSize: "clamp(11px, min(1.1vw, 2vh), 15px)", lineHeight: 1.3, color: look.muted, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.about}</p>
                <p style={{ margin: "clamp(2px, 0.6vh, 6px) 0 0", fontSize: "clamp(10.5px, min(1.05vw, 1.9vh), 14px)", lineHeight: 1.3, fontStyle: "italic", color: look.subtle, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.tip}</p>
              </div>
              <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(3px, 0.6vh, 6px)" }}>
                <Ribbon look={look} size="clamp(11px, min(1.1vw, 1.9vh), 15px)">Best nail shapes</Ribbon>
                <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "clamp(5px, 0.6vw, 8px)" }}>
                  {h.picks.map((sh) => (
                    <button key={sh.nailVocabId} type="button" aria-label={`${h.title}: ${sh.name}`} data-testid={`kiosk-nail-guide-${h.key}-${sh.nailVocabId}`}
                      onPointerDown={(e) => { e.preventDefault(); setPicked({ shape: sh, suggested: h.lengths ?? [] }); }}
                      className="transition-transform duration-150 active:scale-[0.95]"
                      style={{ height: "100%", width: "clamp(50px, 5vw, 64px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 3px 3px", borderRadius: 12,
                        background: `linear-gradient(180deg, ${look.tint}, ${look.primarySoft})`, border: `1px solid ${look.border}` }}>
                      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <LengthNail shape={sh} grow={0.92} picture />
                      </div>
                      <div style={{ fontSize: "clamp(11px, min(1.1vw, 1.9vh), 14px)", fontWeight: 700, color: look.text, whiteSpace: "nowrap" }}>{sh.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="shrink-0 relative flex items-center justify-between" style={{ padding: "clamp(8px, 1.6vh, 18px) clamp(20px, 4vw, 64px) clamp(12px, 2.2vh, 24px)" }}>
        <button type="button" style={p.navBtn} onPointerDown={(e) => { e.preventDefault(); p.onClose(); }} data-testid="kiosk-nail-guide-close">See all shapes</button>
        <p style={{ margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(14px, 1.4vw, 18px)", color: look.muted }}>Only a guide. Wear what makes you feel beautiful.</p>
      </footer>

      {picked && (
        <div className="kx-sheet-fade" style={{ position: "absolute", inset: 0, background: "rgba(59,42,38,.28)", display: "flex", alignItems: "flex-end" }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setPicked(null); }} data-testid="kiosk-nail-guide-lengths">
          <div className="kx-sheet-rise" style={{ width: "100%", background: look.surface, borderRadius: "26px 26px 0 0", borderTop: `1px solid ${look.border}`, boxShadow: "0 -14px 40px rgba(59,42,38,.18)", padding: "clamp(14px, 2.4vh, 26px) clamp(20px, 4vw, 64px) clamp(16px, 2.6vh, 28px)" }}>
            <div style={{ maxWidth: 1240, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(24px, 3vw, 38px)", color: look.text }}>
                  {picked.shape.name} <span style={{ fontWeight: 600, fontStyle: "italic", color: look.muted, fontSize: "0.7em" }}>— choose your length</span>
                </div>
                <button type="button" style={{ ...p.navBtn, minWidth: 0, padding: "10px 24px", fontSize: 18 }} onPointerDown={(e) => { e.preventDefault(); setPicked(null); }}>Close</button>
              </div>
              <div style={{ marginTop: "clamp(10px, 1.8vh, 18px)", display: "grid", gridTemplateColumns: `repeat(${p.lengths.length}, minmax(0, 1fr))`, gap: "clamp(8px, 1vw, 14px)", height: "clamp(150px, 26vh, 220px)" }}>
                {p.lengths.map((len, li) => {
                  const price = p.priceLabel(picked.shape.priceAdjustment + len.priceAdjustment);
                  const suggested = picked.suggested.includes(len.name.trim().toLowerCase());
                  return (
                    <button key={len.nailVocabId} type="button" aria-label={`${picked.shape.name}, ${len.name}`} data-testid={`kiosk-nail-guide-length-${len.nailVocabId}`}
                      onPointerDown={(e) => { e.preventDefault(); p.onPickBoth(picked.shape, len); }}
                      className="transition-transform duration-150 active:scale-[0.96]"
                      style={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px 6px", borderRadius: 14,
                        background: `linear-gradient(180deg, ${look.tint}, ${look.primarySoft})`, border: `${suggested ? 2 : 1}px solid ${suggested ? look.primary : look.border}` }}>
                      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <LengthNail shape={picked.shape} grow={p.lengths.length > 1 ? 0.5 + (0.5 * li) / (p.lengths.length - 1) : 1} />
                      </div>
                      <div style={{ fontSize: "clamp(13px, min(1.35vw, 2.2vh), 18px)", fontWeight: 700, letterSpacing: ".04em", color: look.text, whiteSpace: "nowrap" }}>
                        {len.name}{price && <span style={{ color: look.primary, marginLeft: 5 }}>{price}</span>}
                      </div>
                      {picked.suggested.length > 0 && <div style={{ height: "1.2em", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(11px, 1.1vw, 14px)", color: look.primary }}>{suggested ? "Suggested" : ""}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const PER_PAGE = 6;

/** One nail at one length (the guide): the shape's silhouette drawn to that length. */
function LengthNail({ shape, grow, picture }: { shape: NailChoice; grow: number; picture?: boolean }) {
  // `picture`: where the nail stands for the shape itself (the guide's shape buttons), use its artwork.
  const art = useArt("shape", shape.name);
  if (picture && art) return <img src={art} alt="" style={{ maxWidth: "100%", height: "100%", objectFit: "cover" }} />;
  const info = SHAPES[shapeKey(shape.name)];
  if (!info) return null;
  return (
    <svg viewBox="0 0 100 150" preserveAspectRatio="none" style={{ height: `${Math.round(grow * 100)}%`, width: "clamp(30px, 3.6vw, 48px)" }} aria-hidden data-placeholder>
      <path d={`M22 120 Q22 144 50 144 Q78 144 78 120 ${info.tip} Z`} fill="#eeb7b1" stroke="#c98f86" strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d="M33 118 L33 60" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

export function NailChoiceStep(p: {
  kind: "length" | "shape" | "design";
  title: string;
  serviceName?: string;
  options: NailChoice[];
  selectedId: number | null | undefined;
  /** A first card for "none" (the design step, when a design isn't required). */
  plainLabel?: string;
  onPick: (choice: NailChoice | null) => void;
  /**
   * The "help me choose" guide, offered beside Back: hand types and the shapes that flatter each. Picking a
   * shape and then a length there answers both the length and the shape step at once.
   */
  guide?: { shapes: NailChoice[]; lengths: NailChoice[]; onPickBoth: (shape: NailChoice, length: NailChoice) => void };
  onBack: () => void;
  backLabel: string;
  look: KioskLook;
  fmtPrice: (n: number) => string;
  /** Kiosk artwork from the admin Illustration library: slug → picture. */
  art?: Record<string, string>;
  /** Any touch on the step (paging, the guide) — lets the kiosk hold off its idle reset. */
  onActivity?: () => void;
}) {
  const { look } = p;
  const cards: (NailChoice | null)[] = p.plainLabel ? [null, ...p.options] : p.options;
  const perPage = PER_PAGE;
  const pages = Math.max(1, Math.ceil(cards.length / perPage));
  const [page, setPage] = useState(() => {
    const at = cards.findIndex((c) => (c ? c.nailVocabId === p.selectedId : p.selectedId === null));
    return at > 0 ? Math.floor(at / perPage) : 0;
  });
  const shown = cards.slice(page * perPage, page * perPage + perPage);
  const priceLabel = (adj: number) => (adj > 0 ? `+${p.fmtPrice(adj)}` : adj < 0 ? `−${p.fmtPrice(Math.abs(adj))}` : "");
  const [guide, setGuide] = useState(false);
  const hasGuide = !!p.guide?.lengths.length && HANDS.some((h) => h.shapes.some((k) => p.guide!.shapes.some((o) => shapeKey(o.name) === k)));
  const navBtn: React.CSSProperties = {
    minWidth: 150, padding: "14px 30px", borderRadius: 999, border: `1.5px solid ${look.border}`, background: look.surface,
    color: look.text, fontFamily: SERIF, fontSize: 20, fontWeight: 600, boxShadow: look.shadow,
  };

  return (
    <ArtContext.Provider value={p.art ?? NO_ART}>
    <div className="fixed inset-0 flex flex-col select-none" onContextMenu={(e) => e.preventDefault()} onPointerDownCapture={() => p.onActivity?.()} data-testid={`kiosk-nail-${p.kind}`}
      style={{ background: `radial-gradient(1200px 700px at 80% -10%, ${look.surface}, transparent 60%), linear-gradient(180deg, ${look.bg}, ${look.primarySoft})`, color: look.text, WebkitUserSelect: "none", userSelect: "none", overflow: "hidden" }}>
      <Decor name="Background" style={{ inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />
      <Decor name="Corner top left" style={{ left: 0, top: 0, width: "min(17vw, 230px)" }} />
      <Decor name="Corner bottom left" style={{ left: 0, bottom: 0, width: "min(19vw, 260px)" }} />
      <Decor name="Corner bottom right" style={{ right: 0, bottom: 0, width: "min(22vw, 300px)" }} />

      {guide && p.guide && <HandGuide shapes={p.guide.shapes} lengths={p.guide.lengths} look={look} navBtn={navBtn} priceLabel={priceLabel} onClose={() => setGuide(false)} onPickBoth={p.guide.onPickBoth} />}

      {!guide && <>
      <header className="shrink-0 relative text-center" style={{ padding: "clamp(14px, 2.6vh, 30px) 32px clamp(6px, 1.2vh, 14px)" }}>
        {p.serviceName && <p style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: look.primary }}>{p.serviceName}</p>}
        <h2 style={{ margin: "4px 0 0", fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(32px, 4.6vw, 58px)", lineHeight: 1.1, color: look.text }}>{p.title}</h2>
        <div style={{ display: "flex", justifyContent: "center", fontSize: "clamp(32px, 4.6vw, 58px)" }}><Stroke color={look.primary} width="min(34vw, 380px)" /></div>
      </header>

      <main className="flex-1 min-h-0 relative" style={{ padding: "clamp(6px, 1.4vh, 16px) clamp(20px, 4vw, 64px)" }}>
        <div style={{ height: "100%", maxWidth: 1240, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: "clamp(8px, 1.2vh, 12px)" }}>
          {shown.map((c, i) => {
            const chosen = c ? p.selectedId === c.nailVocabId : p.selectedId === null;
            const info = c && p.kind === "shape" ? SHAPES[shapeKey(c.name)] : undefined;
            const description = c?.description || info?.description || "";
            const price = c ? priceLabel(c.priceAdjustment) : "";
            return (
              <button key={c?.nailVocabId ?? `plain-${i}`} type="button" onPointerDown={(e) => { e.preventDefault(); p.onPick(c); }}
                data-testid={`kiosk-nail-card-${c?.nailVocabId ?? "plain"}`} aria-pressed={chosen}
                className="text-left transition-transform duration-150 active:scale-[0.985]"
                style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 36%) minmax(0, 1fr)", gap: "clamp(14px, 1.8vw, 26px)", alignItems: "center",
                  overflow: "hidden", height: "100%", background: chosen ? look.primarySoft : `linear-gradient(135deg, ${look.surface}, ${look.bg})`,
                  // Plain squared panels with a hairline copper rule, as in the salon's reference artwork.
                  border: `1px solid ${look.primary}${chosen ? "" : "70"}`, outline: chosen ? `2px solid ${look.primary}` : "none", outlineOffset: -3 }}>
                <div style={{ height: "100%", minHeight: 0 }}><Picture choice={c} kind={p.kind} look={look} chosen={chosen} /></div>
                <div style={{ minWidth: 0, paddingRight: "clamp(12px, 1.6vw, 22px)" }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(21px, min(2.6vw, 4.2vh), 34px)", lineHeight: 1.1, color: look.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c ? c.name : p.plainLabel}
                    <Stroke color={look.primary} width="clamp(90px, 62%, 190px)" />
                  </div>
                  {description && (
                    <p style={{ margin: "clamp(4px, 0.7vh, 8px) 0 0", fontSize: "clamp(13px, min(1.4vw, 2.3vh), 19px)", lineHeight: 1.25, color: look.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      <span style={{ color: look.primary }}>•</span>&nbsp; {description}
                    </p>
                  )}
                  {(info?.note || price) && (
                    <div style={{ marginTop: "clamp(5px, 0.9vh, 10px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      {info?.note && (
                        <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: "clamp(13px, min(1.4vw, 2.2vh), 18px)", color: look.text, padding: "3px 16px 4px",
                          background: `linear-gradient(90deg, ${look.primarySoft}, #f3cfc8 45%, ${look.primarySoft})`, borderRadius: "14px 30px 12px 26px / 26px 12px 30px 14px" }}>{info.note}</span>
                      )}
                      {price && <span style={{ fontSize: "clamp(15px, 1.5vw, 20px)", fontWeight: 700, color: look.primary }}>{price}</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="shrink-0 relative flex items-center justify-between" style={{ padding: "clamp(8px, 1.6vh, 18px) clamp(20px, 4vw, 64px) clamp(12px, 2.2vh, 24px)" }}>
        <button type="button" style={navBtn} onPointerDown={(e) => { e.preventDefault(); p.onBack(); }} data-testid="kiosk-nail-back">{p.backLabel}</button>
        {hasGuide && (
          <button type="button" className="kx-help" data-testid="kiosk-nail-help" onPointerDown={(e) => { e.preventDefault(); setGuide(true); }}
            style={{ marginLeft: 18, marginRight: "auto", padding: "9px 20px", borderRadius: 999, background: look.primarySoft, border: `1.5px solid ${look.primary}`, color: look.text,
              fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: "clamp(14px, 1.4vw, 17px)", ["--kx-ring" as any]: look.primary }}>
            Need help choosing?
          </button>
        )}
        {pages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 8 }} aria-hidden>
              {Array.from({ length: pages }, (_, i) => <span key={i} style={{ width: i === page ? 26 : 9, height: 9, borderRadius: 999, background: i === page ? look.primary : look.border, transition: "width .2s" }} />)}
            </div>
            <button type="button" style={{ ...navBtn, background: look.primary, borderColor: look.primary, color: "#fff" }}
              onPointerDown={(e) => { e.preventDefault(); setPage((n) => (n + 1) % pages); }} data-testid="kiosk-nail-more">
              {page + 1 < pages ? "More" : "First page"}
            </button>
          </div>
        )}
      </footer>
      </>}
    </div>
    </ArtContext.Provider>
  );
}
