/**
 * Front desk setup — the first time a salon opens the /nail POS (owner, 2026-10-31; plans/pos-setup.md).
 *
 * One question a screen, every answer saved as the owner moves on, through the same settings the rest of
 * Certxa uses: sales tax (POS Settings), the CARD button, cash price, the first cash drawer on the main POS
 * register, tip choices, the turn method, the team's Tech IDs and the lock screen, and the salon's own manager
 * PIN (every salon starts on the shared 2026). Opens again from Manager › POS Setup.
 * Shown full screen in place of the POS until it is finished; it has to be finished before the front desk can be used (owner login).
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { TURN_MODES, TURN_PRESETS, formatTurns, isDollarMode, normalizeTurnRules, turnUnits, type TurnMode } from "@shared/turnRules";
import { DEFAULT_TIP_PRESETS, sanitizeTipPresets } from "@shared/tipPresets";
import { LIGHT_PAGE_BG } from "./touchKeys";
import type { NailLang } from "./i18n";

// The language buttons at the bottom, like the /kiosk welcome page: each name in its own language (not translated).
const SETUP_LANGS: { code: NailLang; label: string }[] = [
  { code: "en", label: "English" }, { code: "vi", label: "Tiếng Việt" }, { code: "es", label: "Español" }, { code: "fr", label: "Français" },
];

type CardProvider = "stripe" | "own";
interface TeamMember { id: number; name: string; role: string | null; techId: number | null; frontDesk: boolean; isOwner: boolean }
interface SetupStatus {
  completed: boolean; canSetUp: boolean; stripeConnected: boolean; managerPinIsDefault: boolean;
  mainDrawer: { id: number; name: string; startingCash: number } | null; team: TeamMember[];
}

const STEPS = ["welcome", "tax", "card", "cash", "drawer", "tips", "turns", "team", "pin", "done"] as const;
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

export function PosSetupWizard({ storeId, onFinished, onClose, lang, onLang }: { storeId: number; onFinished: () => void; onClose: () => void; lang: NailLang; onLang: (l: NailLang) => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Answers, starting from what the salon has now.
  const [taxRate, setTaxRate] = useState("0");
  const [taxable, setTaxable] = useState({ services: false, addons: false, products: true, giftCards: false });
  const [card, setCard] = useState<CardProvider>("stripe");
  const [cashPct, setCashPct] = useState("0");
  const [drawerName, setDrawerName] = useState("");
  const [startingCash, setStartingCash] = useState("200");
  const [tips, setTips] = useState<string[]>(DEFAULT_TIP_PRESETS.map(String));
  const [turnSaved, setTurnSaved] = useState<Record<string, any>>({});
  const [mode, setMode] = useState<TurnMode>("classic");
  const [dollars, setDollars] = useState("30");
  const [partial, setPartial] = useState(0.5);
  const [lockScreen, setLockScreen] = useState(true);
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
      get("/api/nail/screen-settings").catch(() => null),
    ]).then(([s, pos, cp, tp, turn, screen]) => {
      if (!alive) return;
      setStatus(s);
      if (pos) {
        setTaxRate(String(Math.round(Number(pos.salesTaxRate ?? 0) * 100000) / 1000));
        setTaxable({ services: !!pos.taxServicesTaxable, addons: !!pos.taxAddonsTaxable, products: pos.taxProductsTaxable !== false, giftCards: !!pos.taxGiftCardsTaxable });
        setCashPct(String(pos.cashDiscountPercent ?? 0));
      }
      if (cp?.provider) setCard(cp.provider === "own" ? "own" : "stripe");
      if (tp) setTips(sanitizeTipPresets(tp.presets).map(String));
      if (turn) {
        const rules = normalizeTurnRules(turn);
        setTurnSaved(turn); setMode(rules.mode); setDollars(String(rules.dollarsPerTurn)); setPartial(rules.partialTurnValue);
      }
      if (screen) setLockScreen(screen.lockScreen !== false);
      if (s.mainDrawer) { setDrawerName(s.mainDrawer.name); setStartingCash(String(s.mainDrawer.startingCash)); }
    }).catch(() => alive && setLoadError("The front desk setup could not be loaded. Check the connection and try again."));
    return () => { alive = false; };
  }, [storeId]);

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
        const r = await send("/api/nail/pos-setup/drawer", "PUT", { name: drawerName.trim() || "Cash", startingCash: amount });
        setStatus((s) => (s ? { ...s, mainDrawer: r.mainDrawer } : s));
        void queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] });
      } else if (step === "tips") {
        const entered = tips.map((t) => t.trim()).filter(Boolean);
        if (!entered.length || entered.some((t) => !/^\d{1,3}$/.test(t) || Number(t) < 1 || Number(t) > 100)) throw new Error("Enter tip percentages from 1 to 100.");
        await send("/api/tip-presets", "PUT", { presets: entered.map(Number) });
        void queryClient.invalidateQueries({ queryKey: ["/api/tip-presets"] });
      } else if (step === "turns") {
        if (isDollarMode(mode) && !(dollarsNum >= 1 && dollarsNum <= 1000)) throw new Error("Enter the dollars for one turn.");
        await send(`/api/turn/settings?storeId=${storeId}`, "PUT", {
          turnMode: mode, ...(isDollarMode(mode) ? { turnValueThreshold: dollarsNum } : {}), ...(mode === "dollar" ? { partialTurnValue: partial } : {}),
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/turn/settings", storeId] });
        void queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      } else if (step === "team") {
        await send("/api/nail/screen-settings", "PUT", { lockScreen });
        void queryClient.invalidateQueries({ queryKey: ["/api/nail/screen-settings"] });
      } else if (step === "pin") {
        if (status?.managerPinIsDefault) {
          if (!/^\d{4}$/.test(pin)) throw new Error("The manager PIN is 4 digits.");
          if (pin !== pin2) throw new Error("The two PINs are not the same.");
          await send("/api/nail/manager-pin", "PUT", { currentPin: "2026", newPin: pin });
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
          <p className={lead} style={{ color: muted }}>Before your salon can use the front desk, the salon owner has to answer a few questions about sales tax, card payments and cash. Sign in on this tablet with the owner's account to do it. It takes a few minutes.</p>
        </div>
        <button type="button" onClick={() => void signInAsOwner()} data-testid="pos-setup-owner-signin"
          className="w-full h-16 rounded-2xl text-white text-[26px] font-bold" style={{ background: brand }}>Sign in as the owner</button>
      </div>
    );
  } else if (step === "welcome") {
    body = (
      <div>
        <h1 className={h1} style={{ color: ink }}>Let's set up your front desk</h1>
        <p className={lead} style={{ color: muted }}>A few questions about how your salon takes payment. It takes about three minutes, and you can change any answer later in Settings.</p>
        <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-[24px]" style={{ color: ink }}>
          {["Sales tax", "Card payments", "Cash price", "Where you keep cash", "Tip choices", "Turn rotation", "Tech IDs", "Manager PIN"].map((t) => (
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
        <Choice selected={card === "stripe"} onClick={() => setCard("stripe")} title="Certxa card reader" testId="pos-setup-card-stripe"
          detail="The card is charged on the Certxa card reader, and the money is paid out to your bank by Stripe." />
        <Choice selected={card === "own"} onClick={() => setCard("own")} title="My own card machine" testId="pos-setup-card-own"
          detail="You run the card on your own terminal. The CARD button only records the payment as card: Certxa charges nothing." />
        {card === "stripe" && !status.stripeConnected && (
          <p className="text-[22px] rounded-xl px-4 py-3 border" style={{ color: ink, borderColor: line, background: "#fff" }} data-testid="pos-setup-stripe-note">
            Your Stripe account isn't connected yet. Connect it in Settings › Payments before taking cards on the reader. Until then, cash still works.
          </p>
        )}
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
          <h1 className={h1} style={{ color: ink }}>Where you keep cash</h1>
          <p className={lead} style={{ color: muted }}>The cash you take goes somewhere: a cash drawer, a cash box or an envelope. Tell us what you keep it in and how much cash for change is in it when the day starts. Certxa keeps count of what should be in it, and you count it at Day Close. The front desk can't take cash until this is set up.</p>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 pos-white" style={{ borderColor: line }}>
          <span className="text-[24px] font-semibold" style={{ color: ink }}>What you keep it in</span>
          <input value={drawerName} maxLength={40} onChange={(e) => setDrawerName(e.target.value)} data-testid="pos-setup-drawer-name" aria-label="What you keep it in" placeholder="Cash drawer, cash box or envelope"
            className="w-[440px] max-w-[60%] h-14 rounded-xl border px-3 text-[26px] font-semibold placeholder:font-normal placeholder:text-[22px] outline-none focus:ring-2" style={{ borderColor: line, color: ink }} />
        </label>
        <MoneyField label="Cash for change at the start of the day" value={startingCash} onChange={setStartingCash} prefix="$" testId="pos-setup-drawer-cash" max={10000} />
        <p className="text-[22px]" style={{ color: muted }}>
          <span>{status.mainDrawer ? `Your main front desk uses ${status.mainDrawer.name}.` : "It belongs to your main front desk."}</span>{" "}
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
          <p className={lead} style={{ color: muted }}>How your salon decides which technician gets the next walk-in.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {TURN_MODES.map((m) => (
            <Choice key={m} selected={mode === m} onClick={() => setMode(m)} title={TURN_PRESETS[m].label} detail={TURN_PRESETS[m].description} testId={`pos-setup-turn-${m}`} />
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
  } else if (step === "team") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Tech IDs</h1>
          <p className={lead} style={{ color: muted }}>Everyone signs in to the front desk with their own Tech ID. These are your team's IDs. Add or change team members in Settings › Staff.</p>
        </div>
        <div className="rounded-2xl border pos-white divide-y" style={{ borderColor: line }} data-testid="pos-setup-team">
          {status.team.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3" style={{ borderColor: line }}>
              <span className="text-[24px] font-semibold" style={{ color: ink }}>{m.name}<span className="ml-2 text-[22px] font-normal" style={{ color: muted }}>{m.isOwner ? "Owner" : m.frontDesk ? "Front desk" : (m.role || "")}</span></span>
              <span className="text-[28px] font-bold tabular-nums" style={{ color: ink }}>{m.techId ?? "—"}</span>
            </div>
          ))}
        </div>
        {owner?.techId != null && <p className="text-[22px]" style={{ color: muted }}>Your own Tech ID is <strong style={{ color: ink }}>{owner.techId}</strong>.</p>}
        <Toggle on={lockScreen} onChange={setLockScreen} title="Ask for a Tech ID to use the front desk" testId="pos-setup-lockscreen"
          detail={lockScreen ? "Everything done on the front desk is recorded under who did it." : "Anyone can use the front desk without signing in."} />
      </div>
    );
  } else if (step === "pin") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className={h1} style={{ color: ink }}>Manager PIN</h1>
          <p className={lead} style={{ color: muted }}>
            {status.managerPinIsDefault
              ? "The Manager menu and cancelling a client who has been served need a 4-digit PIN. Choose your salon's own PIN and keep it private."
              : "Your salon already has its own manager PIN. To change it, use Manager › Manager PIN on the front desk."}
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
    const rows: [string, string[]][] = [
      ["Sales tax", [pctText(taxRate), ...(taxed.length ? taxed : ["Nothing is taxed"])]],
      ["CARD button", [card === "own" ? "My own card machine" : "Certxa card reader"]],
      ["Cash price", [Number(cashPct) > 0 ? pctText(cashPct) : "Off"]],
      ["Where you keep cash", [`${status.mainDrawer?.name ?? drawerName} · $${Number(status.mainDrawer?.startingCash ?? startingCash).toFixed(2)}`]],
      ["Tip choices", [tips.filter(Boolean).map((t) => `${t}%`).join(", ")]],
      ["Turn rotation", [TURN_PRESETS[mode].label]],
      ["Tech ID sign-in", [lockScreen ? "On" : "Off"]],
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
          <span className="text-[22px] font-semibold" style={{ color: muted }}>Front desk setup</span>
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
      <div className="shrink-0 flex items-center justify-center gap-3 flex-wrap px-6 pb-6" data-no-translate data-testid="pos-setup-langs">
        {SETUP_LANGS.map(({ code, label }) => (
          <button key={code} type="button" onClick={() => onLang(code)} data-testid={`pos-setup-lang-${code}`}
            className="px-5 py-2.5 rounded-full text-[20px] font-semibold transition-all duration-150 active:scale-95"
            style={{ background: lang === code ? brand : "#fff", color: lang === code ? "#fff" : muted, border: `1.5px solid ${lang === code ? brand : line}` }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
