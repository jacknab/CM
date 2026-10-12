import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { booking } from 'virtual:content';
import ShareBar from '@/components/ShareBar';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/booking`;
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
      name: 'Online Booking Software for Salons — Certxa',
      url: PAGE_URL,
      description:
        'Certxa online booking lets salon clients book 24/7 via Google, Instagram, and Facebook. Automated reminders, waitlist management, and multi-provider scheduling.',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Booking', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${PAGE_URL}#faq`,
      mainEntity: booking.faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ],
};

export default function BookingPage() {
  return (
    <>
      <Helmet>
        <title>Salon Online Booking Software — 24/7 Booking via Google & Instagram | Certxa</title>
        <meta name="description" content="Let clients book 24/7 via Google, Instagram, and Facebook. Automated reminders, waitlist management, and multi-provider scheduling — all in Certxa." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Salon Online Booking Software — 24/7 via Google & Instagram | Certxa" />
        <meta property="og:description" content="Let clients book 24/7 via Google, Instagram, and Facebook. Automated reminders and waitlist management built into Certxa." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Salon Online Booking Software — 24/7 via Google & Instagram | Certxa" />
        <meta name="twitter:description" content="Let clients book 24/7 via Google, Instagram, and Facebook. Automated reminders and waitlist management built into Certxa." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* ── HERO ── */}
        <section className="py-xxxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl flex flex-col gap-6">
              <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">
                {booking.hero.eyebrow}
              </motion.span>
              <motion.h1
                variants={fadeUp}
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {booking.hero.headline}
              </motion.h1>
              <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
                {booking.hero.subhead}
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/auth?mode=register"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200"
                >
                  {booking.hero.ctaPrimary}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/features"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border bg-background text-foreground font-semibold text-sm hover:bg-muted transition-colors duration-200"
                >
                  {booking.hero.ctaSecondary}
                </Link>
              </motion.div>
              <motion.p variants={fadeUp} className="text-xs text-muted-foreground">
                {booking.hero.socialProof}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{booking.howItWorks.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {booking.howItWorks.heading}
                </h2>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {booking.howItWorks.steps.map((step) => (
                  <motion.div
                    key={step.id}
                    variants={fadeUp}
                    className="relative bg-card border border-border rounded-2xl p-8 flex flex-col gap-4"
                  >
                    <span
                      className="text-5xl font-extrabold text-primary/10 leading-none select-none"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {step.number}
                    </span>
                    <h3 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── FEATURES GRID ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{booking.features.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {booking.features.heading}
                </h2>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {booking.features.items.map((item) => (
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

        {/* ── INTEGRATIONS / CHANNELS ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <motion.div variants={fadeUp} className="flex flex-col gap-5">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{booking.integrations.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {booking.integrations.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed">{booking.integrations.body}</p>
                <Link
                  to="/auth?mode=register"
                  className="self-start inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200"
                >
                  {booking.hero.ctaPrimary}
                  <ArrowRight size={16} />
                </Link>
              </motion.div>
              <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {booking.integrations.channels.map((ch) => (
                  <div
                    key={ch.id}
                    className="bg-card border border-border rounded-xl px-4 py-3.5 flex items-center justify-center text-sm font-semibold text-foreground text-center"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {ch.name}
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-10">
              <motion.div variants={fadeUp} className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-primary tracking-widest uppercase">{booking.faq.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  {booking.faq.heading}
                </h2>
              </motion.div>
              <div className="flex flex-col gap-4">
                {booking.faq.items.map((item) => (
                  <motion.div key={item.id} variants={fadeUp} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                    <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>
                      {item.question}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                  </motion.div>
                ))}
              </div>

              {/* ShareBar — between FAQ and CTA */}
              <motion.div variants={fadeUp} className="pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {booking.share.label}
                </p>
                <ShareBar
                  url={PAGE_URL}
                  title="Just found Certxa — online booking for salons that works with Google, Instagram, and more. No-show protection, automated reminders, waitlist management. Check it out:"
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
                  {booking.cta.heading}
                </h2>
                <p className="text-primary-foreground/80 leading-relaxed">{booking.cta.subhead}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 shrink-0">
                <Link
                  to="/auth?mode=register"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-all duration-200"
                >
                  {booking.cta.button}
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold text-sm hover:bg-primary-foreground/10 transition-all duration-200"
                >
                  {booking.cta.secondary}
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
