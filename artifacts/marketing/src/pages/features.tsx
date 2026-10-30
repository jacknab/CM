import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { features } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/features`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const sectionImages = [
  '/airo-assets/images/pages/home/feature-booking',           // online booking
  '/airo-assets/images/pages/home/feature-analytics',         // front desk calendar
  '/airo-assets/images/pages/features/hero',                  // self check-in kiosk
  '/airo-assets/images/pages/home/feature-payments',          // built-in POS
  '/airo-assets/images/pages/features/waitlist',              // waitlist management
  '/airo-assets/images/pages/features/notifications',         // client notifications
  '/airo-assets/images/pages/home/feature-turns',             // turn rotation
  '/airo-assets/images/pages/features/staff-payroll',         // payroll
  '/airo-assets/images/pages/home/feature-loyalty',           // clients & loyalty
  '/airo-assets/images/pages/features/revenue-intelligence',  // revenue intelligence
  '/airo-assets/images/pages/features/reviews',               // review management
  '/airo-assets/images/pages/autumn/device-mockup',           // autumn AI receptionist
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${PAGE_URL}#webpage`,
  name: 'Salon Booking Software Features — Certxa',
  url: PAGE_URL,
  description:
    'Explore every feature in Certxa salon booking software: online booking, salon POS system, self check-in kiosk, waitlist management, turn rotation, loyalty programs, AI receptionist, and review management — built for nail salons, hair salons, barbershops, spas, and massage studios.',
  isPartOf: { '@id': `${SITE}/#website` },
  about: { '@id': `${SITE}/#organization` },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Features', item: PAGE_URL },
    ],
  },
};

export default function FeaturesPage() {
  return (
    <>
      <Helmet>
        <title>Salon Booking Software Features — Online Booking, POS & More | Certxa</title>
        <meta
          name="description"
          content="Online booking, salon POS, check-in kiosk, waitlist, turn rotation, loyalty and an AI receptionist in one platform for nail salons, barbershops and spas."
        />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Salon Booking Software Features — Online Booking, POS & More | Certxa" />
        <meta
          property="og:description"
          content="Online booking, salon POS, self check-in kiosk, waitlist, turn rotation, loyalty programs, and AI receptionist — all in one platform built for salons and beauty businesses."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Salon Booking Software Features — Online Booking, POS & More | Certxa" />
        <meta
          name="twitter:description"
          content="Online booking, salon POS, self check-in kiosk, waitlist, turn rotation, loyalty programs, and AI receptionist — all in one platform built for salons and beauty businesses."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="pt-16">
        {/* ── HERO ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="max-w-3xl"
            >
              <motion.span
                variants={fadeUp}
                className="text-xs font-semibold tracking-widest text-primary uppercase"
              >
                {features.hero.eyebrow}
              </motion.span>
              <h1
                className="mt-4 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {features.hero.headline}
              </h1>
              <motion.p
                variants={fadeUp}
                className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-2xl"
              >
                {features.hero.subhead}
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-4">
                <Link
                  to="/auth?mode=register"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                >
                  Start free trial
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all duration-200"
                >
                  See pricing
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── FEATURE SECTIONS ── */}
        <section className="py-xxl bg-muted" aria-label="Feature details">
          <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-28">
            {features.sections.map((sec, i) => {
              const isAutumn = sec.autumnLink === true;
              return (
                <motion.div
                  key={sec.id}
                  variants={stagger}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                    i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  {/* Text */}
                  <div className="flex flex-col gap-6">
                    {/* Tag row — live badge for Autumn */}
                    <motion.div variants={fadeUp} className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold tracking-widest text-primary uppercase">
                        {sec.tag}
                      </span>
                      {isAutumn && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                          Live now
                        </span>
                      )}
                    </motion.div>

                    <motion.h2
                      variants={fadeUp}
                      className="text-3xl md:text-4xl font-bold leading-tight text-foreground"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {sec.headline}
                    </motion.h2>

                    <div className="flex flex-col gap-3">
                      {sec.body.map((p) => (
                        <motion.p
                          key={p.id}
                          variants={fadeUp}
                          className="text-base text-muted-foreground leading-relaxed"
                        >
                          {p.text}
                        </motion.p>
                      ))}
                    </div>

                    <motion.ul variants={stagger} className="flex flex-col gap-2.5 mt-2">
                      {sec.bullets.map((b) => (
                        <motion.li
                          key={b.id}
                          variants={fadeUp}
                          className="flex items-center gap-3 text-sm font-medium text-foreground"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                            <Check size={12} className="text-primary" />
                          </span>
                          {b.text}
                        </motion.li>
                      ))}
                    </motion.ul>

                    {/* Deep-link to the turn system guide (owner 2026-10-30) */}
                    {sec.id === 'sec-turns' && (
                      <motion.div variants={fadeUp}>
                        <Link
                          to="/nail-salon-turn-system"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-200"
                        >
                          How nail salon turn systems work, with a free turn calculator
                          <ArrowRight size={15} />
                        </Link>
                      </motion.div>
                    )}

                    {/* Deep-link for Autumn */}
                    {isAutumn && (
                      <motion.div variants={fadeUp}>
                        <Link
                          to="/autumn"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-200"
                        >
                          Meet Autumn — full feature details
                          <ArrowRight size={15} />
                        </Link>
                      </motion.div>
                    )}
                  </div>

                  {/* Image */}
                  <motion.div
                    variants={fadeUp}
                    className={`relative rounded-2xl overflow-hidden shadow-lg hover:-translate-y-1 transition-transform duration-300 ${
                      isAutumn ? 'aspect-square bg-muted/50 flex items-center justify-center p-6' : 'aspect-[4/3]'
                    }`}
                  >
                    <img
                      src={sectionImages[i]}
                      alt={sec.headline}
                      className={isAutumn ? 'w-full h-auto object-contain drop-shadow-xl' : 'w-full h-full object-cover'}
                      width={700}
                      height={isAutumn ? 700 : 525}
                      loading="lazy"
                    />
                  </motion.div>
                </motion.div>
              );
            })}
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
              <motion.div variants={fadeUp} className="max-w-xl">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                  See how Certxa compares
                </h2>
                <p className="text-muted-foreground">
                  Switching from another platform? See a feature-by-feature breakdown.
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

        {/* ── CTA ── */}
        <section className="py-xxl bg-background" aria-label="Call to action">
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
                  {features.cta.headline}
                </motion.h2>
                <motion.p variants={fadeUp} className="text-lg text-muted-foreground">
                  {features.cta.subhead}
                </motion.p>
                <motion.div variants={fadeUp}>
                  <Link
                    to="/auth?mode=register"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    {features.cta.button}
                    <ArrowRight size={16} />
                  </Link>
                </motion.div>
              </div>
              <div
                className="hidden lg:flex items-center justify-center"
                aria-hidden="true"
              >
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
