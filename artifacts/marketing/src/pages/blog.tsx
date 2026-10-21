import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ArrowRight, Clock } from 'lucide-react';
import { blog } from 'virtual:content';
import ShareBar from '@/components/ShareBar';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/blog`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Blog',
      '@id': `${PAGE_URL}#webpage`,
      name: 'Certxa Blog — Salon Business Tips, Guides & Industry News',
      url: PAGE_URL,
      description: 'Tips, guides, and industry news to help nail salons, hair salons, barbershops, spas, and massage studios run more profitably.',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: PAGE_URL },
        ],
      },
    },
  ],
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const categoryColors: Record<string, string> = {
  Operations: 'bg-blue-50 text-blue-700',
  Growth: 'bg-green-50 text-green-700',
  Technology: 'bg-primary/10 text-primary',
  Hardware: 'bg-orange-50 text-orange-700',
  Payments: 'bg-emerald-50 text-emerald-700',
};

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState('All');

  return (
    <>
      <Helmet>
        <title>Certxa Blog — Salon Software Tips, Booking Guides & Business Advice</title>
        <meta name="description" content="Expert tips and guides for nail salon, hair salon, barbershop, spa, and massage studio owners. Waitlist management, turn rotation, loyalty programs, AI receptionists, and more — updated weekly." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Certxa Blog — Salon Software Tips, Booking Guides & Business Advice" />
        <meta property="og:description" content="Expert tips and guides for nail salon, hair salon, barbershop, spa, and massage studio owners. Turn rotation, loyalty programs, AI receptionists, and more." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Certxa Blog — Salon Software Tips, Booking Guides & Business Advice" />
        <meta name="twitter:description" content="Expert tips and guides for nail salon, hair salon, barbershop, spa, and massage studio owners. Turn rotation, loyalty programs, AI receptionists, and more." />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">

        {/* HERO */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-2xl flex flex-col gap-5">
              <motion.span variants={fadeUp} className="text-xs font-semibold text-primary tracking-widest uppercase">{blog.hero.eyebrow}</motion.span>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{blog.hero.headline}</h1>
              <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">{blog.hero.subhead}</motion.p>
            </motion.div>
          </div>
        </section>

        {/* POSTS */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-10">

            {/* Category filter */}
            <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
              {blog.categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.label)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeCategory === cat.label
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>

            {/* Grid */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {blog.posts.map((post) => (
                <motion.article
                  key={post.id}
                  variants={fadeUp}
                  className={`bg-card border border-border rounded-2xl p-7 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300 group ${
                    activeCategory !== 'All' && post.category !== activeCategory ? 'hidden' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[post.category] ?? 'bg-muted text-muted-foreground'}`}>
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200" style={{ fontFamily: 'var(--font-heading)' }}>
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{post.excerpt}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">{post.date}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all duration-200">
                      Read more <ArrowRight size={12} />
                    </span>
                  </div>
                </motion.article>
              ))}
            </motion.div>

          </div>
        </section>

        {/* ── SHARE ── */}
        <section className="py-xl bg-muted border-t border-border">
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
                  Know a salon owner who'd find this useful?
                </p>
                <p className="text-xs text-muted-foreground">
                  Share the Certxa blog with your network.
                </p>
              </motion.div>
              <motion.div variants={fadeUp}>
                <ShareBar
                  url={PAGE_URL}
                  title="Certxa Blog — salon software tips, booking guides & business advice for beauty professionals"
                  label="Share the blog"
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

      </main>
    </>
  );
}
