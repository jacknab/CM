/**
 * certxa.com/join/<code> — joining a Certxa Pro business's membership from the link it sent (owner, 2026-11-15;
 * routes/proMemberships.ts). The client pays the first period on the business's own Stripe account; the card is kept
 * there for renewals.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { CheckCircle, Loader2, Lock } from "lucide-react";

type Plan = {
  business: string; name: string; description: string | null; priceCents: number; interval: "month" | "year"; discountPercent: number;
  includes: Array<{ serviceId: number; name: string; visits: number }>; status: string; publishableKey: string | null; stripeAccount: string | null;
};
const PURPLE = "#6D4AE0";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

let stripeCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
function stripeFor(pk: string, account: string) {
  const key = `${pk}|${account}`;
  if (stripeCache?.key !== key) stripeCache = { key, promise: loadStripe(pk, { stripeAccount: account }) };
  return stripeCache.promise;
}
async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong");
  return data as T;
}

function JoinForm({ token, plan, onJoined }: { token: string; plan: Plan; onJoined: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const join = async () => {
    if (!stripe || !elements) return;
    if (!agree) { setError("Please tick the box to agree to the renewals."); return; }
    setBusy(true); setError("");
    const r = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (r.error || !r.paymentIntent?.id) { setError(r.error?.message || "The card could not be charged."); setBusy(false); return; }
    try { await call(`/api/public/join/${token}/confirm`, "POST", { paymentIntentId: r.paymentIntent.id }); onJoined(); }
    catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <label className="flex items-start gap-3 text-sm text-gray-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: PURPLE }} checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="join-agree" />
        <span>I agree that {plan.business} charges {money(plan.priceCents)} to this card today and every {plan.interval} until I cancel. I can cancel any time by asking {plan.business}.</span>
      </label>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={join} disabled={busy || !stripe} data-testid="join-pay"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Join for {money(plan.priceCents)}/{plan.interval}
      </button>
    </div>
  );
}

export default function JoinMembership() {
  const { token = "" } = useParams<{ token: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call<Plan>(`/api/public/join/${token}`).then((p) => {
      setPlan(p);
      if (p.status === "pending") call<{ clientSecret: string }>(`/api/public/join/${token}/intent`, "POST").then((r) => setSecret(r.clientSecret)).catch((e) => setError(e.message));
    }).catch((e) => setError(e.message));
  }, [token]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          {!plan ? (
            error ? <p className="text-sm text-gray-700">{error}</p> : <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : joined || plan.status === "active" || plan.status === "past_due" ? (
            <div className="flex items-center gap-3" data-testid="join-done">
              <CheckCircle className="h-7 w-7 shrink-0" style={{ color: PURPLE }} />
              <div><h1 className="text-lg font-semibold text-gray-900">You're a member · thank you!</h1><p className="text-sm text-gray-500">{plan.name} at {plan.business}</p></div>
            </div>
          ) : plan.status === "cancelled" ? (
            <p className="text-sm text-gray-700">This membership has ended. Ask {plan.business} if you'd like to join again.</p>
          ) : (
            <>
              <div>
                <p className="text-sm text-gray-500">{plan.business}</p>
                <h1 className="text-xl font-semibold text-gray-900" data-testid="join-name">{plan.name}</h1>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{money(plan.priceCents)}<span className="text-base font-normal text-gray-500">/{plan.interval}</span></p>
              </div>
              {plan.description && <p className="whitespace-pre-wrap text-sm text-gray-700">{plan.description}</p>}
              <ul className="space-y-1.5 text-sm text-gray-800">
                {plan.includes.map((i) => <li key={i.serviceId}>• {i.visits} × {i.name} every {plan.interval}</li>)}
                {plan.discountPercent > 0 && <li>• {plan.discountPercent}% off {plan.includes.length ? "other services" : "services"}</li>}
              </ul>
              {secret && plan.publishableKey && plan.stripeAccount ? (
                <Elements stripe={stripeFor(plan.publishableKey, plan.stripeAccount)} options={{ clientSecret: secret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                  <JoinForm token={token} plan={plan} onJoined={() => setJoined(true)} />
                </Elements>
              ) : error ? <p className="text-sm text-red-600">{error}</p> : <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
              <p className="text-center text-xs text-gray-400">Paid securely with Stripe.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
