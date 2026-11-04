/**
 * The card form inside the Solo website's booking panel (owner, 2026-11-04): the client pays the deposit, or saves a
 * card, without leaving the page. The booking already exists as a hold, so the time can't be lost while they type; the
 * card goes to the pro's own Stripe account through the hold's token (routes/bookingPayments.ts, the same steps as the
 * text-message link, which stays as the fallback if they leave).
 */
import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2, Lock } from "lucide-react";
import { stripeFor } from "./SoloShop";

export type DepositHold = { token: string; amountCents: number | null; paymentUrl: string; requirement: "deposit" | "card_on_file" };

const ACCENT = "var(--site-accent, #B45309)";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data as T;
}

function CardForm({ hold, label, onDone }: { hold: DepositHold; label: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    try {
      const confirmParams = { return_url: hold.paymentUrl };
      let ids: Record<string, string | undefined>;
      if (hold.requirement === "card_on_file") {
        const r = await stripe.confirmSetup({ elements, confirmParams, redirect: "if_required" });
        if (r.error) throw new Error(r.error.message);
        ids = { stripeSetupIntentId: r.setupIntent?.id };
      } else {
        const r = await stripe.confirmPayment({ elements, confirmParams, redirect: "if_required" });
        if (r.error) throw new Error(r.error.message);
        ids = { stripePaymentIntentId: r.paymentIntent?.id };
      }
      await post("/api/public/booking-payment-link/complete", { token: hold.token, ...ids });
      onDone();
    } catch (err: any) {
      setError(err.message || "The card could not be charged.");
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={submit} disabled={busy || !stripe} data-testid="solo-pay" className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: ACCENT }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {label}
      </button>
    </div>
  );
}

export function SoloPay({ hold, publishableKey, account, businessName, onDone }: {
  hold: DepositHold; publishableKey: string; account: string; businessName: string; onDone: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const saving = hold.requirement === "card_on_file";
  useEffect(() => {
    post<{ clientSecret: string }>(`/api/public/booking-payment-link/${saving ? "setup-intent" : "payment-intent"}`, { token: hold.token })
      .then((r) => setSecret(r.clientSecret))
      .catch((err) => setError(err.message));
  }, [hold.token, saving]);
  const stripe = useMemo(() => stripeFor(publishableKey, account), [publishableKey, account]);
  const amount = `$${((hold.amountCents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
  return (
    <div className="px-5 py-5" data-testid="solo-pay-step">
      <h3 className="text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{saving ? "Add your card" : "Pay to confirm"}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {saving ? `${businessName} keeps your card on file. Nothing is charged today.` : `Your time is held for 1 hour. ${amount} confirms your booking.`}
      </p>
      <div className="mt-4">
        {error ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</p>
            <a href={hold.paymentUrl} className="block text-center font-semibold underline">Open the secure payment page</a>
          </div>
        ) : !secret ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <Elements key={secret} stripe={stripe} options={{ clientSecret: secret }}>
            <CardForm hold={hold} label={saving ? "Save card" : `Pay ${amount}`} onDone={onDone} />
          </Elements>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">Secured by Stripe.</p>
    </div>
  );
}

/**
 * A card to keep on file, taken before the booking or request is made, so a declined card stops here and the client can
 * try another (owner, 2026-11-04). `/book` does the $1 check, released at once, and keeps the card on the client.
 */
function SaveCardForm({ label, busy, onSaved }: { label: string; busy: boolean; onSaved: (card: { setupIntentId: string; paymentMethodId?: string }) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!stripe || !elements) return;
    setSaving(true); setError("");
    const r = await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    setSaving(false);
    if (r.error || !r.setupIntent) { setError(r.error?.message || "That card could not be saved."); return; }
    const pm = r.setupIntent.payment_method;
    onSaved({ setupIntentId: r.setupIntent.id, paymentMethodId: typeof pm === "string" ? pm : pm?.id });
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={submit} disabled={saving || busy || !stripe} data-testid="solo-save-card" className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: ACCENT }}>
        {saving || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {label}
      </button>
    </div>
  );
}

export function SoloSaveCard({ slug, client, publishableKey, account, businessName, label, busy, error, attempt, onSaved }: {
  slug: string; client: { name: string; phone: string; email: string }; publishableKey: string; account: string; businessName: string;
  label: string; busy: boolean; error: string | null; attempt: number;
  onSaved: (card: { setupIntentId: string; paymentMethodId?: string; customerId: string }) => void;
}) {
  const [setup, setSetup] = useState<{ clientSecret: string; stripeCustomerId: string } | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    setSetup(null); setFailed("");
    post<{ clientSecret: string; stripeCustomerId: string }>("/api/public/booking-setup-intent", { slug, customerName: client.name, customerEmail: client.email || undefined, customerPhone: client.phone })
      .then(setSetup).catch((err) => setFailed(err.message));
  // A new attempt is a new card: `attempt` goes up when /book refuses the last one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);
  const stripe = useMemo(() => stripeFor(publishableKey, account), [publishableKey, account]);
  const message = error || failed;
  return (
    <div className="px-5 py-5" data-testid="solo-card-step">
      <h3 className="text-base font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Add your card</h3>
      <p className="mt-1 text-sm text-gray-600">{businessName} keeps your card on file. Nothing is charged today. We place a $1 hold to check the card and release it right away.</p>
      {message && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      <div className="mt-4">
        {setup ? (
          <Elements key={setup.clientSecret} stripe={stripe} options={{ clientSecret: setup.clientSecret }}>
            <SaveCardForm label={label} busy={busy} onSaved={(card) => onSaved({ ...card, customerId: setup.stripeCustomerId })} />
          </Elements>
        ) : !failed ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : null}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">Secured by Stripe.</p>
    </div>
  );
}
