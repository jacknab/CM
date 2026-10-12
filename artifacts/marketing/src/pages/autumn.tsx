import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { autumn } from 'virtual:content';
import ShareBar from '@/components/ShareBar';
import AutumnPhoneAnimation from '@/components/AutumnPhoneAnimation';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/autumn`;
const OG_IMAGE = `${SITE}/og-image.png`;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${PAGE_URL}#webpage`,
      name: 'Autumn AI Receptionist — Certxa | Never Miss a Salon Call',
      url: PAGE_URL,
      description:
        'Autumn is Certxa\'s AI phone receptionist. She answers every call in under 2 seconds, books appointments in real time, handles rescheduling, upsells add-ons, and knows your live salon wait times — 24/7.',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Autumn AI Receptionist', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${PAGE_URL}#faq`,
      mainEntity: autumn.faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ],
};

export default function AutumnPage() {
  return (
    <>
      <Helmet>
        <title>Autumn AI Receptionist — Certxa | Never Miss a Salon Call</title>
        <meta name="description" content="Autumn answers every salon call in under 2 seconds, books appointments in real time, handles rescheduling, upsells add-ons, and knows your live wait times. Available 24/7 on every Certxa plan." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Autumn AI Receptionist — Certxa | Never Miss a Salon Call" />
        <meta property="og:description" content="Autumn answers every salon call in under 2 seconds, books appointments in real time, and knows your live wait times. 24/7, on every Certxa plan." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Autumn AI Receptionist — Certxa | Never Miss a Salon Call" />
        <meta name="twitter:description" content="Autumn answers every salon call in under 2 seconds, books appointments in real time, and knows your live wait times. 24/7, on every Certxa plan." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* ── HERO ── */}
        <section className="min-h-[92vh] flex flex-col justify-center bg-background border-b border-border relative overflow-hidden">
          {/* Subtle radial glow behind content */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 70% 60% at 60% 50%, hsl(var(--primary) / 0.06) 0%, transparent 70%)' }}
            aria-hidden="true"
          />
          <div className="max-w-7xl mx-auto px-6 md:px-10 py-20 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Text */}
              <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col gap-6">
                {/* Live badge */}
                <motion.div variants={fadeUp}>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                    {autumn.hero.liveTag}
                  </span>
                </motion.div>

                <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">
                  {autumn.hero.eyebrow}
                </motion.span>

                <motion.h1
                  variants={fadeUp}
                  className="text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {autumn.hero.headline}
                </motion.h1>

                <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                  {autumn.hero.subhead}
                </motion.p>

                <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-2">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    {autumn.hero.ctaPrimary}
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all duration-200"
                  >
                    {autumn.hero.ctaSecondary}
                  </Link>
                </motion.div>
              </motion.div>

              {/* Animated phone illustration */}
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="flex justify-center lg:justify-end"
              >
                <AutumnPhoneAnimation />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── INTRO / BULLET LIST ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Left: text + bullets */}
              <div className="flex flex-col gap-8">
                <motion.div variants={fadeUp} className="flex flex-col gap-5">
                  <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.intro.eyebrow}</span>
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                    {autumn.intro.heading}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">{autumn.intro.body}</p>
                  <Link
                    to="/contact"
                    className="self-start inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200"
                  >
                    {autumn.hero.ctaPrimary}
                    <ArrowRight size={16} />
                  </Link>
                </motion.div>
                <motion.ul variants={stagger} className="flex flex-col gap-3">
                  {autumn.intro.bullets.map((bullet) => (
                    <motion.li key={bullet.id} variants={fadeUp} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-primary" />
                      </span>
                      <span className="text-sm text-foreground leading-relaxed">{bullet.text}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              </div>
              {/* Right: software screenshot */}
              <motion.div variants={fadeUp} className="rounded-2xl overflow-hidden shadow-xl border border-border">
                <img
                  src="/airo-assets/images/pages/autumn/software-screenshot"
                  alt="Certxa dashboard showing Autumn AI receptionist activity"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                  width={700}
                  height={500}
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── CAPABILITIES GRID ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.capabilities.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.capabilities.heading}
                </h2>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {autumn.capabilities.items.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={fadeUp}
                    className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Check size={15} className="text-primary" />
                    </div>
                    <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── LIVE AWARENESS ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-4 max-w-2xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.liveAwareness.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.liveAwareness.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed">{autumn.liveAwareness.intro}</p>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {autumn.liveAwareness.items.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={fadeUp}
                    className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3"
                  >
                    <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── SETUP STEPS ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.setup.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.setup.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed">{autumn.setup.body}</p>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {autumn.setup.steps.map((step) => (
                  <motion.div key={step.id} variants={fadeUp} className="bg-card border border-border rounded-2xl p-8 flex flex-col gap-4">
                    <span className="text-5xl font-extrabold leading-none select-none" style={{ color: 'hsl(var(--primary) / 0.12)', fontFamily: 'var(--font-heading)' }}>
                      {step.number}
                    </span>
                    <h3 className="font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── PRICING MODEL ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.pricing.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.pricing.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed">{autumn.pricing.body}</p>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {autumn.pricing.points.map((point) => (
                  <motion.div key={point.id} variants={fadeUp} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                    <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>{point.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{point.body}</p>
                  </motion.div>
                ))}
              </div>
              <motion.div variants={fadeUp} className="rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5">
                <p className="text-sm text-foreground font-medium">{autumn.pricing.planNote}</p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-10">
              <motion.div variants={fadeUp} className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{autumn.faq.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.faq.heading}
                </h2>
              </motion.div>
              <div className="flex flex-col gap-4">
                {autumn.faq.items.map((item) => (
                  <motion.div key={item.id} variants={fadeUp} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                    <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>{item.question}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                  </motion.div>
                ))}
              </div>

              {/* ShareBar */}
              <motion.div variants={fadeUp} className="pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {autumn.share.label}
                </p>
                <ShareBar
                  url={PAGE_URL}
                  title="Certxa's AI receptionist Autumn answers every salon call in under 2 seconds — books appointments, handles rescheduling, and knows live wait times. No missed calls, ever:"
                  label=""
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="rounded-3xl bg-primary p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8"
            >
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {autumn.cta.heading}
                </h2>
                <p className="text-primary-foreground/80 leading-relaxed">{autumn.cta.subhead}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 shrink-0">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-all duration-200"
                >
                  {autumn.cta.button}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold text-sm hover:bg-primary-foreground/10 transition-all duration-200"
                >
                  {autumn.cta.secondary}
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
