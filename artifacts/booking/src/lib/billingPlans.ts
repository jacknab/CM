/**
 * The subscription plans as the owner set them (2026-10-21): Solo free, Starter $29, Professional $99,
 * Enterprise $179. The admin plans (`subscription_plans`, served at /api/public/pricing-plans — the same list the
 * website's /pricing reads) are the source; PLAN_BASE is what shows until they load. Used by both billing pages.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export type BillingPlan = {
  code: string; name: string; price: number; tagline: string; highlight: string;
  features: string[]; notIncluded: string[]; popular?: boolean;
};

export const PLAN_BASE: BillingPlan[] = [
  { code: "solo", name: "Solo", price: 0, tagline: "For independent stylists and booth renters. 1 calendar, 1 staff member.", highlight: "1 calendar · 1 staff", features: [], notIncluded: [] },
  { code: "professional", name: "Starter", price: 29, tagline: "Up to 3 staff, all features for small teams.", highlight: "Up to 3 staff", features: [], notIncluded: [], popular: true },
  { code: "elite", name: "Professional", price: 99, tagline: "Up to 8 staff, all features for medium-size teams.", highlight: "Up to 8 staff", features: [], notIncluded: [] },
  { code: "enterprise", name: "Enterprise", price: 179, tagline: "Built for large teams or multiple locations.", highlight: "Large teams or several locations", features: [], notIncluded: [] },
];

/** The highest plan (drawn in gold on the billing pages). */
export const TOP_PLAN = "enterprise";

type AdminPlan = { code: string; name: string; description: string | null; priceMonthly: number; features: { featureName: string; limitValue: number | null }[] };
const featureText = (f: { featureName: string; limitValue: number | null }) =>
  f.limitValue != null && f.limitValue > 1 ? `${f.featureName} (${f.limitValue.toLocaleString()})` : f.featureName;

export function useBillingPlans(): BillingPlan[] {
  const { data } = useQuery<AdminPlan[]>({
    queryKey: ["/api/public/pricing-plans"],
    queryFn: async () => {
      const r = await fetch("/api/public/pricing-plans", { credentials: "include" });
      if (!r.ok) throw new Error("Could not load the plans");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
  return useMemo(() => PLAN_BASE.map((base) => {
    const a = data?.find((x) => x.code === base.code);
    if (!a) return base;
    return { ...base, name: a.name, price: Math.round(Number(a.priceMonthly)) / 100, tagline: a.description || base.tagline,
      highlight: a.description || base.highlight, features: a.features.map(featureText) };
  }), [data]);
}
