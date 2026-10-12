import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check, X } from 'lucide-react';
import { pricing } from 'virtual:content';
import ShareBar from '@/components/ShareBar';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/pricing`;
const OG_IMAGE = `${SITE}/og-image.png`;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${PAGE_URL}#webpage`,
      name: 'Salon Software Pricing — Certxa | Free Solo Plan, Teams From $22/mo',
      url: PAGE_URL,
      description:
        'Simple, transparent pricing for Certxa salon software. Solo is free, Professional is $22/mo and Elite is $49/mo. No commissions, no long-term contracts.',
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
};

export default function PricingPage() {
  return (
    <>
      <Helmet>
        <title>Salon Software Pricing — Certxa | Free Solo Plan, Teams From $22/mo</title>
        <meta
          name="description"
          content="Certxa's Solo plan is free. Professional is $22/mo and Elite is $49/mo, each with a 60-day free trial. No commissions and no long-term contracts."
        />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Salon Software Pricing — Certxa | Free Solo Plan, Teams From $22/mo" />
        <meta
          property="og:description"
          content="Free Solo plan. Team plans from $22/mo with a 60-day free trial. No commissions, no long-term contracts."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Salon Software Pricing — Certxa | Free Solo Plan, Teams From $22/mo" />
        <meta
          name="twitter:description"
          content="Free Solo plan. Team plans from $22/mo with a 60-day free trial. No commissions, no long-term contracts."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
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
              <motion.h1
                variants={fadeUp}
                className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground max-w-2xl"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {pricing.hero.headline}
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="text-lg text-muted-foreground max-w-xl"
              >
                {pricing.hero.subhead}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* ── PLAN CARDS ── */}
        <section className="pb-xxl bg-background" aria-label="Pricing plans">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {pricing.plans.map((plan) => (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
                  className={`relative rounded-2xl p-8 flex flex-col gap-6 border transition-transform duration-300 hover:-translate-y-1 ${
                    plan.featured
                      ? 'bg-primary text-primary-foreground border-primary shadow-2xl scale-[1.02]'
                      : 'bg-card border-border'
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-semibold bg-foreground text-background px-4 py-1.5 rounded-full whitespace-nowrap">
                      Most popular
                    </span>
                  )}

                  {/* Plan name & price */}
                  <div className="flex flex-col gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        plan.featured ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      {plan.name}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-5xl font-extrabold tracking-tight"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {plan.price}
                      </span>
                      <span
                        className={`text-sm ${
                          plan.featured ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                      >
                        {plan.period}
                      </span>
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        plan.featured ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      {plan.description}
                    </p>
                  </div>

                  {/* CTA */}
                  <Link
                    to={`/auth?mode=register&plan=${plan.id === 'plan-starter' ? 'solo' : plan.id === 'plan-pro' ? 'professional' : 'elite'}`}
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
                          className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                            plan.featured
                              ? 'bg-primary-foreground/20'
                              : 'bg-primary/10'
                          }`}
                        >
                          <Check
                            size={10}
                            className={plan.featured ? 'text-primary-foreground' : 'text-primary'}
                          />
                        </span>
                        <span
                          className={
                            plan.featured ? 'text-primary-foreground/90' : 'text-foreground'
                          }
                        >
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="text-center text-sm text-muted-foreground mt-8"
            >
              All plans include a 60-day free trial · Cancel anytime
            </motion.p>
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
                    {pricing.comparison.categories.map((cat) => (
                      <>
                        <tr key={cat.id} className="bg-muted/50">
                          <td
                            colSpan={4}
                            className="px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                          >
                            {cat.name}
                          </td>
                        </tr>
                        {cat.rows.map((row, ri) => (
                          <tr
                            key={row.id}
                            className={`border-t border-border/50 ${
                              ri % 2 === 0 ? '' : 'bg-muted/20'
                            }`}
                          >
                            <td className="px-6 py-3.5 text-foreground">{row.feature}</td>
                            {/* Starter */}
                            <td className="px-4 py-3.5">
                              {row.starter === 'yes' ? (
                                <span className="flex justify-center"><Check size={16} className="text-primary" /></span>
                              ) : row.starter === 'no' ? (
                                <span className="flex justify-center"><X size={14} className="text-muted-foreground opacity-40" /></span>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground text-center block">{row.starter}</span>
                              )}
                            </td>
                            {/* Pro */}
                            <td className="px-4 py-3.5">
                              {row.pro === 'yes' ? (
                                <span className="flex justify-center"><Check size={16} className="text-primary" /></span>
                              ) : row.pro === 'no' ? (
                                <span className="flex justify-center"><X size={14} className="text-muted-foreground opacity-40" /></span>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground text-center block">{row.pro}</span>
                              )}
                            </td>
                            {/* Enterprise */}
                            <td className="px-4 py-3.5">
                              {row.enterprise === 'yes' ? (
                                <span className="flex justify-center"><Check size={16} className="text-primary" /></span>
                              ) : row.enterprise === 'no' ? (
                                <span className="flex justify-center"><X size={14} className="text-muted-foreground opacity-40" /></span>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground text-center block">{row.enterprise}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </>
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
                  title="Certxa salon software — free Solo plan, team plans from $22/mo, no commissions"
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
                    to="/contact"
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
