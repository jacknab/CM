/**
 * Front desk setup — the first time a salon opens the /nail POS (owner, 2026-10-31; plans/pos-setup.md).
 *
 * One question a screen, every answer saved as the owner moves on, through the same settings the rest of
 * Certxa uses: sales tax (POS Settings), the CARD button, cash price, the first cash drawer and its POS stations
 * register, tip choices, the turn method, the team's Tech IDs and the lock screen, and the salon's own manager
 * PIN (every salon starts on the shared 2026). Opens again from Manager › POS Setup.
 * Shown full screen in place of the POS until it is finished; it has to be finished before the front desk can be used (owner login).
 */
import { staffApi } from "@/lib/staffScreenApi";
import { appPage } from "@/lib/appProfile";
import { DEFAULT_PRINT_SETTINGS, printSettingsOf, type PrintSettings } from "@shared/printSettings";
import { printSettingsKey, savePrintSettings } from "@/lib/printSettings";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { barberWords } from "./barberWords";
import { TURN_MODES, TURN_PRESETS, formatTurns, isDollarMode, normalizeTurnRules, turnUnits, type TurnMode } from "@shared/turnRules";
import { DEFAULT_TIP_PRESETS, sanitizeTipPresets } from "@shared/tipPresets";
import { LIGHT_PAGE_BG } from "./touchKeys";
import type { NailLang } from "./i18n";

// The language buttons at the bottom, like the /kiosk welcome page: each name in its own language (not translated).
// /barber is English only: no language buttons.
const SETUP_LANGS: { code: NailLang; label: string }[] = [];

type CardProvider = "stripe" | "own" | "none";
interface TeamMember { id: number; name: string; role: string | null; techId: number | null; frontDesk: boolean; isOwner: boolean }
interface SetupRegister { id: number; name: string; isActive: boolean; isDefault: boolean; cashDrawerId: number | null }
interface SetupDrawer { id: number; name: string; startingCash: number; registerIds: number[]; mainStation: boolean }
interface SetupStatus {
  completed: boolean; canSetUp: boolean; stripeConnected: boolean; managerPinIsDefault: boolean;
  mainDrawer: { id: number; name: string; startingCash: number } | null; team: TeamMember[];
}

const STEPS = ["welcome", "tax", "card", "cash", "drawer", "tips", "printing", "turns", "team", "pin", "done"] as const;
type Step = (typeof STEPS)[number];

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || "Could not save. Please try again.");
  return data;
}

const ink = "#0f1f3d";
const muted = "#45546b";
const line = "#d5deea";
const brand = "#1f6fe0";

function Choice({ selected, onClick, title, detail, testId }: { selected: boolean; onClick: () => void; title: string; detail?: string; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className="w-full text-left rounded-2xl border-2 px-5 py-4 transition-colors"
      style={{ borderColor: selected ? brand : line, background: selected ? "#eef4ff" : "#fff" }}>
      <span className="flex items-center justify-between gap-3">
        <span className="text-[26px] font-semibold" style={{ color: ink }}>{title}</span>
        <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected ? brand : line, background: selected ? brand : "#fff" }}>
          {selected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
        </span>
      </span>
      {detail && <span className="block mt-1 text-[22px] leading-snug" style={{ color: muted }}>{detail}</span>}
    </button>
  );
}

function Toggle({ on, onChange, title, detail, testId }: { on: boolean; onChange: (v: boolean) => void; title: string; detail?: string; testId?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} data-testid={testId} aria-pressed={on}
      className="w-full flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 pos-white text-left" style={{ borderColor: line }}>
      <span>
        <span className="block text-[24px] font-semibold" style={{ color: ink }}>{title}</span>
        {detail && <span className="block text-[22px] mt-1" style={{ color: muted }}>{detail}</span>}
      </span>
      <span className="relative w-14 h-8 rounded-full shrink-0 transition-colors" style={{ background: on ? brand : "#cbd5e1" }}>
        <span className="absolute top-1 w-6 h-6 rounded-full pos-white shadow transition-all" style={{ left: on ? 28 : 4 }} />
      </span>
    </button>
  );
}

function MoneyField({ label, value, onChange, prefix, suffix, testId, max }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; testId?: string; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 pos-white" style={{ borderColor: line }}>
      <span className="text-[24px] font-semibold" style={{ color: ink }}>{label}</span>
      <span className="flex items-center gap-2 text-[28px] font-semibold" style={{ color: ink }}>
        {prefix}
        <input inputMode="decimal" value={value} data-testid={testId} aria-label={label}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"); if (max == null || !v || Number(v) <= max) onChange(v); }}
          className="w-36 h-14 rounded-xl border text-right px-3 text-[28px] font-semibold outline-none focus:ring-2" style={{ borderColor: line, color: ink }} />
        {suffix}
      </span>
    </label>
  );
}

export function PosSetupWizard({ storeId, onFinished, onClose, lang, onLang, barber = true }: {
  storeId: number; onFinished: () => void; onClose: () => void; lang: NailLang; onLang?: (l: NailLang) => void;
  /** /barber: a shop's words (shop, barber, Barber ID), and no lock-screen switch — /barber always asks for the Barber ID. */
  barber?: boolean;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Answers, starting from what the salon has now.
  const [taxRate, setTaxRate] = useState("0");
  const [taxable, setTaxable] = useState({ services: false, addons: false, products: true, giftCards: false });
  // null until chosen: with no Stripe account connected, the Stripe M2 reader isn't offered, so the owner picks.
  const [card, setCard] = useState<CardProvider | null>(null);
  const [cashPct, setCashPct] = useState("0");
  const [drawerName, setDrawerName] = useState("");
  const [startingCash, setStartingCash] = useState("200");
  const [registers, setRegisters] = useState<SetupRegister[]>([]);
  const [drawers, setDrawers] = useState<SetupDrawer[]>([]);
  const [drawerStations, setDrawerStations] = useState<string[]>([]);
  const [tips, setTips] = useState<string[]>(DEFAULT_TIP_PRESETS.map(String));
  const [turnSaved, setTurnSaved] = useState<Record<string, any>>({});
  const [mode, setMode] = useState<TurnMode>("classic");
  const [dollars, setDollars] = useState("30");
  const [partial, setPartial] = useState(0.5);
  const [lockScreen, setLockScreen] = useState(true);
  // What prints by itself (shared/printSettings.ts).
  const [printing, setPrinting] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  useEffect(() => {
    let alive = true;
    const get = (u: string) => fetch(u, { credentials: "include" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    Promise.all([
      get("/api/nail/pos-setup"),
      get(`/api/pos-settings/${storeId}`).catch(() => null),
      get("/api/card-provider").catch(() => null),
      get("/api/tip-presets").catch(() => null),
      get(`/api/turn/settings?storeId=${storeId}`).catch(() => null),
      get(staffApi("/screen-settings")).catch(() => null),
      get("/api/registers"),
      get("/api/cash-drawers"),
      get("/api/barber/print-settings").catch(() => null),
    ]).then(([s, pos, cp, tp, turn, screen, registerRows, drawerRows, print]) => {
      if (print) setPrinting(printSettingsOf({ printing: print }));
      if (!alive) return;
      setStatus(s);
      const activeRegisters = (registerRows as SetupRegister[]).filter((r) => r.isActive);
      const cashDrawers = drawerRows as SetupDrawer[];
      setRegisters(activeRegisters);
      setDrawers(cashDrawers);
      if (pos) {
        setTaxRate(String(Math.round(Number(pos.salesTaxRate ?? 0) * 100000) / 1000));
        setTaxable({ services: !!pos.taxServicesTaxable, addons: !!pos.taxAddonsTaxable, products: pos.taxProductsTaxable !== false, giftCards: !!pos.taxGiftCardsTaxable });
        setCashPct(String(pos.cashDiscountPercent ?? 0));
      }
      const savedCard: CardProvider = cp?.provider === "own" || cp?.provider === "none" ? cp.provider : "stripe";
      setCard(savedCard === "stripe" && !s.stripeConnected ? null : savedCard);
      if (tp) setTips(sanitizeTipPresets(tp.presets).map(String));
      if (turn) {
        const rules = normalizeTurnRules(turn);
        setTurnSaved(turn); setMode(rules.mode); setDollars(String(rules.dollarsPerTurn)); setPartial(rules.partialTurnValue);
      }
      if (screen) setLockScreen(screen.lockScreen !== false);
      if (s.mainDrawer) {
        setDrawerName(s.mainDrawer.name);
        setStartingCash(String(s.mainDrawer.startingCash));
        const drawer = cashDrawers.find((d) => d.id === s.mainDrawer.id);
        if (drawer) {
          const defaultStation = activeRegisters.find((r) => r.isDefault && r.cashDrawerId == null);
          const mainStationSelection = drawer.mainStation
            ? activeRegisters.length === 0 ? ["main"] : defaultStation ? [String(defaultStation.id)] : []
            : [];
          setDrawerStations([...drawer.registerIds.map(String), ...mainStationSelection]);
        }
      } else if (activeRegisters.length) {
        const defaultRegister = activeRegisters.find((r) => r.isDefault);
        if (defaultRegister) setDrawerStations([String(defaultRegister.id)]);
      } else {
        setDrawerStations(["main"]);
      }
    }).catch(() => alive && setLoadError("The front desk setup could not be loaded. Check the connection and try again."));
    return () => { alive = false; };
  }, [storeId]);

  // Card payments › Set up card payments: Certxa's Stripe setup (Payments › Payouts). Inside a Certxa app with no
  // page of its own for it, the full site opens on its own.
  const openStripeSetup = () => {
    const page = appPage("/payments/payouts");
    if (page) window.location.assign(page);
    else window.open(`${window.location.origin}/payments/payouts`, "_blank", "noopener");
  };

  const index = STEPS.indexOf(step);
  const go = (to: Step) => { setError(""); setStep(to); };
  const back = () => index > 0 && go(STEPS[index - 1]);

  const dollarsNum = Number(dollars);
  const turnRules = useMemo(() => normalizeTurnRules({ ...turnSaved, turnMode: mode, turnValueThreshold: dollarsNum, partialTurnValue: partial }), [turnSaved, mode, dollarsNum, partial]);

  /** Save this step's answer, then move on. */
  const next = async () => {
    setError("");
    setSaving(true);
    try {
      if (step === "tax") {
        const rate = Number(taxRate || 0);
        if (!Number.isFinite(rate) || rate < 0 || rate > 25) throw new Error("Enter a tax rate from 0% to 25%.");
        await send(`/api/pos-settings/${storeId}`, "PATCH", {
          salesTaxRate: (rate / 100).toFixed(4), taxServicesTaxable: taxable.services, taxAddonsTaxable: taxable.addons,
          taxProductsTaxable: taxable.products, taxGiftCardsTaxable: taxable.giftCards,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      } else if (step === "card") {
        if (!card) throw new Error("Choose how you take card payments.");
        await send("/api/card-provider", "PUT", { provider: card });
        void queryClient.invalidateQueries({ queryKey: ["/api/card-provider"] });
      } else if (step === "cash") {
        const pct = Number(cashPct || 0);
        if (!Number.isFinite(pct) || pct < 0 || pct > 10) throw new Error("Enter a cash discount from 0% to 10%.");
        await send(`/api/pos-settings/${storeId}/cash-discount`, "PUT", { percent: pct });
        void queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      } else if (step === "drawer") {
        const amount = Number(startingCash);
        if (startingCash === "" || !Number.isFinite(amount) || amount < 0) throw new Error("Enter how much cash the drawer starts each day with.");
        if (drawerStations.length === 0) throw new Error("Choose at least one POS station for this drawer.");
        const stationSelection = {
          registerIds: drawerStations.filter((id) => id !== "main").map(Number),
          mainStation: drawerStations.includes("main"),
        };
        const currentDrawer = status?.mainDrawer ?? null;
        const r = currentDrawer
          ? await send(`/api/cash-drawers/${currentDrawer.id}`, "PUT", {
            name: drawerName.trim() || "Cash", targetFloat: amount.toFixed(2), ...stationSelection,
          })
          : await send("/api/cash-drawers", "POST", {
            name: drawerName.trim() || "Cash", targetFloat: amount.toFixed(2), ...stationSelection,
          });
        const savedDrawer = {
          id: Number(r.id),
          name: r.name,
          startingCash: Number(r.targetFloat ?? amount),
        };
        setStatus((s) => (s ? { ...s, mainDrawer: savedDrawer } : s));
        setDrawers((existing) => [
          ...existing.filter((d) => d.id !== savedDrawer.id),
          { ...r, ...savedDrawer, registerIds: stationSelection.registerIds, mainStation: stationSelection.mainStation },
        ]);
        void queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] });
      } else if (step === "tips") {
        const entered = tips.map((t) => t.trim()).filter(Boolean);
        if (!entered.length || entered.some((t) => !/^\d{1,3}$/.test(t) || Number(t) < 1 || Number(t) > 100)) throw new Error("Enter tip percentages from 1 to 100.");
        await send("/api/tip-presets", "PUT", { presets: entered.map(Number) });
        void queryClient.invalidateQueries({ queryKey: ["/api/tip-presets"] });
      } else if (step === "printing") {
        setPrinting(await savePrintSettings(printing));
        void queryClient.invalidateQueries({ queryKey: printSettingsKey });
      } else if (step === "turns") {
        if (isDollarMode(mode) && !(dollarsNum >= 1 && dollarsNum <= 1000)) throw new Error("Enter the dollars for one turn.");
        await send(`/api/turn/settings?storeId=${storeId}`, "PUT", {
          turnMode: mode, ...(isDollarMode(mode) ? { turnValueThreshold: dollarsNum } : {}), ...(mode === "dollar" ? { partialTurnValue: partial } : {}),
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/turn/settings", storeId] });
        void queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      } else if (step === "team") {
        if (!barber) await send(staffApi("/screen-settings"), "PUT", { lockScreen });
        void queryClient.invalidateQueries({ queryKey: ["/api/barber/screen-settings"] });
      } else if (step === "pin") {
        if (status?.managerPinIsDefault) {
          if (!/^\d{4}$/.test(pin)) throw new Error("The manager PIN is 4 digits.");
          if (pin !== pin2) throw new Error("The two PINs are not the same.");
          await send(staffApi("/manager-pin"), "PUT", { currentPin: "2026", newPin: pin });
          setStatus((s) => (s ? { ...s, managerPinIsDefault: false } : s));
          setPin(""); setPin2("");
        }
      } else if (step === "done") {
        await send("/api/nail/pos-setup/complete", "POST");
        onFinished();
        return;
      }
      go(STEPS[index + 1]);
    } catch (err: any) {
      setError(err?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // A staff login can't open the sign-in page while signed in (it sends them straight back), so sign this tablet
  // out first, then come back here after the owner signs in.
  const signInAsOwner = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch { /* offline: the sign-in page will say so */ }
    window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname)}`;
  };

  const owner = status?.team.find((m) => m.isOwner);
  const h1 = "text-[34px] md:text-[38px] font-bold leading-tight";
  const lead = "text-[24px] leading-relaxed mt-2";

  let body: React.ReactNode = null;
  if (!status) {
    body = loadError ? <p className="text-[24px]" style={{ color: "#b42318" }}>{loadError}</p> : <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: muted }} />;
  } else if (!status.canSetUp) {
    body = (
      <div className="flex flex-col gap-6" data-testid="pos-setup-owner-needed">
        <div>
          <h1 className={h1} style={{ color: ink }}>The owner needs to set up the front desk</h1>
          <p className={lead} style={{ color: muted }}>{barber
            ? "Before your shop can use the front desk, the shop owner has to answer a few questions about sales tax, card payments and cash. Sign in on this tablet with the owner's account to do it. It takes a few minutes."
            : "Before your shop can use the front desk, the shop owner has to answer a few questions about sales tax, card payments and cash. Sign in on this tablet with the owner's account to do it. It takes a few minutes."}</p>
        </div>
        <button type="button" onClick={() => void signInAsOwner()} data-testid="pos-setup-owner-signin"
          className="w-full h-16 rounded-2xl text-white text-[26px] font-bold" style={{ background: brand }}>Sign in as the owner</button>
      </div>
    );
  } else if (step === "welcome") {
    body = (
      <div>
        <h1 className={h1} style={{ color: ink }}>Let's set up your front desk</h1>
        <p className={lead} style={{ color: muted }}>{barber
          ? "A few questions about how your shop takes payment. It takes about three minutes, and you can change any answer later in Settings."
          : "A few questions about how your shop takes payment. It takes about three minutes, and you can change any answer later in Settings."}</p>
        <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-[24px]" style={{ color: ink }}>
          {["Sales tax", "Card payments", "Cash price", "Cash Drawer", "Tip choices", "Turn rotation", barber ? "Barber IDs" : "Barber IDs", "Manager PIN"].map((t) => (
            <li key={t} className="flex items-center gap-3"><span className="w-2 h-2 rounded-full" style={{ background: muted }} />{t}</li>
          ))}
        </ul>
      </div>
    );
  } else if (step === "tax") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Sales tax</h1>
          <p className={lead} style={{ color: muted }}>Your state and city sales tax rate, and what it applies to. Many states don't tax services but do tax products. Check with your state if you're not sure.</p>
        </div>
        <MoneyField label="Sales tax rate" value={taxRate} onChange={setTaxRate} suffix="%" testId="pos-setup-tax-rate" max={25} />
        <Toggle on={taxable.services} onChange={(v) => setTaxable((t) => ({ ...t, services: v }))} title="Services are taxed" testId="pos-setup-tax-services" />
        <Toggle on={taxable.addons} onChange={(v) => setTaxable((t) => ({ ...t, addons: v }))} title="Add-ons are taxed" testId="pos-setup-tax-addons" />
        <Toggle on={taxable.products} onChange={(v) => setTaxable((t) => ({ ...t, products: v }))} title="Retail products are taxed" testId="pos-setup-tax-products" />
        <Toggle on={taxable.giftCards} onChange={(v) => setTaxable((t) => ({ ...t, giftCards: v }))} title="Gift cards are taxed" detail="Usually not: tax is charged when the gift card is spent." testId="pos-setup-tax-giftcards" />
        <p className="text-[22px]" style={{ color: muted }}>Tips are never taxed.</p>
      </div>
    );
  } else if (step === "card") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Card payments</h1>
          <p className={lead} style={{ color: muted }}>What should the CARD button do at checkout?</p>
        </div>
        {/* The Stripe M2 reader is offered only once the account is connected to Stripe through Certxa; until then a
            card to start that setup takes its place (owner, 2026-11-02). */}
        {status.stripeConnected ? (
          <Choice selected={card === "stripe"} onClick={() => setCard("stripe")} title="Stripe M2 Reader" testId="pos-setup-card-stripe"
            detail="The card is charged on the Stripe M2 reader, and the money is paid out to your bank by Stripe." />
        ) : (
          <div className="rounded-2xl border-2 px-5 py-4 flex flex-col gap-3" style={{ borderColor: line, background: "#fff" }} data-testid="pos-setup-card-start">
            <span className="text-[26px] font-semibold" style={{ color: ink }}>Start accepting card payments through Certxa</span>
            <span className="text-[22px] leading-snug" style={{ color: muted }}>Connect a Stripe account to take cards on the Stripe M2 reader. When it is connected, open this setup again from Manager › Front Desk Setup and choose the reader.</span>
            <button type="button" onClick={openStripeSetup} data-testid="pos-setup-card-start-btn"
              className="self-start h-14 px-6 rounded-xl text-white text-[22px] font-bold" style={{ background: brand }}>Set up card payments</button>
          </div>
        )}
        <Choice selected={card === "own"} onClick={() => setCard("own")} title="My own card machine" testId="pos-setup-card-own"
          detail="You run the card on your own terminal. The CARD button only records the payment as card: Certxa charges nothing." />
        <Choice selected={card === "none"} onClick={() => setCard("none")} title="We do not accept card payments" testId="pos-setup-card-none"
          detail="The CARD button is turned off at checkout." />
      </div>
    );
  } else if (step === "cash") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Cash price</h1>
          <p className={lead} style={{ color: muted }}>Give clients who pay cash a lower price, as a percent off the ticket. Leave it at 0 for no cash price.</p>
        </div>
        <MoneyField label="Percent off for cash" value={cashPct} onChange={setCashPct} suffix="%" testId="pos-setup-cash-pct" max={10} />
      </div>
    );
  } else if (step === "drawer") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Cash Drawer</h1>
          <p className={lead} style={{ color: muted }}>The cash you take goes somewhere: a cash drawer, a cash box or an envelope. Tell us what you keep it in and how much cash for change is in it when the day starts. Certxa keeps count of what should be in it, and you count it at Day Close. The front desk can't take cash until this is set up.</p>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 pos-white" style={{ borderColor: line }}>
          <span className="text-[24px] font-semibold" style={{ color: ink }}>What you keep it in</span>
          <input value={drawerName} maxLength={40} onChange={(e) => setDrawerName(e.target.value)} data-testid="pos-setup-drawer-name" aria-label="What you keep it in" placeholder="Cash drawer, cash box or envelope"
            className="w-[440px] max-w-[60%] h-14 rounded-xl border px-3 text-[26px] font-semibold placeholder:font-normal placeholder:text-[22px] outline-none focus:ring-2" style={{ borderColor: line, color: ink }} />
        </label>
        <MoneyField label="Cash for change at the start of the day" value={startingCash} onChange={setStartingCash} prefix="$" testId="pos-setup-drawer-cash" max={10000} />
        <div className="rounded-2xl border px-5 py-4 pos-white" style={{ borderColor: line }} data-testid="pos-setup-drawer-stations">
          <p className="text-[24px] font-semibold mb-3" style={{ color: ink }}>POS stations that use this drawer</p>
          <div className="flex flex-col gap-3">
            {(registers.length ? registers.map((r) => ({ value: String(r.id), label: r.name })) : [{ value: "main", label: "Main POS station" }]).map((station) => {
              const otherDrawer = drawers.find((d) => d.id !== status.mainDrawer?.id && (
                station.value === "main" ? d.mainStation : d.registerIds.includes(Number(station.value))
              ));
              const selected = drawerStations.includes(station.value);
              return (
                <label key={station.value} className="flex items-center gap-3 text-[22px]" style={{ color: otherDrawer ? muted : ink }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!!otherDrawer}
                    data-testid={`pos-setup-drawer-station-${station.value}`}
                    onChange={(e) => setDrawerStations((current) => e.target.checked
                      ? [...current, station.value]
                      : current.filter((value) => value !== station.value))}
                    className="h-6 w-6 accent-blue-600"
                  />
                  <span>{station.label}{otherDrawer ? ` · uses ${otherDrawer.name}` : ""}</span>
                </label>
              );
            })}
          </div>
          <p className="text-[20px] mt-3" style={{ color: muted }}>Several POS stations can share this drawer. A station can use only one drawer.</p>
        </div>
        <p className="text-[22px]" style={{ color: muted }}>
          <span>More drawers and registers can be added in Settings › Cash Drawers.</span>
        </p>
      </div>
    );
  } else if (step === "tips") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Tip choices</h1>
          <p className={lead} style={{ color: muted }}>The tip percentages your clients can tap at checkout. Clients can always enter their own amount or skip.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex items-center justify-center gap-1 rounded-2xl border pos-white h-20" style={{ borderColor: line }}>
              <input inputMode="numeric" value={tips[i] ?? ""} aria-label={`Tip choice ${i + 1}`} data-testid={`pos-setup-tip-${i}`}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setTips((t) => { const n = [...t]; while (n.length < 4) n.push(""); n[i] = v; return n; }); }}
                className="w-24 h-14 text-center text-[32px] font-bold rounded-xl outline-none" style={{ color: ink }} />
              <span className="text-[28px] font-semibold" style={{ color: muted }}>%</span>
            </label>
          ))}
        </div>
      </div>
    );
  } else if (step === "turns") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Turn rotation</h1>
          <p className={lead} style={{ color: muted }}>{barber ? "How your shop decides which barber gets the next walk-in." : "How your shop decides which barber gets the next walk-in."}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {TURN_MODES.map((m) => (
            <Choice key={m} selected={mode === m} onClick={() => setMode(m)} title={barberWords(TURN_PRESETS[m].label)} detail={barberWords(TURN_PRESETS[m].description)} testId={`pos-setup-turn-${m}`} />
          ))}
        </div>
        {isDollarMode(mode) && (
          <MoneyField label={mode === "classic" ? "A full turn from" : "Dollars for one turn"} value={dollars} onChange={setDollars} prefix="$" testId="pos-setup-turn-dollars" max={1000} />
        )}
        {mode === "dollar" && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 pos-white" style={{ borderColor: line }}>
            <span className="text-[24px] font-semibold" style={{ color: ink }}>A smaller ticket earns</span>
            <span className="flex gap-2">
              {[0.25, 0.5, 0.75].map((v) => (
                <button key={v} type="button" onClick={() => setPartial(v)} className="min-w-14 h-12 px-3 rounded-xl border-2 text-[26px] font-semibold"
                  style={{ borderColor: partial === v ? brand : line, background: partial === v ? "#eef4ff" : "#fff", color: ink }}>{v === 0.25 ? "¼" : v === 0.5 ? "½" : "¾"}</button>
              ))}
            </span>
          </div>
        )}
        {isDollarMode(mode) && dollarsNum > 0 && (
          <p className="text-[22px]" style={{ color: muted }} data-testid="pos-setup-turn-preview">
            {[20, 30, 45, 60, 90].map((a) => `$${a} = ${formatTurns(turnUnits(turnRules, a))}`).join("   ·   ")}
          </p>
        )}
      </div>
    );
  } else if (step === "printing") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Printing</h1>
          <p className={lead} style={{ color: muted }}>Choose what prints by itself on your receipt printer. You can always print any of these by hand.</p>
        </div>
        <Toggle on={printing.salonCopy} onChange={(v) => setPrinting((p) => ({ ...p, salonCopy: v }))} title={barber ? "Shop copy of the receipt" : "Shop copy of the receipt"} testId="pos-setup-print-salon-copy"
          detail={printing.salonCopy ? (barber ? "Each sale prints a shop copy (signed for a card) and a customer copy." : "Each sale prints a shop copy (signed for a card) and a customer copy.") : "Only the customer copy prints."} />
        <Toggle on={printing.dayClose === "auto"} onChange={(v) => setPrinting((p) => ({ ...p, dayClose: v ? "auto" : "none" }))} title="Day Close report" testId="pos-setup-print-day-close"
          detail={printing.dayClose === "auto" ? "Prints by itself when you close the day." : "Doesn't print. Tap Print the Z Report after closing the day if you want it."} />
        <Toggle on={printing.checkinSlip === "auto"} onChange={(v) => setPrinting((p) => ({ ...p, checkinSlip: v ? "auto" : "none" }))} title="Check-in slip" testId="pos-setup-print-checkin"
          detail={printing.checkinSlip === "auto" ? "Prints when a client checks in at the kiosk, the customer screen or the front desk." : "No slip prints when a client checks in."} />
      </div>
    );
  } else if (step === "team") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>{barber ? "Barber IDs" : "Barber IDs"}</h1>
          <p className={lead} style={{ color: muted }}>{barber
            ? "Everyone signs in to the front desk with their own Barber ID. These are your team's IDs. Add or change team members in Settings › Staff."
            : "Everyone signs in to the front desk with their own Barber ID. These are your team's IDs. Add or change team members in Settings › Staff."}</p>
        </div>
        <div className="rounded-2xl border pos-white divide-y" style={{ borderColor: line }} data-testid="pos-setup-team">
          {status.team.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3" style={{ borderColor: line }}>
              <span className="text-[24px] font-semibold" style={{ color: ink }}>{m.name}<span className="ml-2 text-[22px] font-normal" style={{ color: muted }}>{m.isOwner ? "Owner" : m.frontDesk ? "Front desk" : (m.role || "")}</span></span>
              <span className="text-[28px] font-bold tabular-nums" style={{ color: ink }}>{m.techId ?? "—"}</span>
            </div>
          ))}
        </div>
        {owner?.techId != null && <p className="text-[22px]" style={{ color: muted }}>{barber ? "Your own Barber ID is " : "Your own Barber ID is "}<strong style={{ color: ink }}>{owner.techId}</strong>.</p>}
        {!barber && <Toggle on={lockScreen} onChange={setLockScreen} title="Ask for a Barber ID to use the front desk" testId="pos-setup-lockscreen"
          detail={lockScreen ? "Everything done on the front desk is recorded under who did it." : "Anyone can use the front desk without signing in."} />}
      </div>
    );
  } else if (step === "pin") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Manager PIN</h1>
          <p className={lead} style={{ color: muted }}>
            {status.managerPinIsDefault
              ? (barber ? "The Manager menu needs a 4-digit PIN. Choose your shop's own PIN and keep it private." : "The Manager menu and cancelling a client who has been served need a 4-digit PIN. Choose your shop's own PIN and keep it private.")
              : (barber ? "Your shop already has its own manager PIN. To change it, use Manager › Manager PIN on the front desk." : "Your shop already has its own manager PIN. To change it, use Manager › Manager PIN on the front desk.")}
          </p>
        </div>
        {status.managerPinIsDefault && <>
          <MoneyField label="New PIN" value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))} testId="pos-setup-pin" />
          <MoneyField label="Enter it again" value={pin2} onChange={(v) => setPin2(v.replace(/\D/g, "").slice(0, 4))} testId="pos-setup-pin2" />
        </>}
      </div>
    );
  } else if (step === "done") {
    const pctText = (v: string) => `${Number(v || 0)}%`;
    const taxed = [taxable.services && "Services", taxable.addons && "Add-ons", taxable.products && "Retail products", taxable.giftCards && "Gift cards"].filter(Boolean) as string[];
    const assignedStations = drawerStations
      .map((id) => id === "main" ? "Main POS station" : registers.find((r) => String(r.id) === id)?.name)
      .filter((name): name is string => !!name);
    const rows: [string, string[]][] = [
      ["Sales tax", [pctText(taxRate), ...(taxed.length ? taxed : ["Nothing is taxed"])]],
      ["CARD button", [card === "own" ? "My own card machine" : card === "none" ? "No card payments" : "Stripe M2 Reader"]],
      ["Cash price", [Number(cashPct) > 0 ? pctText(cashPct) : "Off"]],
      ["Cash Drawer", [`${status.mainDrawer?.name ?? drawerName} · $${Number(status.mainDrawer?.startingCash ?? startingCash).toFixed(2)}`, ...assignedStations]],
      ["Tip choices", [tips.filter(Boolean).map((t) => `${t}%`).join(", ")]],
      ["Turn rotation", [barberWords(TURN_PRESETS[mode].label)]],
      ...(barber ? [] : [["Barber ID sign-in", [lockScreen ? "On" : "Off"]] as [string, string[]]]),
      ["Manager PIN", [status.managerPinIsDefault ? "Not set" : "Set"]],
    ];
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Your front desk is ready</h1>
          <p className={lead} style={{ color: muted }}>You can change any of this later in Settings.</p>
        </div>
        <div className="rounded-2xl border pos-white divide-y" style={{ borderColor: line }} data-testid="pos-setup-summary">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-5 py-3" style={{ borderColor: line }}>
              <span className="text-[22px]" style={{ color: muted }}>{k}</span>
              <span className="text-[24px] font-semibold text-right" style={{ color: ink }}>
                {v.map((part, i) => <span key={i}>{i > 0 && (i === 1 ? " · " : ", ")}<span>{part}</span></span>)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ready = !!status && status.canSetUp;


  const nextLabel = step === "welcome" ? "Start" : step === "done" ? "Open the front desk" : step === "pin" && !status?.managerPinIsDefault ? "Keep my PIN" : "Next";

  return (
    <div className="cx-cal pos-setup fixed inset-0 z-[300] flex flex-col" style={{ background: LIGHT_PAGE_BG, color: ink }} data-testid="pos-setup">
      {/* /nail runs in dark mode, which repaints white surfaces and inputs; this page stays light. */}
      <style>{`.pos-setup .pos-white { background: #fff !important; } .pos-setup input { background: #fff !important; color: ${ink} !important; }`}</style>
      <header className="flex items-center justify-between px-6 h-16 shrink-0">
        <span className="flex items-center gap-3">
          {index > 0 && ready && step !== "done" && (
            <button type="button" onClick={back} aria-label="Back" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/70" data-testid="pos-setup-back">
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <span className="text-[22px] font-semibold uppercase tracking-wide" style={{ color: muted }}>Front desk setup</span>
        </span>
        {ready && (
          <span className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.slice(1, -1).map((s, i) => (
              <span key={s} className="h-1.5 rounded-full transition-all" style={{ width: i + 1 === index ? 22 : 8, background: i + 1 <= index ? brand : "#cbd5e1" }} />
            ))}
          </span>
        )}
        {/* The setup has to be finished before the front desk can be used: Close only once it has been finished. */}
        <button type="button" onClick={onClose} className={`${status?.completed ? "" : "invisible "}text-[22px] font-semibold px-3 py-2 rounded-lg hover:bg-white/70`} style={{ color: muted }} data-testid="pos-setup-close">
          Close
        </button>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-6 py-6">{body}</div>
      </main>
      {ready && (
        <footer className="shrink-0 px-6 pb-4 pt-3">
          <div className="max-w-[900px] mx-auto flex flex-col gap-2">
            {error && <p className="text-[22px] font-medium" style={{ color: "#b42318" }} role="alert" data-testid="pos-setup-error">{error}</p>}
            <button type="button" onClick={() => void next()} disabled={saving} data-testid="pos-setup-next"
              className="w-full h-16 rounded-2xl text-white text-[26px] font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: brand }}>
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}{nextLabel}
            </button>
          </div>
        </footer>
      )}
      {/* /barber has no language switch (English only), so no language buttons there. */}
      {onLang && <div className="shrink-0 flex items-center justify-center gap-3 flex-wrap px-6 pb-6" data-no-translate data-testid="pos-setup-langs">
        {SETUP_LANGS.map(({ code, label }) => (
          <button key={code} type="button" onClick={() => onLang(code)} data-testid={`pos-setup-lang-${code}`}
            className="px-5 py-2.5 rounded-full text-[20px] font-semibold transition-all duration-150 active:scale-95"
            style={{ background: lang === code ? brand : "#fff", color: lang === code ? "#fff" : muted, border: `1.5px solid ${lang === code ? brand : line}` }}>
            {label}
          </button>
        ))}
      </div>}
    </div>
  );
}
