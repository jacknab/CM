/**
 * certxa.com/pro-plus — buying Certxa Pro Plus ($3/month) with a card (owner, 2026-10-30).
 *
 * Opened from the Certxa Pro app's Plus card through a one-time sign-in link (GET /pro-plus/start → here).
 * Apple lets a US app send people to a website for this; a card form inside the app itself is not allowed.
 * The card is saved with a Stripe SetupIntent and Certxa's own monthly billing charges it (routes/soloPlus.ts).
 */
import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { CheckCircle, Loader2, Lock } from "lucide-react";

type Status = {
  businessName: string | null;
  priceCents: number;
  plus: boolean;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProblem: boolean;
  card: { brand: string | null; last4: string } | null;
};

const APP_RETURN = "certxa-pro://plus";
const PURPLE = "#6D4AE0";

let stripeCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
function stripeFor(key: string) {
  if (stripeCache?.key !== key) stripeCache = { key, promise: loadStripe(key) };
  return stripeCache.promise;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || "Something went wrong"), { status: res.status });
  return data as T;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function CardForm({ priceCents, onDone }: { priceCents: number; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const result = await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (result.error || !result.setupIntent?.id) {
      setError(result.error?.message || "The card could not be confirmed. Please try again.");
      setBusy(false);
      return;
    }
    try {
      await call("/api/solo/plus/subscribe", "POST", { setupIntentId: result.setupIntent.id });
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={start} disabled={busy || !stripe}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: PURPLE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Start Plus · {money(priceCents)}/month
      </button>
      <p className="text-center text-xs leading-5 text-gray-500">
        {money(priceCents)} is charged today and then every month to this card until you cancel. You can cancel any time on this page.
      </p>
    </div>
  );
}

export default function ProPlus() {
  const expiredLink = new URLSearchParams(window.location.search).get("link") === "expired";
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<"" | "signin" | "error">("");
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [justStarted, setJustStarted] = useState(false);
  const [working, setWorking] = useState(false);

  const load = async () => {
    try {
      const s = await call<Status>("/api/solo/plus");
      setStatus(s);
      if (!s.plus) setSetup(await call("/api/solo/plus/setup-intent", "POST"));
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) setProblem("signin");
      else { setProblem("error"); setMessage(err.message); }
    }
  };
  useEffect(() => { void load(); }, []);

  const toggleCancel = async (cancel: boolean) => {
    setWorking(true); setMessage("");
    try {
      await call(cancel ? "/api/solo/plus/cancel" : "/api/solo/plus/resume", "POST");
      await load();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setWorking(false);
    }
  };

  const backToApp = (
    <a href={APP_RETURN} className="flex h-12 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900">
      Back to Certxa Pro
    </a>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-6">{/* fixed: the site-wide 56px mobile header padding on body does not apply here (no header on this page) */}
      <div className="mx-auto max-w-md space-y-5">
        <img src="/images/pro-plus-plan.jpg" alt="Plus Plan: unlock the app with unlimited SMS notifications" className="w-full rounded-2xl" />

        {problem === "signin" || (expiredLink && !status) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900">{expiredLink ? "This link has expired" : "Open this page from the app"}</h1>
            <p className="text-sm text-gray-600">Open the Certxa Pro app, go to More and tap the Plus card again.</p>
            {backToApp}
          </div>
        ) : problem === "error" ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-700">{message || "Plus could not be loaded. Please try again."}</p>
            {backToApp}
          </div>
        ) : !status ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : status.plus || justStarted ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-7 w-7 shrink-0" style={{ color: PURPLE }} />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Plus is on</h1>
                {status.businessName && <p className="text-sm text-gray-500">{status.businessName}</p>}
              </div>
            </div>
            <p className="text-sm text-gray-700">Text notifications to your clients are unlimited.</p>
            {status.plus && (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {status.paymentProblem
                  ? "Your last payment didn't go through. We'll try your card again soon."
                  : status.nextChargeAt
                    ? status.cancelAtPeriodEnd
                      ? `Plus ends on ${longDate(status.nextChargeAt)}. You won't be charged again.`
                      : `Next payment of ${money(status.priceCents)} on ${longDate(status.nextChargeAt)}${status.card ? ` · card ending ${status.card.last4}` : ""}.`
                    : null}
              </div>
            )}
            {message && <p className="text-sm text-red-600">{message}</p>}
            {backToApp}
            {status.plus && (
              <button type="button" disabled={working} onClick={() => void toggleCancel(!status.cancelAtPeriodEnd)}
                className="w-full py-2 text-sm font-medium text-gray-500 underline disabled:opacity-50">
                {status.cancelAtPeriodEnd ? "Keep Plus" : "Cancel Plus"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Plus · {money(status.priceCents)}/month</h1>
              <p className="mt-1 text-sm text-gray-600">Unlimited text notifications to your clients and full app access{status.businessName ? ` for ${status.businessName}` : ""}.</p>
            </div>
            {setup ? (
              <Elements stripe={stripeFor(setup.publishableKey)} options={{ clientSecret: setup.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: PURPLE, borderRadius: "10px" } } } as StripeElementsOptions}>
                <CardForm priceCents={status.priceCents} onDone={() => { setJustStarted(true); void load(); }} />
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
