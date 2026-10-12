import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { SKU_BY_NAME, useCart, useShopStatus } from '@/lib/cart';

/**
 * Buy button for a hardware product. While online ordering is open it adds
 * the product to the cart; otherwise it is the link to the contact page that
 * the page had before, so the page never offers a checkout that cannot finish.
 */
export default function BuyButton({
  productName,
  className,
  children,
}: {
  productName: string;
  className: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const data = useShopStatus();
  const sku = SKU_BY_NAME[productName];

  if (!data?.open || !sku) {
    return (
      <Link to="/contact" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        add(sku);
        navigate('/cart');
      }}
    >
      {children}
    </button>
  );
}
