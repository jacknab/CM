import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { roadmap } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/roadmap`;
const OG_IMAGE = `${SITE}/og-image.png`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${PAGE_URL}#webpage`,
  name: 'Certxa Product Roadmap — What We Are Building Next',
  url: PAGE_URL,
  description: 'Our public product roadmap. See what is in progress, planned, and already shipped.',
  isPartOf: { '@id': `${SITE}/#website` },
  about: { '@id': `${SITE}/#organization` },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const colConfig: Record<string, { icon: React.ReactNode; headerClass: string; cardClass: string }> = {
  in_progress: {
    icon: <Loader2 size={16} className="text-primary animate-spin" />,
    headerClass: 'bg-primary/10 text-primary border-primary/20',
    cardClass: 'border-primary/20 hover:border-primary/40',
  },
  planned: {
    icon: <Calendar size={16} className="text-blue-600" />,
    headerClass: 'bg-blue-50 text-blue-700 border-blue-100',
    cardClass: 'border-border hover:border-blue-200',
  },
  shipped: {
    icon: <CheckCircle2 size={16} className="text-green-600" />,
    headerClass: 'bg-green-50 text-green-700 border-green-100',
    cardClass: 'border-border opacity-80',
  },
};

export default function RoadmapPage() {
  return (
    <>
      <Helmet>
        <title>Certxa Product Roadmap — Upcoming Salon Software Features</title>
        <meta name="description" content="See what the Certxa team is building next — offline card payments, deposits at booking, online hardware ordering — and what has already shipped." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Certxa Product Roadmap — Upcoming Salon Software Features" />
        <meta property="og:description" content="See what is in progress, planned, and already shipped on the public Certxa roadmap." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Certxa Product Roadmap — Upcoming Salon Software Features" />
        <meta name="twitter:description" content="See what is in progress, planned, and already shipped." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* HERO */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-2xl flex flex-col gap-5">
              <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">{roadmap.hero.eyebrow}</motion.span>
              <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{roadmap.hero.headline}</motion.h1>
              <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">{roadmap.hero.subhead}</motion.p>
            </motion.div>
          </div>
        </section>

        {/* KANBAN */}
        <section className="py-xxl bg-muted">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {roadmap.columns.map((col) => {
                const cfg = colConfig[col.status] ?? colConfig.planned;
                return (
                  <motion.div key={col.id} variants={fadeUp} className="flex flex-col gap-4">
                    {/* Column header */}
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm ${cfg.headerClass}`}>
                      {cfg.icon}
                      <span>{col.label}</span>
                      <span className="ml-auto text-xs font-normal opacity-70">{col.items.length}</span>
                    </div>
                    {/* Cards */}
                    <div className="flex flex-col gap-3">
                      {col.items.map((item) => (
                        <div key={item.id}
                          className={`bg-card border rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 ${cfg.cardClass}`}>
                          <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{item.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                          {item.votes > 0 && (
                            <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                              <span className="text-xs text-muted-foreground">{item.votes} votes</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="rounded-3xl bg-primary p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{roadmap.cta.heading}</h2>
                <p className="text-primary-foreground/80 leading-relaxed">{roadmap.cta.subhead}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="shrink-0">
                <Link to="/contact"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-all duration-200">
                  {roadmap.cta.button} <ArrowRight size={16} />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
