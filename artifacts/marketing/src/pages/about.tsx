import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { about } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/about`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      '@id': `${PAGE_URL}#webpage`,
      name: 'About Certxa — Salon Software Built by Salon People',
      url: PAGE_URL,
      description: 'Meet the team behind Certxa — our mission, values, and why we built the all-in-one salon booking software and POS platform.',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'About', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'Person',
      '@id': `${SITE}/#founder-tom-tham`,
      name: 'Thanh Lam',
      alternateName: 'Tom Tham',
      url: `${SITE}/about`,
      jobTitle: 'Founder',
      worksFor: { '@id': `${SITE}/#organization` },
      description: 'Former nail salon owner and founder of Certxa. Built the platform after experiencing firsthand the limitations of existing salon software.',
    },
    {
      '@type': 'Person',
      '@id': `${SITE}/#toby-benjamin`,
      name: 'Toby Benjamin',
      jobTitle: 'SaaS Developer',
      worksFor: { '@id': `${SITE}/#organization` },
    },
  ],
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About Certxa — Salon Software Built by Salon People</title>
        <meta name="description" content="Certxa was built by a former nail salon owner frustrated with clunky software. Meet the team, our mission, and the values behind the all-in-one salon management platform." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="About Certxa — Salon Software Built by Salon People" />
        <meta property="og:description" content="Meet the team behind Certxa — our mission, values, and why we built the all-in-one salon management platform." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Certxa — Salon Software Built by Salon People" />
        <meta name="twitter:description" content="Meet the team behind Certxa — our mission, values, and why we built the all-in-one salon management platform." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* HERO */}
        <section className="bg-background border-b border-border overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[92vh]">
              {/* Photo — left column, full bleed height */}
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative w-full h-[420px] lg:h-auto lg:-ml-6 xl:-ml-10 order-2 lg:order-1"
              >
                <img
                  src="/airo-assets/images/team/thanh-lam-founder"
                  alt="Thanh Lam, Founder of Certxa"
                  width={1145}
                  height={1374}
                  className="w-full h-full object-cover object-top"
                  loading="eager"
                  fetchPriority="high"
                />
              </motion.div>

              {/* Text — right column */}
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="flex flex-col justify-center gap-6 py-16 lg:py-20 lg:pl-14 xl:pl-20 order-1 lg:order-2"
              >
                <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">{about.hero.eyebrow}</motion.span>
                <h1
                  className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {about.hero.headline}
                </h1>
                <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">{about.hero.subhead}</motion.p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* MISSION + VALUES */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <motion.div variants={fadeUp} className="flex flex-col gap-5">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{about.mission.heading}</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">{about.mission.body}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {about.values.map((v) => (
                  <div key={v.id} className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3">
                    <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{v.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{v.body}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* TEAM */}
        <section className="py-xxl bg-muted">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-12">
              <motion.div variants={fadeUp} className="text-center max-w-xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>Meet the team</h2>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto w-full">
                {about.team.map((member) => (
                  <motion.div key={member.id} variants={fadeUp}
                    className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-xl font-bold text-primary" style={{ fontFamily: 'var(--font-heading)' }}>
                        {member.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">{member.name}</p>
                      <p className="text-xs text-primary font-medium mt-0.5">{member.role}</p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="rounded-3xl bg-primary p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <motion.div variants={fadeUp} className="flex flex-col gap-3 max-w-xl">
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{about.cta.heading}</h2>
                <p className="text-primary-foreground/80 leading-relaxed">{about.cta.subhead}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="shrink-0">
                <Link to="/contact"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-all duration-200">
                  {about.cta.button}
                  <ArrowRight size={16} />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
