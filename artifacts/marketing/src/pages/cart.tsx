import { useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate } from 'react-router';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCents, MAX_QTY, useCart, useShopStatus } from '@/lib/cart';

const US_STATES =
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  );

interface Quote {
  subtotalCents: number;
  shippingCents: number;
  shippingService: string;
  totalCents: number;
}

/** The order being paid on this page (owner, 2026-10-24: payment on certxa.com, not Stripe's page). */
interface Payment {
  clientSecret: string;
  orderNumber: string;
  totalCents: number;
}

/** Stripe's card fields and the Pay button. After the card is taken the server is asked to mark the order paid. */
function PayForm({ payment, onBack }: { payment: Payment; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const confirmed = `/order-confirmed?order=${encodeURIComponent(payment.orderNumber)}`;
    // A card that needs its bank's check (3D Secure) may leave the page and come back to the confirmation page.
    const { error: failed } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${confirmed}` },
      redirect: 'if_required',
    });
    if (failed) {
      setError(failed.message || 'Your card was not charged. Please check the details and try again.');
      setBusy(false);
      return;
    }
    navigate(confirmed);
  };

  return (
    <form onSubmit={pay} className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">Payment</h2>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || !stripe || !elements} className="px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60">
        {busy ? 'Paying…' : `Pay ${formatCents(payment.totalCents)}`}
      </button>
      <button type="button" disabled={busy} onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
        Change the cart or address
      </button>
      <p className="text-xs text-muted-foreground">Order {payment.orderNumber}. Your card is processed securely by Stripe.</p>
    </form>
  );
}

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30';

export default function CartPage() {
  const { lines, setQty, remove } = useCart();
  const status = useShopStatus();
  const isLoading = status === undefined;
  const [form, setForm] = useState({ name: '', email: '', phone: '', line1: '', line2: '', city: '', state: '', zip: '' });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  // Stripe loads only in the browser, once the shop says it's open.
  const stripePromise = useMemo(() => (status?.publishableKey ? loadStripe(status.publishableKey) : null), [status?.publishableKey]);

  const priceOf = (sku: string) => status?.products.find((p) => p.sku === sku);
  const subtotal = lines.reduce((sum, l) => sum + (priceOf(l.sku)?.priceCents ?? 0) * l.qty, 0);

  // Any change to the cart or the address makes the shipping cost stale.
  const update = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setQuote(null);
  };

  const payload = () => ({
    items: lines,
    email: form.email,
    phone: form.phone,
    address: { name: form.name, line1: form.line1, line2: form.line2, city: form.city, state: form.state, zip: form.zip },
  });

  const call = async (path: string) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    return body;
  };

  const getQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setQuote(await call('/api/shop/quote'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setError('');
    try {
      setPayment(await call('/api/shop/checkout'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Your Cart — Certxa</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <section className="max-w-5xl mx-auto px-6 md:px-10 pt-28 pb-24">
        <h1 className="text-3xl font-extrabold text-foreground mb-8" style={{ fontFamily: 'var(--font-heading)' }}>
          Your cart
        </h1>

        {isLoading ? null : !status?.open ? (
          <p className="text-muted-foreground">
            Online ordering isn&apos;t available yet. <Link to="/contact" className="text-primary font-semibold hover:underline">Contact us</Link> to
            order hardware.
          </p>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground">
            Your cart is empty. <Link to="/products" className="text-primary font-semibold hover:underline">Browse hardware</Link>
          </p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-10">
            <div className="flex flex-col gap-4">
              {lines.map((line) => {
                const product = priceOf(line.sku);
                if (!product) return null;
                return (
                  <div key={line.sku} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{formatCents(product.priceCents)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`One fewer ${product.name}`}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"
                        disabled={line.qty <= 1 || !!payment}
                        onClick={() => { setQty(line.sku, line.qty - 1); setQuote(null); }}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                      <button
                        type="button"
                        aria-label={`One more ${product.name}`}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"
                        disabled={line.qty >= MAX_QTY || !!payment}
                        onClick={() => { setQty(line.sku, line.qty + 1); setQuote(null); }}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${product.name}`}
                        className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center disabled:opacity-40"
                        disabled={!!payment}
                        onClick={() => { remove(line.sku); setQuote(null); }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-xl border border-border bg-card p-4 text-sm flex flex-col gap-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold">{formatCents(subtotal)}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping{quote ? ` — ${quote.shippingService}` : ''}</span>
                  <span className="font-semibold">{quote ? formatCents(quote.shippingCents) : 'Enter your address'}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-extrabold">{formatCents(quote ? quote.totalCents : subtotal)}</span>
                </div>
              </div>
            </div>

            {payment && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret, appearance: { theme: 'stripe' } }}>
                <PayForm payment={payment} onBack={() => setPayment(null)} />
              </Elements>
            ) : (
            <form onSubmit={getQuote} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-foreground">Delivery address</h2>
              <p className="text-xs text-muted-foreground -mt-2">
                We ship by UPS to street addresses in the United States. We can&apos;t deliver to PO boxes.
              </p>
              <input className={field} placeholder="Full name" required value={form.name} onChange={(e) => update({ name: e.target.value })} autoComplete="name" />
              <input className={field} placeholder="Email" type="email" required value={form.email} onChange={(e) => update({ email: e.target.value })} autoComplete="email" />
              <input className={field} placeholder="Phone" type="tel" required value={form.phone} onChange={(e) => update({ phone: e.target.value })} autoComplete="tel" />
              <input className={field} placeholder="Street address" required value={form.line1} onChange={(e) => update({ line1: e.target.value })} autoComplete="address-line1" />
              <input className={field} placeholder="Suite, unit (optional)" value={form.line2} onChange={(e) => update({ line2: e.target.value })} autoComplete="address-line2" />
              <div className="grid grid-cols-6 gap-3">
                <input className={`${field} col-span-3`} placeholder="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} autoComplete="address-level2" />
                <select className={`${field} col-span-1 px-1`} required value={form.state} onChange={(e) => update({ state: e.target.value })} aria-label="State" autoComplete="address-level1">
                  <option value="">State</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className={`${field} col-span-2`} placeholder="ZIP" required inputMode="numeric" value={form.zip} onChange={(e) => update({ zip: e.target.value })} autoComplete="postal-code" />
              </div>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

              {quote ? (
                <button type="button" disabled={busy} onClick={checkout} className="mt-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60">
                  {busy ? 'One moment…' : 'Continue to payment'}
                </button>
              ) : (
                <button type="submit" disabled={busy} className="mt-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60">
                  {busy ? 'Calculating…' : 'Calculate shipping'}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Pay by card on the next step.
              </p>
            </form>
            )}
          </div>
        )}
      </section>
    </>
  );
}
