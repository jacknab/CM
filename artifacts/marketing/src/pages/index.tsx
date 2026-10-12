import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { home } from 'virtual:content';
import ProductHuntBanner from '@/components/ProductHuntBanner';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const featureImages = [
  '/airo-assets/images/pages/home/feature-booking',          // online booking
  '/airo-assets/images/pages/home/feature-payments',         // salon POS
  '/airo-assets/images/pages/home/feature-analytics',        // self check-in kiosk
  '/airo-assets/images/pages/features/waitlist',             // waitlist management
  '/airo-assets/images/pages/home/feature-turns',            // turn rotation
  '/airo-assets/images/pages/home/feature-loyalty',          // loyalty rewards
  '/airo-assets/images/pages/home/feature-autumn',           // autumn AI receptionist
  '/airo-assets/images/pages/features/reviews',              // reviews & growth
];

const SITE = 'https://certxa.com';
const OG_IMAGE = `${SITE}/og-image.png`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'Certxa',
      url: `${SITE}/`,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/blog?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#software`,
      name: 'Certxa',
      url: `${SITE}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'All-in-one salon booking software and POS system for nail salons, hair salons, barbershops, spas, massage studios, hair removal studios, and braid and weave salons. Includes online booking, self check-in kiosk, turn rotation, loyalty programs, and Autumn AI receptionist.',
      featureList: [
        'Online booking via Google and Instagram',
        'Salon POS system with Stripe payments',
        'Self check-in kiosk',
        'Waitlist management and turn rotation',
        'Loyalty programs',
        'Autumn AI receptionist',
        'Review management',
        'Staff scheduling and payroll',
      ],
      audience: {
        '@type': 'Audience',
        audienceType: 'Nail salons, hair salons, barbershops, spas, massage studios',
      },
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '29',
          priceCurrency: 'USD',
          description: 'Online booking, POS, waitlist, and turn rotation for growing beauty businesses.',
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '79',
          priceCurrency: 'USD',
          description: 'Everything in Starter plus Autumn AI receptionist, advanced loyalty, and a free wireless card reader.',
        },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE}/#webpage`,
      url: `${SITE}/`,
      name: 'Certxa — Salon Booking Software & POS for Beauty Businesses',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      datePublished: '2024-01-01',
      dateModified: '2026-10-12',
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Certxa — Salon Booking Software & POS System for Beauty Businesses</title>
        <meta
          name="description"
          content="Certxa is salon booking software and POS built for nail salons, hair salons, barbershops, spas, and massage studios. Online booking, self check-in kiosk, turn rotation, loyalty programs, and AI receptionist — starting at $29/mo."
        />
        <link rel="canonical" href={`${SITE}/`} />
        <meta property="og:title" content="Certxa — Salon Booking Software & POS System for Beauty Businesses" />
        <meta
          property="og:description"
          content="Online booking, salon POS, self check-in kiosk, loyalty programs, and AI receptionist — built for nail salons, hair salons, barbershops, spas, and more. Starting at $29/mo."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE}/`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Certxa — Salon Booking Software & POS System for Beauty Businesses" />
        <meta
          name="twitter:description"
          content="Online booking, salon POS, self check-in kiosk, loyalty programs, and AI receptionist — built for nail salons, hair salons, barbershops, spas, and more."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="pt-16">
        <ProductHuntBanner />
        {/* ── HERO ── */}
        <section className="min-h-[92vh] grid grid-cols-1 lg:grid-cols-2">
          {/* Left: text */}
          <div className="flex flex-col justify-center px-6 md:px-16 lg:px-20 py-20 lg:py-0">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-6 max-w-xl"
            >
              <motion.span
                variants={fadeUp}
                className="text-xs font-semibold tracking-widest text-primary uppercase"
              >
                {home.hero.eyebrow}
              </motion.span>

              <motion.h1
                variants={fadeUp}
                className="text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {home.hero.headline}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="text-lg text-muted-foreground leading-relaxed"
              >
                {home.hero.subhead}
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                >
                  {home.hero.ctaPrimary}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/features"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all duration-200"
                >
                  {home.hero.ctaSecondary}
                </Link>
              </motion.div>

              <motion.p
                variants={fadeUp}
                className="text-xs text-muted-foreground flex items-center gap-2"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                {home.hero.socialProof}
              </motion.p>
            </motion.div>
          </div>

          {/* Right: image */}
          <motion.div
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' as const, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <img
              src="/airo-assets/images/pages/home/hero"
              alt="Modern luxury salon interior with white minimalist design"
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
              width={1200}
              height={900}
            />
            {/* Subtle left fade */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent w-24 pointer-events-none" />
          </motion.div>
        </section>

        {/* ── AS SEEN ON ── */}
        <section aria-label="Directory listings" className="border-y border-border bg-muted/40">
          <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase shrink-0">
              {home.directoryBadges.label}
            </span>
            <div className="w-px h-6 bg-border hidden sm:block shrink-0" aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6">
              {home.directoryBadges.platforms.map((platform) => (
                <a
                  key={platform.id}
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors duration-200"
                  aria-label={`View Certxa on ${platform.name}`}
                >
                  <span className="w-2 h-2 rounded-full bg-primary/60 group-hover:bg-primary transition-colors duration-200" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{platform.name}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES (before Autumn) ── */}
        <section className="py-xxl bg-muted" aria-label="Features">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-24"
            >
              {home.features.slice(0, 6).map((feature, i) => (
                <motion.div
                  key={feature.id}
                  variants={fadeUp}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                    i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  {/* Text */}
                  <div className="flex flex-col gap-5">
                    <span className="text-xs font-semibold tracking-widest text-primary uppercase">
                      {feature.tag}
                    </span>
                    <h2
                      className="text-3xl md:text-4xl font-bold leading-tight text-foreground"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {feature.title}
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                    <Link
                      to="/features"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-200"
                    >
                      {feature.cta}
                      <ArrowRight size={15} />
                    </Link>
                  </div>

                  {/* Image */}
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] shadow-lg hover:-translate-y-1 transition-transform duration-300">
                    <img
                      src={featureImages[i]}
                      alt={feature.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={700}
                      height={525}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── AUTUMN SPOTLIGHT ── */}
        <section className="py-xxl bg-primary overflow-hidden relative" aria-label="Autumn AI receptionist">
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 80% 70% at 80% 50%, hsl(var(--primary-foreground) / 0.06) 0%, transparent 65%)' }}
            aria-hidden="true"
          />
          <div className="max-w-7xl mx-auto px-6 md:px-10 relative">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            >
              {/* Text */}
              <div className="flex flex-col gap-6">
                <motion.div variants={fadeUp}>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" aria-hidden="true" />
                    Live — Autumn is answering calls now
                  </span>
                </motion.div>
                <motion.span variants={fadeUp} className="text-xs font-semibold tracking-widest text-primary-foreground/60 uppercase">
                  {home.features[6].tag}
                </motion.span>
                <motion.h2
                  variants={fadeUp}
                  className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-primary-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.features[6].title}
                </motion.h2>
                <motion.p variants={fadeUp} className="text-base text-primary-foreground/75 leading-relaxed">
                  {home.features[6].description}
                </motion.p>

                {/* Benefits bullets */}
                <motion.ul variants={stagger} className="flex flex-col gap-2.5">
                  {((home.features[6] as unknown as { benefits: { id: string; text: string }[] }).benefits ?? []).map((b) => (
                    <motion.li key={b.id} variants={fadeUp} className="flex items-center gap-3 text-sm font-medium text-primary-foreground/90">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-foreground/15 flex items-center justify-center">
                        <ArrowRight size={10} className="text-primary-foreground" />
                      </span>
                      {b.text}
                    </motion.li>
                  ))}
                </motion.ul>

                <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-2">
                  <Link
                    to="/autumn"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    Meet Autumn
                    <ArrowRight size={15} />
                  </Link>
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold text-sm hover:bg-primary-foreground/10 transition-all duration-200"
                  >
                    Start free trial
                  </Link>
                </motion.div>

                {/* Mini stats */}
                <motion.div variants={fadeUp} className="flex gap-6 pt-2 border-t border-primary-foreground/15">
                  {[
                    { value: '< 2 sec', label: 'Answer time' },
                    { value: '24 / 7', label: 'Always on' },
                    { value: '0', label: 'Missed calls' },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col gap-0.5 pt-4">
                      <span className="text-xl font-extrabold text-primary-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{s.value}</span>
                      <span className="text-xs text-primary-foreground/60">{s.label}</span>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* New screenshot */}
              <motion.div
                variants={fadeUp}
                className="flex justify-center lg:justify-end"
              >
                <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl ring-1 ring-primary-foreground/20">
                  <img
                    src="/airo-assets/images/pages/autumn/new-screenshot"
                    alt="Autumn AI receptionist live call activity in the Certxa dashboard"
                    className="w-full h-auto object-cover"
                    loading="lazy"
                    width={700}
                    height={500}
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── FEATURES (after Autumn) ── */}
        <section className="py-xxl bg-muted" aria-label="More features">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-24"
            >
              {home.features.slice(7).map((feature, i) => (
                <motion.div
                  key={feature.id}
                  variants={fadeUp}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                    i % 2 === 0 ? 'lg:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div className="flex flex-col gap-5">
                    <span className="text-xs font-semibold tracking-widest text-primary uppercase">
                      {feature.tag}
                    </span>
                    <h2
                      className="text-3xl md:text-4xl font-bold leading-tight text-foreground"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {feature.title}
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                    <Link
                      to="/features"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-200"
                    >
                      {feature.cta}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] shadow-lg hover:-translate-y-1 transition-transform duration-300">
                    <img
                      src={featureImages[7 + i]}
                      alt={feature.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={700}
                      height={525}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── PRICING TEASER ── */}
        <section className="py-xxl bg-muted" aria-label="Pricing">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-12"
            >
              <motion.div variants={fadeUp} className="text-center max-w-xl mx-auto">
                <h2
                  className="text-3xl md:text-4xl font-bold text-foreground mb-4"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Simple, transparent pricing.
                </h2>
                <p className="text-muted-foreground">
                  No hidden fees. Cancel anytime.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {home.pricing.map((plan) => (
                  <motion.div
                    key={plan.id}
                    variants={fadeUp}
                    className={`relative rounded-2xl p-8 flex flex-col gap-6 border transition-transform duration-300 hover:-translate-y-1 ${
                      plan.featured
                        ? 'bg-primary text-primary-foreground border-primary shadow-xl'
                        : 'bg-card border-border'
                    }`}
                  >
                    {plan.featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-foreground text-background px-3 py-1 rounded-full">
                        Most popular
                      </span>
                    )}
                    <div>
                      <p
                        className={`text-sm font-semibold mb-2 ${
                          plan.featured ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        }`}
                      >
                        {plan.name}
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span
                          className="text-4xl font-extrabold"
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
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        plan.featured ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      {plan.description}
                    </p>
                    <Link
                      to={plan.name === 'Enterprise' ? '/contact' : '/contact'}
                      className={`mt-auto text-center text-sm font-semibold px-5 py-3 rounded-lg transition-all duration-200 hover:opacity-90 ${
                        plan.featured
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} className="text-center">
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-200"
                >
                  See full pricing details
                  <ArrowRight size={15} />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── CTA SECTION ── */}
        <section className="py-xxxl bg-background overflow-hidden" aria-label="Call to action">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
            >
              {/* Text */}
              <div className="flex flex-col gap-6">
                <motion.h2
                  variants={fadeUp}
                  className="text-4xl md:text-5xl font-extrabold leading-tight text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {home.cta.headline}
                </motion.h2>
                <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">
                  {home.cta.subhead}
                </motion.p>
                <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 items-start">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    {home.cta.button}
                    <ArrowRight size={16} />
                  </Link>
                  <p className="text-xs text-muted-foreground self-center">{home.cta.note}</p>
                </motion.div>
              </div>

              {/* Decorative X */}
              <motion.div
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.8 } } }}
                className="hidden lg:flex items-center justify-center"
                aria-hidden="true"
              >
                <span
                  className="text-[18rem] font-black leading-none select-none"
                  style={{ color: 'hsl(var(--primary) / 0.08)', fontFamily: 'var(--font-heading)' }}
                >
                  ×
                </span>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
    </>
  );
}
