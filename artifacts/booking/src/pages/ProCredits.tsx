/**
 * certxa.com/pro-credits — buying text message credits for Certxa Pro with a card (owner, 2026-11-03).
 *
 * Opened from the app's Credit balance screen through a one-time sign-in link (GET /pro-credits/start → here) when
 * the business has no card on file. Apple lets a US app send people to a website for this. The card is kept, so the
 * app buys with one tap next time (routes/soloCredits.ts).
 *
 * With ?card=1 it only saves a card, for a charge the app then makes with the card on file (changing the business
 * phone number, owner 2026-11-04).
 */
import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { CheckCircle, Loader2, Lock } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { backToApp as returnToApp, setPaying, useEndAppWebSessionOnClose } from "@/lib/appWebSession";

type Pack = { id: string; credits: number; priceCents: number };
type Summary = { credits: number; unlimited: boolean; packs: Pack[]; card: { brand: string | null; last4: string | null } | null };

const APP_RETURN = "certxa-pro://credits";
const APP_RETURN_CARD = "certxa-pro://phone";
const PURPLE = "#6D4AE0";

let stripeCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
function stripeFor(key: string) {
  if (stripeCache?.key !== key) stripeCache = { key, promise: loadStripe(key) };
  return stripeCache.promise;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || "Something went wrong"), { status: res.status });
  return data as T;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function PayForm({ pack, onDone }: { pack: Pack; onDone: (balance: number) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    setPaying(true);
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" }).finally(() => setPaying(false));
    if (result.error || !result.paymentIntent?.id) {
      setError(result.error?.message || "The card could not be charged. Please try again.");
      setBusy(false);
      return;
    }
    try {
      const r = await call<{ credits: number }>("/api/solo/credits/confirm", "POST", { paymentIntentId: result.paymentIntent.id });
      onDone(r.credits);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={pay} disabled={busy || !stripe} data-testid="pro-credits-pay"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Buy {pack.credits} credits · {money(pack.priceCents)}
      </button>
      <p className="text-center text-xs leading-5 text-gray-500">A one-time payment. Your card is saved so you can buy more credits in the app with one tap.</p>
    </div>
  );
}

function SaveCardForm({ onDone }: { onDone: (card: Summary["card"]) => void }) {
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
      const r = await call<{ card: Summary["card"] }>("/api/solo/credits/card-saved", "POST", { setupIntentId: result.setupIntent.id });
      onDone(r.card);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={save} disabled={busy || !stripe} data-testid="pro-card-save"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Save card
      </button>
      <p className="text-center text-xs leading-5 text-gray-500">Nothing is charged now. The app charges this card only when you confirm a purchase there.</p>
    </div>
  );
}

export default function ProCredits() {
  useEndAppWebSessionOnClose();
  const location = useLocation();
  const params = new URLSearchParams(window.location.search);
  const expiredLink = params.get("link") === "expired";
  const cardOnly = params.get("card") === "1";
  const [cardForm, setCardForm] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [savedCard, setSavedCard] = useState<Summary["card"] | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [packId, setPackId] = useState<string | null>(params.get("pack"));
  const [problem, setProblem] = useState<"" | "signin" | "error">("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<{ packId: string; clientSecret: string; publishableKey: string } | null>(null);
  const [bought, setBought] = useState<number | null>(null);

  useEffect(() => {
    call<Summary>("/api/solo/credits").then((s) => {
      setSummary(s);
      setPackId((cur) => (cur && s.packs.some((p) => p.id === cur) ? cur : s.packs[0]?.id ?? null));
    }).catch((err: any) => {
      if (err.status === 401 || err.status === 403) setProblem("signin");
      else { setProblem("error"); setMessage(err.message); }
    });
  }, []);
  useEffect(() => {
    if (!cardOnly || !summary) return;
    call<{ clientSecret: string; publishableKey: string }>("/api/solo/credits/setup-intent", "POST", {})
      .then(setCardForm).catch((err: any) => { setProblem("error"); setMessage(err.message); });
  }, [cardOnly, summary]);
  // A new card form for each package chosen (its amount is fixed in it).
  useEffect(() => {
    if (cardOnly || !packId || !summary) return;
    setForm(null);
    call<{ clientSecret: string; publishableKey: string }>("/api/solo/credits/payment-intent", "POST", { packId })
      .then((r) => setForm({ packId, ...r })).catch((err: any) => { setProblem("error"); setMessage(err.message); });
  }, [packId, summary]);

  const pack = summary?.packs.find((p) => p.id === packId) ?? null;
  const backToApp = (
    <button type="button" onClick={() => returnToApp(cardOnly ? APP_RETURN_CARD : APP_RETURN)} className="flex h-12 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900">Back to Certxa Pro</button>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        {(location.state as any)?.fromBilling && (
          <Link to="/solo/billing" className="inline-block text-sm font-medium text-gray-600">‹ Billing</Link>
        )}
        {problem === "signin" || (expiredLink && !summary) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900">{expiredLink ? "This link has expired" : "Open this page from the app"}</h1>
            <p className="text-sm text-gray-600">Open the Certxa Pro app, go to More › Credit balance and choose a package again.</p>
            {backToApp}
          </div>
        ) : problem === "error" ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-700">{message || "The credits page could not be loaded. Please try again."}</p>
            {backToApp}
          </div>
        ) : !summary ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : cardOnly ? (
          savedCard !== undefined ? (
            <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-7 w-7 shrink-0" style={{ color: PURPLE }} />
                <h1 className="text-lg font-semibold text-gray-900">Card saved</h1>
              </div>
              <p className="text-sm text-gray-700">{savedCard?.last4 ? `Your card ending ${savedCard.last4} is on file.` : "Your card is on file."} Go back to the app to finish.</p>
              {backToApp}
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Add a card</h1>
                <p className="mt-1 text-sm text-gray-600">Save a card for purchases in the Certxa Pro app.</p>
              </div>
              {cardForm ? (
                <Elements key={cardForm.clientSecret} stripe={stripeFor(cardForm.publishableKey)} options={{ clientSecret: cardForm.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                  <SaveCardForm onDone={setSavedCard} />
                </Elements>
              ) : (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              )}
              <p className="text-center text-xs text-gray-400">Saved securely with Stripe. Your card details never reach Certxa.</p>
            </div>
          )
        ) : bought != null ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-7 w-7 shrink-0" style={{ color: PURPLE }} />
              <h1 className="text-lg font-semibold text-gray-900">Credits added</h1>
            </div>
            <p className="text-sm text-gray-700">You now have <b>{bought}</b> text message credits.</p>
            {backToApp}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Buy text message credits</h1>
              <p className="mt-1 text-sm text-gray-600">You have {summary.credits} credits. One credit sends one text to a client.</p>
            </div>
            <div className="space-y-2">
              {summary.packs.map((p) => (
                <button key={p.id} type="button" onClick={() => setPackId(p.id)} data-testid={`pro-credits-pack-${p.id}`}
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left"
                  style={{ borderColor: p.id === packId ? PURPLE : "#E5E7EB", backgroundColor: p.id === packId ? "#F3EFFD" : "#fff" }}>
                  <span className="font-semibold text-gray-900">{p.credits} credits</span>
                  <span className="font-semibold text-gray-900">{money(p.priceCents)}</span>
                </button>
              ))}
            </div>
            {pack && form?.packId === pack.id ? (
              <Elements key={form.clientSecret} stripe={stripeFor(form.publishableKey)} options={{ clientSecret: form.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                <PayForm pack={pack} onDone={setBought} />
              </Elements>
            ) : (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            )}
            <p className="text-center text-xs text-gray-400">Paid securely with Stripe. Your card details never reach Certxa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
