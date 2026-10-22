import { Fragment, useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import ShareBar from '@/components/ShareBar';
import { Check as CheckIcon, X as XIcon } from 'lucide-react';
import { formatPricingFeatureLimit, formatPricingFeatureName } from '@/lib/pricing-feature-labels';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/pricing`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

type PublicPricingPlan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  features: Array<{
    featureId: string;
    featureName: string;
    featureDescription: string | null;
    featureCategory: string;
    limitValue: number | null;
    sortOrder: number;
  }>;
};

const PLAN_ORDER = ['professional', 'elite', 'enterprise'] as const;

function getPlanTier(plan: PublicPricingPlan): (typeof PLAN_ORDER)[number] | null {
  const code = plan.code.trim().toLowerCase();
  if (code === 'professional' || code === 'pro') return 'professional';
  if (code === 'elite') return 'elite';
  if (code === 'enterprise') return 'enterprise';

  const name = plan.name.trim().toLowerCase();
  if (name === 'professional' || name === 'pro') return 'professional';
  if (name === 'elite') return 'elite';
  if (name === 'enterprise') return 'enterprise';
  return null;
}

/** The plans the page shows, in order, from the admin's plan list. Throws when one is missing. */
function selectPlans(plans: PublicPricingPlan[]): PublicPricingPlan[] {
  if (!Array.isArray(plans)) throw new Error('Pricing plans response is invalid');
  const selectedPlans = PLAN_ORDER.map((tier) => plans.find((plan) => getPlanTier(plan) === tier));
  const missingPlans = PLAN_ORDER.filter((_, index) => !selectedPlans[index]);
  if (missingPlans.length > 0) {
    throw new Error(`Pricing plans are not configured: ${missingPlans.join(', ')}`);
  }

  return selectedPlans.filter((plan): plan is PublicPricingPlan => plan !== undefined);
}

async function fetchPricingPlans(): Promise<PublicPricingPlan[]> {
  const res = await fetch('/api/public/pricing-plans');
  if (!res.ok) throw new Error('Failed to load pricing plans');
  return selectPlans(await res.json());
}

/**
 * The plans the server put in the page (marketing-site.ts sets them before rendering /pricing and repeats them
 * in the page as window.__CERTXA_PRICING_PLANS__), so the cards and prices are in the HTML search engines and
 * AI crawlers read, and the first render in the browser matches it. Null when there are none.
 */
function preloadedPlans(): PublicPricingPlan[] | null {
  try {
    const raw = (globalThis as { __CERTXA_PRICING_PLANS__?: PublicPricingPlan[] }).__CERTXA_PRICING_PLANS__;
    return raw ? selectPlans(raw) : null;
  } catch {
    return null;
  }
}

function formatMonthlyPrice(priceInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(priceInCents / 100);
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function PricingPage() {
  const [pricingPlans, setPricingPlans] = useState<PublicPricingPlan[] | null>(preloadedPlans);
  const [pricingPlansError, setPricingPlansError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPricingPlans()
      .then((plans) => {
        if (!cancelled) setPricingPlans(plans);
      })
      .catch((err: unknown) => {
        console.error('[pricing] Failed to fetch pricing plans:', err);
        if (!cancelled) setPricingPlansError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const comparisonCategories = Array.from(
    (pricingPlans ?? []).reduce((categories, plan) => {
      for (const feature of plan.features) {
        const category = categories.get(feature.featureCategory) ?? new Map();
        category.set(feature.featureId, feature);
        categories.set(feature.featureCategory, category);
      }
      return categories;
    }, new Map<string, Map<string, PublicPricingPlan['features'][number]>>()),
  ).map(([name, features]) => ({ name, features: Array.from(features.values()) }));

  const pricing = {
    hero: {
      eyebrow: 'Simple, transparent pricing',
      headline: 'Certxa salon software pricing',
      subhead: 'Starter $29, Professional $99 and Enterprise $179 a month, or Solo free for one professional. No commissions, no long-term contracts.',
    },
    plans: (pricingPlans ?? []).map((plan) => ({
      ...plan,
      price: formatMonthlyPrice(plan.priceMonthly),
      period: '/ month',
      featured: getPlanTier(plan) === 'professional',
      cta: 'Start free trial',
      features: plan.features.map((feature) => ({
        id: feature.featureId,
        text: formatPricingFeatureName(feature.featureId, feature.featureName, feature.limitValue),
      })),
    })),
    comparison: {
      headline: 'Compare plans',
      categories: [
        {
          id: 'cat-booking',
          name: 'Booking',
          rows: [
            {
              id: 'r1',
              feature: 'Online booking page',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r2',
              feature: 'Calendars',
              starter: '1',
              pro: 'Unlimited',
              enterprise: 'Unlimited',
            },
            {
              id: 'r3',
              feature: 'Staff members',
              starter: '1',
              pro: 'Unlimited',
              enterprise: 'Unlimited',
            },
            {
              id: 'r4',
              feature: 'Waitlist',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r5',
              feature: 'Google Business Profile booking link',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r6',
              feature: 'Multi-location booking',
              starter: 'no',
              pro: 'no',
              enterprise: 'yes',
            },
            {
              id: 'r7',
              feature: 'Deposits and prepayments',
              starter: 'Coming soon',
              pro: 'Coming soon',
              enterprise: 'Coming soon',
            },
          ],
        },
        {
          id: 'cat-pos',
          name: 'Front desk and POS',
          rows: [
            {
              id: 'r1',
              feature: 'Touch-screen POS',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r2',
              feature: 'Card reader support (Stripe M2)',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r3',
              feature: 'Gift cards',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r4',
              feature: 'Tips and add-ons at checkout',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r5',
              feature: 'Self check-in kiosk',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r6',
              feature: 'Card processing',
              starter: '2.7% + $0.05 in person',
              pro: '2.7% + $0.05 in person',
              enterprise: '2.7% + $0.05 in person',
            },
            {
              id: 'r7',
              feature: 'Certxa fee per card transaction',
              starter: '$0.60',
              pro: '$0.60',
              enterprise: '$0.60',
            },
          ],
        },
        {
          id: 'cat-clients',
          name: 'Clients and marketing',
          rows: [
            {
              id: 'r1',
              feature: 'Client profiles',
              starter: 'Up to 500',
              pro: 'Unlimited',
              enterprise: 'Unlimited',
            },
            {
              id: 'r2',
              feature: 'Appointment history and notes',
              starter: 'yes',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r3',
              feature: 'Text and email reminders',
              starter: '200 a month',
              pro: 'Unlimited',
              enterprise: 'Unlimited',
            },
            {
              id: 'r4',
              feature: 'Client segments and tags',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r5',
              feature: 'Re-engagement campaigns',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
          ],
        },
        {
          id: 'cat-staff',
          name: 'Staff and payroll',
          rows: [
            {
              id: 'r1',
              feature: 'Staff commission tracking and payroll',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
          ],
        },
        {
          id: 'cat-reviews',
          name: 'Reviews and growth',
          rows: [
            {
              id: 'r1',
              feature: 'Automated review requests',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
            {
              id: 'r2',
              feature: 'Autumn AI receptionist',
              starter: '20 calls a month',
              pro: '50 calls a month',
              enterprise: '100 calls a month',
            },
            {
              id: 'r3',
              feature: 'Website builder',
              starter: 'Basic',
              pro: 'Premium',
              enterprise: 'Premium',
            },
            {
              id: 'r4',
              feature: 'Custom domain',
              starter: 'no',
              pro: 'yes',
              enterprise: 'yes',
            },
          ],
        },
        {
          id: 'cat-reporting',
          name: 'Reports',
          rows: [
            {
              id: 'r1',
              feature: 'Revenue reports',
              starter: 'no',
              pro: 'Advanced',
              enterprise: 'Advanced + export',
            },
            {
              id: 'r2',
              feature: 'Multi-location dashboard',
              starter: 'no',
              pro: 'no',
              enterprise: 'yes',
            },
          ],
        },
        {
          id: 'cat-support',
          name: 'Support',
          rows: [
            {
              id: 'r1',
              feature: 'Support',
              starter: 'Email and chat',
              pro: 'Priority chat',
              enterprise: 'Phone + account manager',
            },
            {
              id: 'r2',
              feature: 'Onboarding session',
              starter: 'no',
              pro: 'no',
              enterprise: 'yes',
            },
          ],
        },
      ],
    },
    faq: [
      {
        id: 'faq-1',
        question: 'How much does Certxa cost?',
        // From the admin's plans when they are here (name, price, staff count), so it always matches the cards.
        answer: pricingPlans
          ? `${pricingPlans.map((pl) => `${pl.name} is ${formatMonthlyPrice(pl.priceMonthly)} a month${pl.description ? ` (${pl.description.replace(/\.$/, '')})` : ''}`).join('; ')}. Paying yearly costs ten months instead of twelve. The Solo plan, for one independent professional, is free.`
          : 'Starter is $29 a month for up to 3 staff, Professional is $99 a month for up to 12 staff, and Enterprise is $179 a month for large teams or several locations. Paying yearly costs ten months instead of twelve: $290, $990 or $1,790. The Solo plan, for one independent professional, is free.',
      },
      {
        id: 'faq-2',
        question: 'Is there a free trial?',
        answer: 'Yes. Starter, Professional and Enterprise start with a 60-day free trial. A credit card is required to start a paid plan, but you are not charged until the trial ends. Solo is free with no trial needed.',
      },
      {
        id: 'faq-3',
        question: 'Can I change plans later?',
        answer: 'Yes. You can upgrade, downgrade, or cancel at any time. There are no long-term contracts.',
      },
      {
        id: 'faq-4',
        question: 'What does card processing cost?',
        answer: 'Payments run through Stripe. In-person card payments are 2.7% + $0.05 and online payments are 2.9% + $0.30, which is Stripe\'s rate, plus a $0.60 Certxa fee per card transaction.',
      },
      {
        id: 'faq-5',
        question: 'Is the Autumn AI receptionist included?',
        answer: 'Yes. Autumn answers calls on every plan: 20 calls a month are included on Solo, 50 on Starter and 100 on Professional. Additional calls are $0.50 each, and calls of 30 seconds or less are free. There is a one-time $15 fee to set up Autumn\'s phone number.',
      },
      {
        id: 'faq-6',
        question: 'What types of businesses does Certxa support?',
        answer: 'Certxa is built for nail salons, hair salons, barbershops, spas, massage studios, hair removal studios, and braid and weave salons.',
      },
    ],
    cta: {
      headline: 'Choose the right Certxa plan.',
      subhead: 'Compare Starter, Professional and Enterprise above.',
      button: 'Get started',
    },
  };

  return (
    <>
      <Helmet>
        <title>Salon Software Pricing — Certxa</title>
        <meta
          name="description"
          content="Certxa salon software pricing: Starter $29, Professional $99, Enterprise $179 a month; Solo is free. 60-day free trial, no commissions, no contracts."
        />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Salon Software Pricing — Certxa" />
        <meta
          property="og:description"
          content="Certxa salon software pricing: Starter $29, Professional $99, Enterprise $179 a month; Solo is free. 60-day free trial, no commissions, no contracts."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Salon Software Pricing — Certxa" />
        <meta
          name="twitter:description"
          content="Certxa salon software pricing: Starter $29, Professional $99, Enterprise $179 a month; Solo is free. 60-day free trial, no commissions, no contracts."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebPage',
                '@id': `${PAGE_URL}#webpage`,
                name: 'Salon Software Pricing — Certxa',
                url: PAGE_URL,
                description:
                  'Certxa salon software pricing: Starter $29, Professional $99, Enterprise $179 a month; Solo is free. 60-day free trial, no commissions, no contracts.',
                isPartOf: { '@id': `${SITE}/#website` },
                about: { '@id': `${SITE}/#organization` },
                breadcrumb: {
                  '@type': 'BreadcrumbList',
                  itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
                    { '@type': 'ListItem', position: 2, name: 'Pricing', item: PAGE_URL },
                  ],
                },
              },
              {
                '@type': 'FAQPage',
                '@id': `${PAGE_URL}#faq`,
                mainEntity: pricing.faq.map((item) => ({
                  '@type': 'Question',
                  name: item.question,
                  acceptedAnswer: { '@type': 'Answer', text: item.answer },
                })),
              },
            ],
          }).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="pt-16">
        {/* ── HERO ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10 text-center">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center gap-5"
            >
              <motion.span
                variants={fadeUp}
                className="text-xs font-semibold tracking-widest text-primary uppercase"
              >
                {pricing.hero.eyebrow}
              </motion.span>
              <h1
                className="text-5xl font-extrabold tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {pricing.hero.headline}
              </h1>
              <p
                className="text-lg text-muted-foreground"
                style={{ maxWidth: 'ch', margin: '0 auto' }}
              >
                {pricing.hero.subhead}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── PLANS GRID ── */}
        <section className="py-xxl bg-background" aria-label="Pricing plans">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {pricingPlansError ? (
                <p role="alert" className="md:col-span-3 text-center text-muted-foreground">
                  Pricing plans are temporarily unavailable.
                </p>
              ) : !pricingPlans ? (
                <p role="status" className="md:col-span-3 text-center text-muted-foreground">
                  Loading pricing plans…
                </p>
              ) : pricing.plans.map((plan) => (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className={`p-6 rounded-xl border border-border bg-card hover:bg-primary/5 transition-all duration-300 ${plan.featured ? 'bg-primary/10' : ''}`}
                >
                  <div className="flex flex-col gap-4">
                    {/* Featured badge */}
                    {plan.featured && (
                      <span
                        className="absolute top-4 right-4 text-xs font-semibold text-primary"
                      >
                        Most popular
                      </span>
                    )}

                    {/* Plan name */}
                    <h2
                      className="text-2xl font-bold text-foreground text-center"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {plan.name}
                    </h2>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 text-center">
                      <span
                        className="text-5xl font-extrabold tracking-tight"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {plan.price}
                      </span>
                      <span
                        className="text-sm text-foreground"
                      >
                        {plan.period}
                      </span>
                    </div>

                    {/* Description */}
                    <p
                      className="text-sm leading-relaxed text-foreground"
                    >
                      {plan.description}
                    </p>

                    {/* CTA */}
                    <Link
                      to={`/auth?mode=register&plan=${encodeURIComponent(plan.code)}`}
                      className={`text-center text-sm font-semibold px-5 py-3 rounded-lg transition-all duration-200 hover:opacity-90 ${
                        plan.featured
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {plan.cta}
                    </Link>

                    {/* Feature list */}
                    <ul className="flex flex-col gap-3 pt-2 border-t border-current/10">
                      {plan.features.map((f) => (
                        <li key={f.id} className="flex items-start gap-3 text-sm">
                          <span
                            className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center"
                          >
                            <CheckIcon size={10} className="text-primary" />
                          </span>
                          <span className="text-foreground">
                            {f.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section className="py-xxl bg-muted" aria-label="Plan comparison">
          <div className="max-w-5xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-10"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl font-bold text-foreground text-center"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {pricing.comparison.headline}
              </motion.h2>

              <motion.div variants={fadeUp} className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-6 py-4 font-semibold text-foreground w-1/2">
                        Feature
                      </th>
                      {pricing.plans.map((plan) => (
                        <th
                          key={plan.id}
                          className={`px-4 py-4 text-center font-semibold ${
                            plan.featured ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonCategories.map((cat) => (
                      <Fragment key={cat.name}>
                        <tr className="bg-muted/50">
                          <td
                            colSpan={pricing.plans.length + 1}
                            className="px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                          >
                            {cat.name.replace(/_/g, ' ')}
                          </td>
                        </tr>
                        {cat.features.map((feature, ri) => (
                          <tr
                            key={feature.featureId}
                            className={`border-t border-border/50 ${
                              ri % 2 === 0 ? '' : 'bg-muted/20'
                            }`}
                          >
                            <td className="px-6 py-3.5 text-foreground">{feature.featureName}</td>
                            {(pricingPlans ?? []).map((plan) => {
                              const planFeature = plan.features.find(
                                (item) => item.featureId === feature.featureId,
                              );
                              const limit =
                                planFeature?.limitValue == null
                                  ? null
                                  : formatPricingFeatureLimit(
                                      planFeature.featureId,
                                      planFeature.limitValue,
                                    );
                              return (
                                <td key={plan.code} className="px-4 py-3.5 text-center">
                                  {planFeature ? (
                                    limit ? (
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {limit}
                                      </span>
                                    ) : (
                                      <span className="flex justify-center">
                                        <CheckIcon size={16} className="text-primary" />
                                      </span>
                                    )
                                  ) : (
                                    <span className="flex justify-center">
                                      <XIcon size={14} className="text-muted-foreground opacity-40" />
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-background" aria-label="Frequently asked questions">
          <div className="max-w-3xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-10"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl font-bold text-foreground text-center"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Frequently asked questions
              </motion.h2>

              <dl className="flex flex-col gap-6">
                {pricing.faq.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={fadeUp}
                    className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3"
                  >
                    <dt className="font-semibold text-foreground">{item.question}</dt>
                    <dd className="text-sm text-muted-foreground leading-relaxed">
                      {item.answer}
                    </dd>
                  </motion.div>
                ))}
              </dl>
            </motion.div>
          </div>
        </section>

        {/* ── COMPARE INTERNAL LINKS ── */}
        <section className="py-xxl bg-background border-t border-border" aria-label="Compare Certxa">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-10"
            >
              <motion.div variants={fadeUp} className="text-center max-w-xl mx-auto">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                  Switching from another platform?
                </h2>
                <p className="text-muted-foreground">
                  See how Certxa pricing compares to the alternatives.
                </p>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Certxa vs GlossGenius', href: '/compare/certxa-vs-glossgenius', note: 'Multi-staff vs solo-stylist' },
                  { label: 'Certxa vs Vagaro', href: '/compare/certxa-vs-vagaro', note: 'Flat pricing vs add-on fees' },
                  { label: 'Certxa vs Fresha', href: '/compare/certxa-vs-fresha', note: 'Zero commission vs 20% new-client fee' },
                  { label: 'Certxa vs Square', href: '/compare/certxa-vs-square', note: 'Beauty-native vs generic retail POS' },
                ].map((item) => (
                  <motion.div key={item.href} variants={fadeUp}>
                    <Link
                      to={item.href}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 hover:border-primary hover:-translate-y-0.5 transition-all duration-200 group"
                    >
                      <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                        {item.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.note}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-1">
                        Compare <ArrowRight size={11} />
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── SHARE ── */}
        <section className="py-xl bg-background border-t border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
            >
              <motion.div variants={fadeUp} className="max-w-sm">
                <p className="text-sm font-semibold text-foreground mb-1">
                  Comparing options with your team?
                </p>
                <p className="text-xs text-muted-foreground">
                  Share this pricing page so everyone's looking at the same numbers.
                </p>
              </motion.div>
              <motion.div variants={fadeUp}>
                <ShareBar
                  url={PAGE_URL}
                  title="Certxa salon software pricing — compare plans, no commissions"
                  label="Share pricing"
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-xxxl bg-muted overflow-hidden" aria-label="Call to action">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
            >
              <div className="flex flex-col gap-6">
                <motion.h2
                  variants={fadeUp}
                  className="text-4xl md:text-5xl font-extrabold leading-tight text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {pricing.cta.headline}
                </motion.h2>
                <motion.p variants={fadeUp} className="text-lg text-muted-foreground">
                  {pricing.cta.subhead}
                </motion.p>
                <motion.div variants={fadeUp}>
                  <Link
                    to="/auth?mode=register"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    {pricing.cta.button}
                    <ArrowRight size={16} />
                  </Link>
                </motion.div>
              </div>
              <div className="hidden lg:flex items-center justify-center" aria-hidden="true">
                <span
                  className="text-[16rem] font-black leading-none select-none"
                  style={{ color: 'hsl(var(--primary) / 0.07)', fontFamily: 'var(--font-heading)' }}
                >
                  ×
                </span>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </>
  );
}
