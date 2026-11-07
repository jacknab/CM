/**
 * certxa.com/solo/billing — billing for a Certxa Pro (Solo) account (owner, 2026-11-06; plans/solo-web-dashboard.md).
 *
 * The app's Settings › Billing opens it through a one-time sign-in link (GET /billing/start → here); the Solo
 * dashboard links to it too. Billing has to be on the website: Apple lets a US app send people to a website to pay.
 *
 * In this order (owner, 2026-11-06):
 *  1. The card on file — change it, or remove it (not while Plus or Business Phone is still running).
 *  2. Plus · $5/month — the next payment, and Cancel: Plus stays on until that date and is not charged again.
 *     Starting Plus happens on /pro-plus, the page the app already uses.
 *  3. Business Phone · $10/month — the same as Plus. A number is picked in the app.
 *  Then the text credits and the payments made.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { backToApp, setPaying, useEndAppWebSessionOnClose } from "@/lib/appWebSession";

type Plus = {
  businessName: string | null;
  priceCents: number;
  plus: boolean;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProblem: boolean;
};
type CardOnFile = { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null };
type CardState = { card: CardOnFile | null; neededBy: ("plus" | "phone")[]; canRemove: boolean };
type Phone = {
  phoneNumber: string;
  billing: { status: string; paidUntil: string | null; cancelAtPeriodEnd: boolean; retryAt: string | null; heldUntil: string | null; monthlyCents: number };
} | null;
type Credits = { credits: number; unlimited: boolean };
type Payment = { kind: "plus" | "credits"; date: string; amountCents: number | null; credits?: number; status: string; failure?: string | null };

const APP_RETURN = "certxa-pro://settings";
const PURPLE = "#6D4AE0";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method, credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || "Something went wrong"), { status: res.status });
  return data as T;
}

let stripeCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
function stripeFor(key: string) {
  if (stripeCache?.key !== key) stripeCache = { key, promise: loadStripe(key) };
  return stripeCache.promise;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const brandName = (brand: string | null) => (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card");
const prettyPhone = (n: string) => { const d = n.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

const primaryBtn = "flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white disabled:opacity-60";
const secondaryBtn = "flex h-11 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900 disabled:opacity-50";

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm" data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

/** Stripe's card form; the saved card replaces the one on file (routes/soloCard.ts). */
function CardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    setPaying(true);
    const result = await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" }).finally(() => setPaying(false));
    if (result.error || !result.setupIntent?.id) {
      setError(result.error?.message || "The card could not be saved. Please try again.");
      setBusy(false);
      return;
    }
    try {
      await call("/api/solo/billing/card", "POST", { setupIntentId: result.setupIntent.id });
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={save} disabled={busy || !stripe} className={primaryBtn} style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save card"}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="w-full py-1 text-sm font-medium text-gray-500">Cancel</button>
    </div>
  );
}

/** `inLayout`: drawn inside the Solo dashboard (a computer, signed in on the website), so no page frame of its own. */
export default function SoloBilling({ inLayout = false }: { inLayout?: boolean } = {}) {
  useEndAppWebSessionOnClose();
  const location = useLocation();
  const expiredLink = new URLSearchParams(window.location.search).get("link") === "expired";
  const [plus, setPlus] = useState<Plus | null>(null);
  const [cardState, setCardState] = useState<CardState | null>(null);
  const [phone, setPhone] = useState<Phone | undefined>(undefined);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [problem, setProblem] = useState<"" | "signin" | "error">("");
  const [message, setMessage] = useState("");

  // Card on file: the form, removing, and what went wrong.
  const [cardForm, setCardForm] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  // Cancelling Plus or Business Phone: which one is being asked about.
  const [confirmCancel, setConfirmCancel] = useState<"" | "plus" | "phone">("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const loadCard = () => call<CardState>("/api/solo/billing/card").then(setCardState);
  const loadPlus = () => call<Plus>("/api/solo/plus").then(setPlus);
  const loadPhone = () => call<Phone>("/api/pro/phone").then(setPhone).catch(() => setPhone(null));

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadPlus(), loadCard(), call<Credits>("/api/solo/credits").then(setCredits)]);
        void loadPhone();
        call<{ items: Payment[] }>("/api/solo/billing/history").then((h) => setPayments(h.items)).catch(() => setPayments([]));
      } catch (err: any) {
        if (err.status === 401 || err.status === 403) setProblem("signin");
        else { setProblem("error"); setMessage(err.message); }
      }
    })();
  }, []);

  const openCardForm = async () => {
    setCardError(""); setConfirmRemove(false);
    try { setCardForm(await call("/api/solo/billing/card/setup-intent", "POST")); } catch (err: any) { setCardError(err.message); }
  };
  const removeCard = async () => {
    setCardBusy(true); setCardError("");
    try { await call("/api/solo/billing/card", "DELETE"); setConfirmRemove(false); await loadCard(); } catch (err: any) { setCardError(err.message); } finally { setCardBusy(false); }
  };
  const cancel = async (what: "plus" | "phone") => {
    setCancelBusy(true); setCancelError("");
    try {
      if (what === "plus") { await call("/api/solo/plus/cancel", "POST"); await loadPlus(); }
      else { await call("/api/pro/phone/cancel", "POST"); await loadPhone(); }
      setConfirmCancel(""); await loadCard();
    } catch (err: any) { setCancelError(err.message); } finally { setCancelBusy(false); }
  };

  const backButton = (
    <button type="button" onClick={() => backToApp(APP_RETURN)} className={`${secondaryBtn} h-12`}>Back to Certxa Pro</button>
  );

  const card = cardState?.card;
  const neededText = (cardState?.neededBy ?? []).map((n) => (n === "plus" ? "Plus" : "Business Phone")).join(" and ");
  const line = phone?.billing;
  const phoneRunning = !!line && ["active", "past_due"].includes(line.status) && !line.cancelAtPeriodEnd;

  const cancelConfirm = (what: "plus" | "phone", until: string | null) => (
    <div className="space-y-3 rounded-xl bg-gray-50 p-4">
      <p className="text-sm text-gray-700">
        {until ? `${what === "plus" ? "Plus" : "Business Phone"} stays on until ${longDate(until)}, and you won't be charged again.` : "You won't be charged again."}
      </p>
      {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
      <button type="button" disabled={cancelBusy} onClick={() => void cancel(what)} className={secondaryBtn}>
        {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : what === "plus" ? "Cancel Plus" : "Cancel Business Phone"}
      </button>
      <button type="button" disabled={cancelBusy} onClick={() => { setConfirmCancel(""); setCancelError(""); }} className="w-full py-1 text-sm font-medium text-gray-500">
        {what === "plus" ? "Keep Plus" : "Keep Business Phone"}
      </button>
    </div>
  );

  return (
    <div className={inLayout ? "px-4 pb-16 pt-6 md:px-8 md:pt-10" : "fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-6"}>{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-md space-y-5">
        <header>
          {!inLayout && (location.state as any)?.fromDashboard && (
            <Link to="/solo" className="mb-3 inline-block text-sm font-medium text-gray-600">‹ Home</Link>
          )}
          <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
          {plus?.businessName && <p className="text-sm text-gray-500">{plus.businessName}</p>}
        </header>

        {problem === "signin" || (expiredLink && !plus) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{expiredLink ? "This link has expired" : "Open this page from the app"}</h2>
            <p className="text-sm text-gray-600">Open the Certxa Pro app, go to Settings and tap Billing again.</p>
            {backButton}
          </div>
        ) : problem === "error" ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-700">{message || "Billing could not be loaded. Please try again."}</p>
            {backButton}
          </div>
        ) : !plus || !cardState || !credits ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {/* 1. Card on file */}
            <Section title="Card on file" testId="billing-card">
              {card ? (
                <p className="text-sm text-gray-900">
                  {brandName(card.brand)} ending {card.last4}
                  {card.expMonth && card.expYear ? <span className="text-gray-500"> · expires {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}</span> : null}
                </p>
              ) : (
                <p className="text-sm text-gray-500">No card saved</p>
              )}
              {cardForm ? (
                <Elements stripe={stripeFor(cardForm.publishableKey)} options={{ clientSecret: cardForm.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                  <CardForm onDone={() => { setCardForm(null); void loadCard(); }} onCancel={() => setCardForm(null)} />
                </Elements>
              ) : confirmRemove ? (
                <div className="space-y-3 rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-700">Remove this card? Text credits will then be bought with a card each time.</p>
                  <button type="button" disabled={cardBusy} onClick={() => void removeCard()} className={secondaryBtn}>
                    {cardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove card"}
                  </button>
                  <button type="button" disabled={cardBusy} onClick={() => setConfirmRemove(false)} className="w-full py-1 text-sm font-medium text-gray-500">Keep card</button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => void openCardForm()} className={primaryBtn} style={{ backgroundColor: PURPLE }}>
                    {card ? "Change card" : "Add card"}
                  </button>
                  {card && (
                    <button type="button" disabled={!cardState.canRemove} onClick={() => { setCardError(""); setConfirmRemove(true); }} className={secondaryBtn}>
                      Remove card
                    </button>
                  )}
                  {card && !cardState.canRemove && (
                    <p className="text-xs text-gray-500">This card pays for {neededText}. You can remove it after {cardState.neededBy.length > 1 ? "they end" : "it ends"}.</p>
                  )}
                </>
              )}
              {cardError && <p className="text-sm text-red-600">{cardError}</p>}
            </Section>

            {/* 2. Plus */}
            <Section title={`Plus · ${money(plus.priceCents)}/month`} testId="billing-plus">
              {plus.plus ? (
                <>
                  <p className="text-sm text-gray-700">
                    {plus.paymentProblem
                      ? "Your last payment didn't go through. We'll try your card again soon."
                      : plus.nextChargeAt
                        ? plus.cancelAtPeriodEnd
                          ? `Plus ends on ${longDate(plus.nextChargeAt)}. You won't be charged again.`
                          : `Next payment of ${money(plus.priceCents)} on ${longDate(plus.nextChargeAt)}.`
                        : "Plus is on."}
                  </p>
                  {!plus.cancelAtPeriodEnd && (confirmCancel === "plus" ? cancelConfirm("plus", plus.nextChargeAt) : (
                    <button type="button" onClick={() => { setCancelError(""); setConfirmCancel("plus"); }} className={secondaryBtn}>Cancel Plus</button>
                  ))}
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700">Unlimited text notifications to your clients.</p>
                  <Link to="/pro-plus" state={{ fromBilling: true }} className={primaryBtn} style={{ backgroundColor: PURPLE }}>Get Plus</Link>
                </>
              )}
            </Section>

            {/* 3. Business Phone */}
            <Section title={`Business Phone · ${money(line?.monthlyCents ?? 1000)}/month`} testId="billing-phone">
              {phone === undefined ? (
                <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : !phone || !line ? (
                <p className="text-sm text-gray-700">Get a business number in the Certxa Pro app.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-900">{prettyPhone(phone.phoneNumber)}</p>
                  <p className="text-sm text-gray-700">
                    {line.status === "held"
                      ? `Paused because its payment didn't go through.${line.heldUntil ? ` The number is kept until ${longDate(line.heldUntil)}.` : ""}`
                      : line.status === "past_due"
                        ? `Your last payment didn't go through.${line.retryAt ? ` We'll try your card again on ${longDate(line.retryAt)}.` : ""}`
                        : line.cancelAtPeriodEnd && line.paidUntil
                          ? `Business Phone ends on ${longDate(line.paidUntil)}. You won't be charged again.`
                          : line.paidUntil
                            ? `Next payment of ${money(line.monthlyCents)} on ${longDate(line.paidUntil)}.`
                            : "Business Phone is on."}
                  </p>
                  {phoneRunning && (confirmCancel === "phone" ? cancelConfirm("phone", line.paidUntil) : (
                    <button type="button" onClick={() => { setCancelError(""); setConfirmCancel("phone"); }} className={secondaryBtn}>Cancel Business Phone</button>
                  ))}
                </>
              )}
            </Section>

            <Section title="Text messages">
              {credits.unlimited ? (
                <p className="text-sm text-gray-700">Unlimited with Plus.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700"><span className="text-lg font-semibold text-gray-900">{credits.credits}</span> credits left</p>
                  <Link to="/pro-credits" state={{ fromBilling: true }} className={secondaryBtn}>Buy credits</Link>
                </>
              )}
            </Section>

            <Section title="Payments">
              {payments === null ? (
                <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-gray-500">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {payments.map((p, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="text-gray-900">{p.kind === "plus" ? "Plus · monthly" : `${p.credits} text credits`}</p>
                        <p className="text-xs text-gray-500">{shortDate(p.date)}</p>
                        {p.status === "failed" && <p className="text-xs text-red-600">Payment failed{p.failure ? `: ${p.failure}` : ""}</p>}
                        {p.status === "refunded" && <p className="text-xs text-gray-500">Refunded</p>}
                      </div>
                      <p className="shrink-0 text-gray-900">{p.amountCents != null ? money(p.amountCents) : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {backButton}
          </>
        )}
      </div>
    </div>
  );
}
