import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router';
import { useCart } from '@/lib/cart';

/**
 * After paying on the cart page (or coming back from the card's bank check): the server checks the payment with
 * Stripe and marks the order paid. The cart is emptied only once it is.
 */
export default function OrderConfirmedPage() {
  const [params] = useSearchParams();
  const order = params.get('order');
  const clear = useCart((s) => s.clear);
  const [state, setState] = useState<'checking' | 'paid' | 'unpaid'>('checking');

  useEffect(() => {
    if (!order) { setState('unpaid'); return; }
    let live = true;
    fetch('/api/shop/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber: order }) })
      .then((r) => (r.ok ? r.json() : { paid: false }))
      .then((r) => {
        if (!live) return;
        if (r.paid) { clear(); setState('paid'); } else setState('unpaid');
      })
      .catch(() => live && setState('unpaid'));
    return () => { live = false; };
  }, [order, clear]);

  return (
    <>
      <Helmet>
        <title>Order Received — Certxa</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <section className="max-w-2xl mx-auto px-6 md:px-10 pt-32 pb-28 text-center">
        {state === 'checking' ? (
          <p className="text-muted-foreground">Checking your payment…</p>
        ) : state === 'paid' ? (
          <>
            <h1 className="text-3xl font-extrabold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Thank you — your order is in.
            </h1>
            {order && <p className="text-sm text-muted-foreground mb-2">Order number {order}</p>}
            <p className="text-muted-foreground mb-8">
              Your receipt is on its way to your email. We&apos;ll send your UPS tracking number when your order ships.
            </p>
            <Link to="/" className="text-primary font-semibold hover:underline">
              Back to Certxa
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Your payment didn&apos;t go through.
            </h1>
            <p className="text-muted-foreground mb-8">Your card was not charged. Your cart is still saved.</p>
            <Link to="/cart" className="text-primary font-semibold hover:underline">
              Back to your cart
            </Link>
          </>
        )}
      </section>
    </>
  );
}
