/**
 * certxa.com/pay/<token> — paying a booking from a link the business texted (Certxa Pro app, owner 2026-11-03).
 * The card is taken on the business's own Stripe account (routes/payLinks.ts); the booking is then marked paid.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { CheckCircle, Loader2, Lock } from "lucide-react";

type Link = { business: string; description: string; amountCents: number; status: string; publishableKey: string | null; stripeAccount: string | null };
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

function PayForm({ token, amountCents, onPaid }: { token: string; amountCents: number; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const r = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (r.error || !r.paymentIntent?.id) { setError(r.error?.message || "The card could not be charged."); setBusy(false); return; }
    try { await call(`/api/public/pay/${token}/confirm`, "POST", { paymentIntentId: r.paymentIntent.id }); onPaid(); }
    catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={pay} disabled={busy || !stripe} data-testid="pay-link-pay"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Pay {money(amountCents)}
      </button>
    </div>
  );
}

export default function PayLink() {
  const { token = "" } = useParams<{ token: string }>();
  const [link, setLink] = useState<Link | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call<Link>(`/api/public/pay/${token}`).then((l) => {
      setLink(l);
      if (l.status === "open") call<{ clientSecret: string }>(`/api/public/pay/${token}/intent`, "POST").then((r) => setSecret(r.clientSecret)).catch((e) => setError(e.message));
    }).catch((e) => setError(e.message));
  }, [token]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          {!link ? (
            error ? <p className="text-sm text-gray-700">{error}</p> : <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : paid || link.status === "paid" ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-7 w-7 shrink-0" style={{ color: PURPLE }} />
              <div><h1 className="text-lg font-semibold text-gray-900">Paid · thank you!</h1><p className="text-sm text-gray-500">{link.business}</p></div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-gray-500">{link.business}</p>
                <h1 className="text-xl font-semibold text-gray-900">{link.description}</h1>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{money(link.amountCents)}</p>
              </div>
              {secret && link.publishableKey && link.stripeAccount ? (
                <Elements stripe={stripeFor(link.publishableKey, link.stripeAccount)} options={{ clientSecret: secret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                  <PayForm token={token} amountCents={link.amountCents} onPaid={() => setPaid(true)} />
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
