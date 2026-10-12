import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { careers } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/careers`;
const OG_IMAGE = `${SITE}/og-image.png`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${PAGE_URL}#webpage`,
  name: 'Careers at Certxa',
  url: PAGE_URL,
  description: 'Careers at Certxa — coming soon.',
  isPartOf: { '@id': `${SITE}/#website` },
  about: { '@id': `${SITE}/#organization` },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } };

export default function CareersPage() {
  return (
    <>
      <Helmet>
        <title>Careers — Certxa</title>
        <meta name="description" content="Careers at Certxa — coming soon. We're growing fast. Check back soon or get in touch." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Careers — Certxa" />
        <meta property="og:description" content="We're not hiring yet, but we're growing fast. Check back soon." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Careers — Certxa" />
        <meta name="twitter:description" content="We're not hiring yet, but we're growing fast. Check back soon." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16 min-h-[70vh] flex items-center">
        <section className="w-full py-xxxl">
          <div className="max-w-2xl mx-auto px-6 md:px-10 text-center">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col items-center gap-6">
              <motion.span
                variants={fadeUp}
                className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide"
              >
                <span>{careers.eyebrow}</span>
              </motion.span>

              <motion.h1
                variants={fadeUp}
                className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {careers.headline}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="text-lg text-muted-foreground leading-relaxed max-w-lg"
              >
                {careers.subhead}
              </motion.p>

              <motion.div variants={fadeUp}>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  {careers.cta}
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
    </>
  );
}
