import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { Minus, Plus, Trash2 } from 'lucide-react';
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
      const { url } = await call('/api/shop/checkout');
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
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
                        disabled={line.qty <= 1}
                        onClick={() => { setQty(line.sku, line.qty - 1); setQuote(null); }}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                      <button
                        type="button"
                        aria-label={`One more ${product.name}`}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"
                        disabled={line.qty >= MAX_QTY}
                        onClick={() => { setQty(line.sku, line.qty + 1); setQuote(null); }}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${product.name}`}
                        className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center"
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

            <form onSubmit={getQuote} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-foreground">Delivery address</h2>
              <p className="text-xs text-muted-foreground -mt-2">
                We ship by UPS to street addresses in the United States. We can&apos;t deliver to PO boxes.
              </p>
              <input className={field} placeholder="Full name" required value={form.name} onChange={(e) => update({ name: e.target.value })} autoComplete="name" />
              <input className={field} placeholder="Email" type="email" required value={form.email} onChange={(e) => update({ email: e.target.value })} autoComplete="email" />
              <input className={field} placeholder="Phone (optional)" type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} autoComplete="tel" />
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
                  {busy ? 'Starting checkout…' : `Pay ${formatCents(quote.totalCents)}`}
                </button>
              ) : (
                <button type="submit" disabled={busy} className="mt-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60">
                  {busy ? 'Calculating…' : 'Calculate shipping'}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Pay by card, or over time with Affirm, on the next screen.
              </p>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
