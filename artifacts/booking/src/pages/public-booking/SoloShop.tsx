/**
 * The Solo website's shop (owner, 2026-11-04): buying a gift card or a prepaid package, in a panel over the page. Opened
 * from the site's menu (#gift-cards, #packages), which only lists what the pro offers. The card is taken on the pro's own
 * Stripe account; the server keeps the order and delivers it once (api-server routes/siteShop.ts).
 */
import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { CheckCircle2, Loader2, Lock, X } from "lucide-react";

export type ShopPackage = { id: number; name: string; description: string | null; serviceName: string; visits: number; priceCents: number; regularCents: number; savingsCents: number };
export type ShopData = { giftCards: boolean; amounts: number[]; minCents?: number; maxCents?: number; packages: ShopPackage[]; publishableKey?: string | null; stripeAccount?: string };
export type ShopView = "gift-cards" | "packages";
type Result = { kind: string; code?: string; visits?: number; name?: string };

const ACCENT = "var(--site-accent, #B45309)";
const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
const input = "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none";

let stripeCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
export function stripeFor(pk: string, account: string) {
  const key = `${pk}|${account}`;
  if (stripeCache?.key !== key) stripeCache = { key, promise: loadStripe(pk, { stripeAccount: account }) };
  return stripeCache.promise;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong");
  return data as T;
}

function PayForm({ slug, label, onDone }: { slug: string; label: string; onDone: (r: Result) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const r = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (r.error || !r.paymentIntent?.id) { setError(r.error?.message || "The card could not be charged."); setBusy(false); return; }
    try { onDone(await post<Result>(`/api/public/store/${slug}/shop/confirm`, { paymentIntentId: r.paymentIntent.id })); }
    catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button type="button" onClick={pay} disabled={busy || !stripe} data-testid="shop-pay"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: ACCENT }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {label}
      </button>
      <p className="text-center text-xs text-gray-400">Paid securely with Stripe.</p>
    </div>
  );
}

export default function SoloShop({ slug, shop, view, businessName, onClose, onBook }: {
  slug: string; shop: ShopData; view: ShopView; businessName: string; onClose: () => void; onBook: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(shop.amounts[1] ?? shop.amounts[0] ?? null);
  const [custom, setCustom] = useState("");
  const [pack, setPack] = useState<ShopPackage | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const gift = view === "gift-cards";
  const customCents = Math.round(Number(custom || 0) * 100);
  const giftCents = custom ? customCents : amount ?? 0;
  const payCents = gift ? giftCents : pack?.priceCents ?? 0;
  const ready = !!buyerName.trim() && /\S+@\S+\.\S+/.test(buyerEmail) && (gift
    ? giftCents >= (shop.minCents ?? 1000) && giftCents <= (shop.maxCents ?? 100000) && (!recipientEmail || /\S+@\S+\.\S+/.test(recipientEmail))
    : !!pack && buyerPhone.replace(/\D/g, "").length >= 10);

  const toCard = async () => {
    setBusy(true); setError("");
    try {
      const r = await post<{ clientSecret: string }>(`/api/public/store/${slug}/shop/order`, gift
        ? { kind: "gift_card", amountCents: giftCents, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(), recipientName: recipientName.trim() || undefined, recipientEmail: recipientEmail.trim() || undefined, message: message.trim() || undefined }
        : { kind: "package", packageId: pack!.id, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(), buyerPhone: buyerPhone.trim() });
      setSecret(r.clientSecret);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={gift ? "Buy a gift card" : "Packages"} data-testid="solo-shop">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{gift ? "Gift Cards" : "Packages"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {result ? (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              {result.kind === "gift_card" ? (
                <>
                  <h3 className="text-xl font-semibold text-gray-900">Your gift card is ready</h3>
                  {result.code && <p className="rounded-xl bg-gray-50 px-4 py-3 font-mono text-lg font-semibold tracking-wider text-gray-900" data-testid="shop-code">{result.code}</p>}
                  <p className="text-sm text-gray-600">A copy is on its way to your e-mail. Show the code at your visit.</p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold text-gray-900">{result.name} is yours</h3>
                  <p className="text-sm text-gray-600">{result.visits} visits are saved with your phone number. Book as usual; {businessName} uses them at checkout.</p>
                  <button type="button" onClick={onBook} className="rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ background: ACCENT }}>Book a visit</button>
                </>
              )}
            </div>
          ) : secret && shop.publishableKey && shop.stripeAccount ? (
            <Elements key={secret} stripe={stripeFor(shop.publishableKey, shop.stripeAccount)} options={{ clientSecret: secret, appearance: { theme: "stripe" } } as StripeElementsOptions}>
              <p className="text-sm text-gray-700">{gift ? `${money(payCents)} gift card` : pack?.name} · <b>{money(payCents)}</b></p>
              <PayForm slug={slug} label={`Pay ${money(payCents)}`} onDone={setResult} />
            </Elements>
          ) : (
            <>
              {gift ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Choose an amount</p>
                  <div className="flex flex-wrap gap-2">
                    {shop.amounts.map((a) => (
                      <button key={a} type="button" onClick={() => { setAmount(a); setCustom(""); }} aria-pressed={!custom && amount === a} className="rounded-full border px-4 py-2 text-sm font-medium"
                        style={!custom && amount === a ? { background: ACCENT, color: "#fff", borderColor: "transparent" } : { borderColor: "#E5E7EB", color: "#374151" }}>{money(a)}</button>
                    ))}
                    <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Other amount" aria-label="Other amount" className="w-32 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none" />
                  </div>
                  <div className="mt-5 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">Who is it for? <span className="font-normal text-gray-400">(optional)</span></p>
                    <input className={input} placeholder="Their name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                    <input className={input} placeholder="Their e-mail (it's sent to them)" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                    <textarea className={input} rows={2} maxLength={300} placeholder="A short message" value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-gray-600">Prepay and save. Book as usual; your visits are used at checkout.</p>
                  <div className="space-y-2.5">
                    {shop.packages.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPack(p)} aria-pressed={pack?.id === p.id} data-testid={`shop-package-${p.id}`} className="w-full rounded-2xl border p-4 text-left"
                        style={{ borderColor: pack?.id === p.id ? ACCENT : "#E5E7EB", boxShadow: pack?.id === p.id ? `inset 0 0 0 1px ${ACCENT}` : undefined }}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="shrink-0 font-semibold text-gray-900">{money(p.priceCents)}</p>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">{p.visits} × {p.serviceName}{p.savingsCents > 0 ? ` · Save ${money(p.savingsCents)}` : ""}</p>
                        {p.description && <p className="mt-1 text-xs text-gray-500">{p.description}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-900">Your details</p>
                <input className={input} placeholder="Your name" autoComplete="name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="shop-name" />
                <input className={input} placeholder="Your e-mail" type="email" autoComplete="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} data-testid="shop-email" />
                {!gift && <input className={input} placeholder="Your phone (the number you book with)" type="tel" autoComplete="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} data-testid="shop-phone" />}
              </div>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              <button type="button" onClick={toCard} disabled={!ready || busy} data-testid="shop-continue"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-50" style={{ background: ACCENT }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue to payment{payCents > 0 ? ` · ${money(payCents)}` : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
