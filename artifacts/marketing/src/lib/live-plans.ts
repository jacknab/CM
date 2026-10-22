/**
 * The subscription plans as the salon owner set them in the admin (subscription_plans, served at
 * /api/public/pricing-plans): name, monthly price and description (staff count). The server puts them into the
 * page it renders (marketing-site.ts → globalThis / window.__CERTXA_PRICING_PLANS__), so the HTML search engines
 * read already has them and the first browser render matches; the browser then fetches them again to stay current.
 */
import { useEffect, useState } from 'react';

export type LivePlan = { id: number; code: string; name: string; description: string | null; priceMonthly: number };

function preloaded(): LivePlan[] | null {
  const raw = (globalThis as { __CERTXA_PRICING_PLANS__?: LivePlan[] }).__CERTXA_PRICING_PLANS__;
  return Array.isArray(raw) ? raw : null;
}

export function useLivePlans(): LivePlan[] | null {
  const [plans, setPlans] = useState<LivePlan[] | null>(preloaded);
  useEffect(() => {
    let alive = true;
    fetch('/api/public/pricing-plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (alive && Array.isArray(p)) setPlans(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return plans;
}

/** "$99" from cents ("$24.50" when there are cents). */
export const planPrice = (cents: number) => {
  const d = (Number(cents) || 0) / 100;
  return `$${d % 1 === 0 ? d.toFixed(0) : d.toFixed(2)}`;
};
