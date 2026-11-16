/**
 * The Order Board's service workflow (shared/kiosk/serviceFlows.ts; owner, 2026-11-16): after the client's service,
 * one question a screen — length, shape, what's on their nails now, polish, design, adding a pedicure or manicure —
 * then one upgrade with a line on what it does for them. A choice moves straight on; Back goes a screen back (from
 * the first, back to the board). Nothing changes on the ticket until the last screen: then `onDone` hands over the
 * answers, the add-ons to put on (removal, gel polish, the upgrade) and any change of service.
 */
import { useRef, useState } from "react";
import {
  FLOW_STEPS, ENHANCEMENT_REMOVAL, GEL_POLISH, GEL_REMOVAL, addonsForService, isFill, pickUpgrade, serviceKind, upgradeFamily,
  type FlowStep, type OnNow, type ServiceFlowSettings, type ServiceKind, type UpgradeFamily,
} from "@shared/kiosk/serviceFlows";
import { SHAPE_ADDON, isNailShapeArt, nailLengthArtUrl, nailShapeArtUrl, nailShapeLabel, sortNailShapes } from "@shared/kiosk/nailShapeArt";
import type { BoardColors } from "./KioskOrderBoard";

export interface FlowService { id: number; name: string; category: string; price: number; duration: number; imageUrl?: string | null; optionCount?: number }
export interface FlowAddon { id: number; name: string; price: number; serviceIds: number[]; kioskExtra?: boolean; imageUrl?: string | null }
export interface FlowNailOption { nailVocabId: number; name: string; imageUrl: string | null; swatchHex: string | null; priceAdjustment: number }
export interface FlowNailConfig { sizes: FlowNailOption[]; shapes: FlowNailOption[]; effects: FlowNailOption[] }

export interface FlowPlan<S extends FlowService, A extends FlowAddon> {
  kind: ServiceKind;
  steps: FlowStep[];
  removal: { gel: A | null; enhancement: A | null };
  gelPolish: A | null;
  /** The salon's "Shape: …" add-ons: the shape question picks one and it goes on the ticket (included $0, else priced). */
  shapeAddons: A[];
  /** swap: a mani-pedi service takes the place of the client's service; else the chosen one is added. */
  crossSell: { toes: boolean; swap: boolean; options: S[] } | null;
  upgrade: { addon: A; pitch: string; family: UpgradeFamily; usual: boolean } | null;
}

/** What this client's service asks, given the salon's catalog and the kiosk's limits. Empty steps: nothing to ask. */
export function planServiceFlow<S extends FlowService, A extends FlowAddon>(a: {
  service: S; nail: FlowNailConfig | null; services: S[]; addons: A[]; selected: S[]; chosenAddonIds: number[];
  settings: ServiceFlowSettings; maxServices: number; maxVisitMinutes: number;
  /** Add-ons this client has had before, most often first (Smart Check-In). */
  usualAddonIds?: number[];
}): FlowPlan<S, A> {
  const kind = serviceKind(a.service.name, a.service.category);
  const pool = a.addons.filter((x) => !x.kioskExtra);
  const removal = {
    gel: pool.find((x) => GEL_REMOVAL.test(x.name) && !ENHANCEMENT_REMOVAL.test(x.name)) ?? null,
    enhancement: pool.find((x) => ENHANCEMENT_REMOVAL.test(x.name)) ?? null,
  };
  const gelPolish = /gel|shellac/i.test(a.service.name) ? null : addonsForService(pool, a.service.id).find((x) => GEL_POLISH.test(x.name)) ?? null;

  let crossSell: FlowPlan<S, A>["crossSell"] = null;
  if (kind === "manicure" || kind === "pedicure") {
    const want: ServiceKind = kind === "manicure" ? "pedicure" : "manicure";
    const kindOf = (s: S) => serviceKind(s.name, s.category);
    const has = a.selected.some((s) => { const k = kindOf(s); return k === want || k === "manipedi"; });
    // Services that ask their own option first are left out: the offer adds a service in one tap.
    const plain = a.services.filter((s) => !s.optionCount);
    const combos = plain.filter((s) => kindOf(s) === "manipedi").sort((x, y) => x.price - y.price);
    const others = a.selected.filter((s) => s.id !== a.service.id);
    const minutes = a.selected.reduce((n, s) => n + s.duration, 0);
    const fits = (s: S) => a.selected.length < a.maxServices && minutes + s.duration <= a.maxVisitMinutes;
    if (!has && combos.length && !others.length) crossSell = { toes: want === "pedicure", swap: true, options: combos.slice(0, 6) };
    else if (!has) {
      const adds = plain.filter((s) => kindOf(s) === want && fits(s)).sort((x, y) => x.price - y.price).slice(0, 6);
      if (adds.length) crossSell = { toes: want === "pedicure", swap: false, options: adds };
    }
  }
  const shapeAddons = sortNailShapes(a.addons.filter((x) => SHAPE_ADDON.test(x.name) && (!x.serviceIds.length || x.serviceIds.includes(a.service.id))));
  const upgrade = pickUpgrade(kind, pool, a.service.id, a.settings, a.chosenAddonIds, a.usualAddonIds);
  const steps = FLOW_STEPS[kind].filter((st) => {
    if (st === "length") return !!a.nail?.sizes?.length;
    if (st === "shape") return !!a.nail?.shapes?.length;
    if (st === "design") return !!a.nail?.effects?.length;
    if (st === "onNow") return !isFill(a.service.name);
    if (st === "polish") return !!gelPolish;
    if (st === "crossSell") return !!crossSell;
    return !!upgrade;
  });
  return { kind, steps, removal, gelPolish, shapeAddons, crossSell, upgrade };
}

export interface FlowResult<S, A> {
  size: FlowNailOption | null; shape: FlowNailOption | null; effect: FlowNailOption | null;
  addAddons: A[];
  swapTo: S | null; addService: S | null;
  /** The upgrade the client was shown (yes or no), for Kiosk Builder › Upgrade offers. */
  upgradeShown: A | null;
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const u = (px: number) => `min(${(px / 10.8).toFixed(3)}cqw, ${px}px)`;

interface Choice { key: string; title: string; sub?: string | null; imageUrl?: string | null; swatch?: string | null; on: boolean; pick: () => void;
  /** A shape card: the transparent picture of the shape, and a second name ("Ballerina"). */
  art?: string | null; note?: string | null }

export function KioskServiceFlow<S extends FlowService, A extends FlowAddon>(p: {
  service: S; plan: FlowPlan<S, A>; nail: FlowNailConfig | null;
  colors: BoardColors; showPrice: boolean; serif?: boolean;
  labels: {
    back: string; noThanks: string; length: string; shape: string; design: string;
    onNowTitle: string; onNowToesTitle: string; onNowNothing: string; onNowPolish: string; onNowGel: string; onNowEnhancement: string;
    removalPrice: (price: string) => string; polishTitle: string; included: string; gelLasts: string; noDesign: string;
    addPedicureTitle: string; addManicureTitle: string; upgradeTitle: (name: string) => string; yesAddIt: string;
    pitch: Record<UpgradeFamily, string>; upgradeAgainTitle: (name: string) => string; usualPitch: string;
  };
  onBack: () => void;
  onDone: (r: FlowResult<S, A>) => void;
}) {
  const c = p.colors, L = p.labels, plan = p.plan;
  const [at, setAt] = useState(0);
  // The answers, kept as they're given (a tap's answer is read the same moment when it's the last screen).
  const ans = useRef<{ size: FlowNailOption | null; shape: FlowNailOption | null; effect: FlowNailOption | null | "none";
    onNow: OnNow | null; gel: boolean | null; cross: S | null | "none"; shapeAddon: A | null }>({ size: null, shape: null, effect: null, onNow: null, gel: null, cross: null, shapeAddon: null });
  const { size, shape, effect, onNow, gel, cross } = ans.current;
  const setSize = (v: FlowNailOption) => { ans.current.size = v; };
  const setShape = (v: FlowNailOption) => { ans.current.shape = v; };
  const setEffect = (v: FlowNailOption | "none") => { ans.current.effect = v; };
  const setOnNow = (v: OnNow) => { ans.current.onNow = v; };
  const setGel = (v: boolean) => { ans.current.gel = v; };
  const setCross = (v: S | "none") => { ans.current.cross = v; };

  const step = plan.steps[at];
  const heading = p.serif ? "'Playfair Display', serif" : "'DM Sans', 'Inter', sans-serif";
  const press = (fn: () => void) => ({ onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); } });
  const toes = plan.kind === "pedicure";

  const finish = (upgradeYes: boolean) => {
    const { size, shape, effect, onNow, gel, cross } = ans.current;
    const addAddons: A[] = [];
    if (onNow === "gel" && plan.removal.gel) addAddons.push(plan.removal.gel);
    if (onNow === "enhancement" && plan.removal.enhancement) addAddons.push(plan.removal.enhancement);
    if (gel && plan.gelPolish) addAddons.push(plan.gelPolish);
    if (ans.current.shapeAddon) addAddons.push(ans.current.shapeAddon);
    if (upgradeYes && plan.upgrade) addAddons.push(plan.upgrade.addon);
    const chosen = cross && cross !== "none" ? cross : null;
    p.onDone({ size, shape, effect: effect === "none" ? null : effect, addAddons,
      swapTo: chosen && plan.crossSell?.swap ? chosen : null, addService: chosen && !plan.crossSell?.swap ? chosen : null,
      upgradeShown: step === "upgrade" && plan.upgrade ? plan.upgrade.addon : null });
  };
  // On to the next screen; after the last, done (the upgrade screen finishes itself). No upgrade offer of the same
  // kind as the design just chosen (Chrome Powder after Chrome).
  const next = () => {
    const e = ans.current.effect;
    const sameAsDesign = plan.steps[at + 1] === "upgrade" && plan.upgrade && e && e !== "none" && upgradeFamily(e.name) === plan.upgrade.family;
    return at + 1 < plan.steps.length && !sameAsDesign ? setAt(at + 1) : finish(false);
  };
  const back = () => (at === 0 ? p.onBack() : setAt(at - 1));

  const nailChoices = (opts: FlowNailOption[], cur: FlowNailOption | null, set: (o: FlowNailOption) => void): Choice[] =>
    opts.map((o) => ({ key: String(o.nailVocabId), title: o.name, imageUrl: o.imageUrl, swatch: o.swatchHex, on: cur?.nailVocabId === o.nailVocabId,
      sub: p.showPrice && o.priceAdjustment > 0 ? `+${money(o.priceAdjustment)}` : null, pick: () => { set(o); next(); } }));

  let title = "";
  let choices: Choice[] = [];
  if (step === "length") {
    title = L.length;
    // The shape they just chose, drawn at each length (owner, 2026-11-16), when that shape has its pictures.
    const shapeName = ans.current.shapeAddon?.name ?? ans.current.shape?.name ?? null;
    choices = nailChoices(p.nail?.sizes ?? [], size, setSize).map((ch, i) => ({ ...ch, art: nailLengthArtUrl(shapeName, (p.nail?.sizes ?? [])[i]?.name ?? "") }));
  }
  const lengthCards = step === "length" && choices.some((ch) => ch.art);
  const shapeCards = step === "shape" && plan.shapeAddons.length > 0;
  if (step === "shape") {
    title = L.shape;
    // The salon's shape add-ons, when it has them: the shape goes on the ticket as "Shape: Almond" with its price.
    choices = shapeCards
      ? plan.shapeAddons.map((a) => {
          const { title: t, note } = nailShapeLabel(a.name);
          return { key: `shape-${a.id}`, title: t, note, art: nailShapeArtUrl(a.name) ?? a.imageUrl ?? null, on: ans.current.shapeAddon?.id === a.id,
            sub: !p.showPrice ? null : a.price > 0 ? `+${money(a.price)}` : L.included,
            pick: () => { ans.current.shapeAddon = a; ans.current.shape = null; next(); } };
        })
      : nailChoices(p.nail?.shapes ?? [], shape, setShape);
  }
  if (step === "design") {
    title = L.design;
    choices = [{ key: "none", title: L.noDesign, on: effect === "none", pick: () => { setEffect("none"); next(); } },
      ...nailChoices(p.nail?.effects ?? [], effect === "none" ? null : effect, setEffect)];
  }
  if (step === "onNow") {
    title = toes ? L.onNowToesTitle : L.onNowTitle;
    const removal = (a: A | null) => (a && p.showPrice ? L.removalPrice(money(a.price)) : null);
    const opt = (key: OnNow, t: string, sub?: string | null): Choice => ({ key, title: t, sub, on: onNow === key, pick: () => { setOnNow(key); next(); } });
    choices = [opt("nothing", L.onNowNothing), opt("polish", L.onNowPolish), opt("gel", L.onNowGel, removal(plan.removal.gel)),
      ...(toes || plan.kind === "manipedi" ? [] : [opt("enhancement", L.onNowEnhancement, removal(plan.removal.enhancement))])];
  }
  if (step === "polish" && plan.gelPolish) {
    title = L.polishTitle;
    const regular: Choice = { key: "regular", title: L.onNowPolish, sub: L.included, on: gel === false, pick: () => { setGel(false); next(); } };
    const gelChoice: Choice = { key: "gel", title: L.onNowGel, sub: p.showPrice ? `+${money(plan.gelPolish.price)}` : null, on: gel === true, pick: () => { setGel(true); next(); } };
    // Manicures list gel first, with how long it lasts (owner, 2026-11-16).
    const fingers = plan.kind === "manicure" || plan.kind === "manipedi";
    choices = fingers ? [{ ...gelChoice, sub: [gelChoice.sub, L.gelLasts].filter(Boolean).join(" · ") }, regular] : [regular, gelChoice];
  }
  if (step === "crossSell" && plan.crossSell) {
    title = plan.crossSell.toes ? L.addPedicureTitle : L.addManicureTitle;
    choices = plan.crossSell.options.map((s) => ({ key: String(s.id), title: s.name, imageUrl: s.imageUrl ?? null, on: cross !== "none" && cross?.id === s.id,
      sub: p.showPrice ? money(s.price) : null, pick: () => { setCross(s); next(); } }));
  }
  const pictures = choices.some((x) => x.imageUrl || x.swatch);
  const cols = shapeCards || choices.length <= 4 ? 2 : 3;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: c.bg, color: c.text, userSelect: "none", overflow: "hidden", containerType: "inline-size" }} data-testid="kiosk-service-flow" data-step={step}>
      <header style={{ display: "flex", alignItems: "center", gap: u(20), padding: `${u(28)} ${u(28)} ${u(12)}` }}>
        <button type="button" {...press(back)} data-testid="flow-back" aria-label={L.back}
          style={{ width: u(52), height: u(52), borderRadius: u(26), border: `2px solid ${c.border}`, background: c.surface, color: c.text, fontSize: u(30), lineHeight: 1, display: "grid", placeItems: "center", flexShrink: 0 }}>‹</button>
        <span style={{ fontSize: u(22), fontWeight: 700, color: c.muted }}>{p.service.name}</span>
      </header>

      {step === "upgrade" && plan.upgrade ? (
        <>
          <div style={{ scrollbarWidth: "none", flex: 1, minHeight: u(0), overflowY: "auto", padding: `${u(40)} ${u(72)} ${u(24)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            {plan.upgrade.addon.imageUrl && (
              <img src={plan.upgrade.addon.imageUrl} alt="" draggable={false} style={{ width: u(560), maxWidth: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: u(32), boxShadow: "0 14px 36px rgba(15,23,42,.16)", marginBottom: u(40) }} />
            )}
            <h2 data-testid="flow-upgrade-title" style={{ margin: 0, fontSize: u(64), fontWeight: 900, lineHeight: 1.08, fontFamily: heading }}>{(plan.upgrade.usual ? L.upgradeAgainTitle : L.upgradeTitle)(plan.upgrade.addon.name)}</h2>
            {p.showPrice && <p style={{ margin: `${u(18)} 0 0`, fontSize: u(48), fontWeight: 900, color: c.primary }}>+{money(plan.upgrade.addon.price)}</p>}
            <p data-testid="flow-upgrade-pitch" style={{ margin: `${u(28)} 0 0`, maxWidth: u(860), fontSize: u(38), fontWeight: 600, lineHeight: 1.3 }}>
              {plan.upgrade.usual ? L.usualPitch : plan.upgrade.pitch || L.pitch[plan.upgrade.family]}
            </p>
          </div>
          <div style={{ flexShrink: 0, display: "flex", gap: u(24), padding: `${u(24)} ${u(72)} ${u(48)}` }}>
            <button type="button" {...press(() => finish(false))} data-testid="flow-upgrade-no"
              style={{ flex: 1, height: u(100), borderRadius: u(50), border: `3px solid ${c.text}`, background: c.surface, color: c.text, fontSize: u(30), fontWeight: 900 }}>{L.noThanks}</button>
            <button type="button" {...press(() => finish(true))} data-testid="flow-upgrade-yes"
              style={{ flex: 1, height: u(100), borderRadius: u(50), border: 0, background: c.primary, color: "#fff", fontSize: u(30), fontWeight: 900 }}>{L.yesAddIt}</button>
          </div>
        </>
      ) : (
        <>
          <h2 data-testid="flow-title" style={{ margin: 0, padding: `${u(16)} ${u(56)} ${u(32)}`, textAlign: "center", fontSize: u(56), fontWeight: 900, lineHeight: 1.1, fontFamily: heading }}>{title}</h2>
          <div style={{ scrollbarWidth: "none", flex: 1, minHeight: u(0), overflowY: "auto", padding: `${u(6)} ${u(48)} ${u(24)}`, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: u(22), alignContent: "start" }}>
            {lengthCards ? choices.map((ch) => (
              <button key={ch.key} type="button" {...press(ch.pick)} data-testid={`flow-choice-${ch.key}`} aria-pressed={ch.on}
                style={{ position: "relative", borderRadius: u(28), padding: `${u(16)} ${u(12)} ${u(18)}`, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: u(8),
                  background: c.surface, color: c.text, border: `4px solid ${ch.on ? c.primary : "transparent"}`,
                  boxShadow: ch.on ? `0 0 0 4px ${c.primary}26, 0 10px 24px rgba(15,23,42,.12)` : "0 6px 18px rgba(15,23,42,.10)" }}>
                <span style={{ width: "100%", aspectRatio: "2 / 3", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {ch.art && <img src={ch.art} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom", display: "block" }} />}
                </span>
                <span style={{ fontSize: u(34), fontWeight: 900, lineHeight: 1.1, fontFamily: heading }}>{ch.title}</span>
                {ch.sub && <span style={{ fontSize: u(26), fontWeight: 800, color: c.primary }}>{ch.sub}</span>}
              </button>
            )) : shapeCards ? choices.map((ch) => (
              <button key={ch.key} type="button" {...press(ch.pick)} data-testid={`flow-choice-${ch.key}`} aria-pressed={ch.on}
                style={{ position: "relative", borderRadius: u(28), padding: `${u(14)} ${u(18)} 0`, overflow: "hidden", display: "flex", alignItems: "stretch", gap: u(12), textAlign: "left",
                  minHeight: u(300), background: c.surface, color: c.text, border: `4px solid ${ch.on ? c.primary : "transparent"}`,
                  boxShadow: ch.on ? `0 0 0 4px ${c.primary}26, 0 10px 24px rgba(15,23,42,.12)` : "0 6px 18px rgba(15,23,42,.10)" }}>
                <span style={{ width: "44%", flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {ch.art && <img src={ch.art} alt="" draggable={false} style={{ width: "100%", maxHeight: u(286), objectFit: "contain", objectPosition: "bottom", display: "block" }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: u(6), paddingBottom: u(14) }}>
                  <span style={{ fontSize: u(40), fontWeight: 900, lineHeight: 1.05, fontFamily: heading }}>{ch.title}</span>
                  {ch.note && <span style={{ fontSize: u(26), fontWeight: 700, color: c.muted }}>({ch.note})</span>}
                  {ch.sub && <span style={{ fontSize: u(28), fontWeight: 800, color: ch.sub === L.included ? c.muted : c.primary }}>{ch.sub}</span>}
                </span>
              </button>
            )) : choices.map((ch) => (
              <button key={ch.key} type="button" {...press(ch.pick)} data-testid={`flow-choice-${ch.key}`} aria-pressed={ch.on}
                style={{ position: "relative", borderRadius: u(28), padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "center",
                  background: c.surface, color: c.text, border: `4px solid ${ch.on ? c.primary : "transparent"}`, minHeight: pictures ? undefined : u(190),
                  boxShadow: ch.on ? `0 0 0 4px ${c.primary}26, 0 10px 24px rgba(15,23,42,.12)` : "0 6px 18px rgba(15,23,42,.10)" }}>
                {pictures && (ch.imageUrl
                  ? <img src={ch.imageUrl} alt="" draggable={false} style={{ width: "100%", aspectRatio: "4 / 3", display: "block",
                      ...(isNailShapeArt(ch.imageUrl) ? { objectFit: "contain", objectPosition: "bottom", paddingTop: u(12) } : { objectFit: "cover" }) }} />
                  : <div style={{ width: "100%", aspectRatio: "4 / 3", display: "grid", placeItems: "center", background: c.tint }}>
                      {ch.swatch && <span style={{ width: u(110), height: u(110), borderRadius: "50%", background: ch.swatch, border: "4px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }} />}
                    </div>)}
                <div style={{ flex: 1, padding: `${u(20)} ${u(18)} ${u(22)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(8) }}>
                  <span style={{ fontSize: u(cols === 3 ? 26 : 32), fontWeight: 800, lineHeight: 1.15 }}>{ch.title}</span>
                  {ch.sub && <span style={{ fontSize: u(cols === 3 ? 22 : 26), fontWeight: 700, color: c.primary }}>{ch.sub}</span>}
                </div>
              </button>
            ))}
          </div>
          {step === "crossSell" && (
            <div style={{ flexShrink: 0, padding: `${u(16)} ${u(72)} ${u(48)}` }}>
              <button type="button" {...press(() => { setCross("none"); next(); })} data-testid="flow-cross-no"
                style={{ width: "100%", height: u(100), borderRadius: u(50), border: `3px solid ${c.text}`, background: c.surface, color: c.text, fontSize: u(30), fontWeight: 900 }}>{L.noThanks}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
