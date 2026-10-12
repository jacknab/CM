import { useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router';
import { useCart } from '@/lib/cart';

export default function OrderConfirmedPage() {
  const [params] = useSearchParams();
  const order = params.get('order');
  const clear = useCart((s) => s.clear);

  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <>
      <Helmet>
        <title>Order Received — Certxa</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <section className="max-w-2xl mx-auto px-6 md:px-10 pt-32 pb-28 text-center">
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
      </section>
    </>
  );
}
