import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { changelog } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/changelog`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${PAGE_URL}#webpage`,
  name: "Certxa Changelog — What's New",
  url: PAGE_URL,
  description: 'Every update, fix, and new feature shipped to Certxa, in reverse chronological order.',
  isPartOf: { '@id': `${SITE}/#website` },
  about: { '@id': `${SITE}/#organization` },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const typeStyles: Record<string, { dot: string; badge: string }> = {
  feature:     { dot: 'bg-primary',        badge: 'bg-primary/10 text-primary' },
  improvement: { dot: 'bg-blue-500',       badge: 'bg-blue-50 text-blue-700' },
  fix:         { dot: 'bg-amber-500',      badge: 'bg-amber-50 text-amber-700' },
};

const typeLabel: Record<string, string> = {
  feature: 'New',
  improvement: 'Improved',
  fix: 'Fixed',
};

export default function ChangelogPage() {
  return (
    <>
      <Helmet>
        <title>Certxa Changelog — Latest Updates & New Features</title>
        <meta name="description" content="Every update, fix, and new feature shipped to Certxa salon software. See the release history, including AI receptionist, kiosk, POS and offline updates." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Certxa Changelog — Latest Updates & New Features" />
        <meta property="og:description" content="Every update, fix, and new feature shipped to Certxa salon software, in reverse chronological order." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Certxa Changelog — Latest Updates & New Features" />
        <meta name="twitter:description" content="Every update, fix, and new feature shipped to Certxa salon software, in reverse chronological order." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* HERO */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-2xl flex flex-col gap-5">
              <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">{changelog.hero.eyebrow}</motion.span>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{changelog.hero.headline}</h1>
              <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">{changelog.hero.subhead}</motion.p>
            </motion.div>
          </div>
        </section>

        {/* RELEASES */}
        <section className="py-xxl bg-background">
          <div className="max-w-4xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="flex flex-col gap-0">
              {changelog.releases.map((release, idx) => (
                <motion.div key={release.id} variants={fadeUp}
                  className="relative flex gap-8 pb-14 last:pb-0">

                  {/* Timeline line */}
                  {idx < changelog.releases.length - 1 && (
                    <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border" aria-hidden="true" />
                  )}

                  {/* Timeline dot */}
                  <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mt-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-lg font-extrabold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                        {release.version}
                      </span>
                      <time dateTime={release.date} className="text-sm text-muted-foreground">{release.date}</time>
                      <div className="flex gap-1.5">
                        {release.tags.map((tag) => (
                          <span key={tag} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeStyles[tag]?.badge ?? 'bg-muted text-muted-foreground'}`}>
                            {typeLabel[tag] ?? tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
                      {release.items.map((item) => (
                        <div key={item.id} className="flex gap-3 items-start">
                          <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${typeStyles[item.type]?.dot ?? 'bg-muted-foreground'}`} aria-hidden="true" />
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${typeStyles[item.type]?.badge ?? 'bg-muted text-muted-foreground'}`}>
                              {typeLabel[item.type] ?? item.type}
                            </span>
                            <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
