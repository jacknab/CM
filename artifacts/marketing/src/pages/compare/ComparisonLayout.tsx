import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Check, X, ArrowRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { comparison_layout } from 'virtual:content';
import ShareBar from '@/components/ShareBar';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

interface Differentiator {
  id: string;
  title: string;
  certxa: string;
  competitor: string;
}

interface ComparisonRow {
  id: string;
  feature: string;
  certxa: boolean;
  competitor: boolean;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ComparisonData {
  slug: string;
  competitor: string;
  metaTitle: string;
  metaDescription: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubhead: string;
  heroCta: string;
  targetBusinesses: string;
  competitorSummary: string;
  certxaSummary: string;
  differentiators: Differentiator[];
  comparisonTable: ComparisonRow[];
  faq: FaqItem[];
}

interface Props {
  data: ComparisonData;
  pageUrl: string;
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div key={item.id}>
          <button
            className="flex w-full items-center justify-between gap-4 py-5 text-left"
            onClick={() => setOpen(open === item.id ? null : item.id)}
            aria-expanded={open === item.id}
          >
            <span className="text-base font-semibold text-foreground">{item.question}</span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open === item.id ? 'rotate-180' : ''}`}
            />
          </button>
          {open === item.id && (
            <p className="pb-5 text-muted-foreground leading-relaxed">{item.answer}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ComparisonLayout({ data, pageUrl }: Props) {
  return (
    <main className="pt-16">
      <Helmet>
        <title>{data.metaTitle}</title>
        <meta name="description" content={data.metaDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={data.metaTitle} />
        <meta property="og:description" content={data.metaDescription} />
        <meta property="og:image" content="https://certxa.com/og-image.png" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={data.metaTitle} />
        <meta name="twitter:description" content={data.metaDescription} />
        <meta name="twitter:image" content="https://certxa.com/og-image.png" />
      </Helmet>

      {/* ── HERO ── */}
      <section className="py-xxl bg-secondary/40">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <motion.p variants={fadeUp} className="text-sm font-semibold text-primary mb-3 tracking-wide">
              {data.heroEyebrow}
            </motion.p>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-foreground mb-5 leading-tight">
              {data.heroHeadline}
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground mb-8 leading-relaxed">
              {data.heroSubhead}
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/auth?mode=register"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                {data.heroCta}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 border border-border text-foreground px-6 py-3 rounded-lg font-semibold hover:bg-muted/50 transition-colors"
              >
                {comparison_layout.heroSeePricingLabel}
              </Link>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-4 text-sm text-muted-foreground">
              {comparison_layout.heroBadge}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── OVERVIEW ── */}
      <section className="py-xxl border-b border-border">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <p className="text-lg font-bold text-foreground">{comparison_layout.overviewCertxaLabel}</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">{data.certxaSummary}</p>
            </motion.div>
            <motion.div variants={fadeUp} className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground">{data.competitor.charAt(0)}</span>
                </div>
                <p className="text-lg font-bold text-foreground">{data.competitor}</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">{data.competitorSummary}</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── DIFFERENTIATORS ── */}
      <section className="py-xxl border-b border-border">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {comparison_layout.differentiatorsSectionHeadline}
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                The features that matter most to {data.targetBusinesses}.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.differentiators.map((d) => (
                <motion.div
                  key={d.id}
                  variants={fadeUp}
                  className="bg-card border border-border rounded-2xl p-6"
                >
                  <h3 className="text-base font-bold text-foreground mb-4">{d.title}</h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-primary mb-1">{comparison_layout.overviewCertxaLabel}</p>
                        <p className="text-sm text-foreground leading-relaxed">{d.certxa}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-muted flex items-center justify-center">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">{data.competitor}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{d.competitor}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="py-xxl border-b border-border bg-secondary/20">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {comparison_layout.tableSectionHeadline}
              </h2>
              <p className="text-muted-foreground">
                <span>{comparison_layout.tableCertxaColLabel}</span>
                <span> vs {data.competitor} — side by side.</span>
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-6 font-semibold text-foreground w-1/2">{comparison_layout.tableFeatureColLabel}</th>
                    <th className="py-4 px-6 font-semibold text-primary text-center w-1/4">{comparison_layout.tableCertxaColLabel}</th>
                    <th className="py-4 px-6 font-semibold text-muted-foreground text-center w-1/4">{data.competitor}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparisonTable.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}
                    >
                      <td className="py-4 px-6 text-foreground">{row.feature}</td>
                      <td className="py-4 px-6 text-center">
                        {row.certxa ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 mx-auto">
                            <Check className="h-3.5 w-3.5 text-primary" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted mx-auto">
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {row.competitor ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted mx-auto">
                            <Check className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted mx-auto">
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-xxl border-b border-border">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            className="max-w-2xl mx-auto"
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {comparison_layout.faqSectionHeadline}
              </h2>
            </motion.div>
            <motion.div variants={fadeUp}>
              <FaqAccordion items={data.faq} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── SHARE ── */}
      <section className="py-xl border-b border-border bg-muted/30">
        <div className="max-w-content mx-auto px-6">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
          >
            <motion.div variants={fadeUp} className="max-w-sm">
              <p className="text-sm font-semibold text-foreground mb-1">
                Found this comparison helpful?
              </p>
              <p className="text-xs text-muted-foreground">
                Share it with a colleague who's evaluating salon software.
              </p>
            </motion.div>
            <motion.div variants={fadeUp}>
              <ShareBar
                url={pageUrl}
                title={`${data.metaTitle} — see the full feature comparison`}
                label="Share this page"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-xxl bg-primary">
        <div className="max-w-content mx-auto px-6 text-center">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              {comparison_layout.ctaHeadline}
            </motion.h2>
            <motion.p variants={fadeUp} className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              {comparison_layout.ctaSubhead}
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/auth?mode=register"
                className="inline-flex items-center justify-center gap-2 bg-primary-foreground text-primary px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                {comparison_layout.ctaPrimaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 border border-primary-foreground/30 text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary-foreground/10 transition-colors"
              >
                {comparison_layout.ctaSecondaryLabel}
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

    </main>
  );
}
