import { Helmet } from '@dr.pogodin/react-helmet';
import BuyButton from '@/components/BuyButton';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check, Zap } from 'lucide-react';
import { products } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/products`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// Each main product's picture, by its id in content/pages/products.json.
const mainProductImages: Record<string, string> = {
  'prod-station': '/_site/images/products/certxa-station.webp', // Certxa Station — SalonOS scheduling terminal (owner, 2026-10-24)
  'prod-kiosk': '/airo-assets/images/products/tablet-stand',
  'prod-reader': '/_site/images/products/stripe-m2-reader.webp', // Stripe M2 card reader (owner, 2026-10-24)
};
// The Certxa Station, large, at the top of the page (owner, 2026-10-24: the main POS front and centre).
const HERO_IMAGE = '/_site/images/products/certxa-station-hero.webp';

/**
 * The Certxa Kiosk is shown only to nail salons (owner, 2026-10-24): signing up as a nail salon sets the
 * certxa_nail cookie (api-server routes.ts, /api/onboarding). Read after the page loads, so the server-rendered
 * page never has it.
 */
function useNailSalonVisitor(): boolean {
  const [nail, setNail] = useState(false);
  useEffect(() => {
    try { setNail(/(?:^|;\s*)certxa_nail=1(?:;|$)/.test(document.cookie)); } catch { /* no cookies: not shown */ }
  }, []);
  return nail;
}

const accessoryImages = [
  '/_site/images/products/certxa-check-in-tablet.webp', // customer-facing check-in tablet (owner, 2026-10-24)
  '/_site/images/products/certxa-thermal-printer.webp', // matte black thermal printer (owner, 2026-10-24)
  '/_site/images/products/certxa-cash-drawer.webp', // Certxa cash drawer (owner, 2026-10-24)
  '/airo-assets/images/products/barcode-scanner',
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${PAGE_URL}#webpage`,
      name: 'Salon POS Hardware — Certxa | Terminals, Kiosks & Card Readers',
      url: PAGE_URL,
      description:
        'Shop Certxa POS hardware for salons and beauty businesses — terminals, wireless card readers, receipt printers, cash drawers, and more. Plug-and-play, same-day ready.',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Hardware', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'ItemList',
      '@id': `${PAGE_URL}#products`,
      name: 'Certxa Salon POS Hardware',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: {
            '@type': 'Product',
            name: 'Certxa Station',
            description: 'All-in-one 15" HD touchscreen POS terminal for salon front desks.',
            image: `${SITE}${mainProductImages['prod-station']}`,
            brand: { '@type': 'Brand', name: 'Certxa' },
            offers: { '@type': 'Offer', price: '799', priceCurrency: 'USD', url: PAGE_URL },
          },
        },
        {
          '@type': 'ListItem',
          position: 2,
          item: {
            '@type': 'Product',
            name: 'Wireless Card Reader',
            description: 'Stripe M2 wireless card reader. Chip, tap, and swipe.',
            image: `${SITE}${mainProductImages['prod-reader']}`,
            brand: { '@type': 'Brand', name: 'Certxa' },
            offers: { '@type': 'Offer', price: '69', priceCurrency: 'USD', url: PAGE_URL },
          },
        },
      ],
    },
  ],
};

export default function ProductsPage() {
  const nailSalon = useNailSalonVisitor();
  const station = products.mainProducts.find((p) => p.id === 'prod-station');
  // Below the hero: the rest of the main hardware (the kiosk only for nail salons).
  const setup = products.mainProducts.filter((p) => p.id !== 'prod-station' && (p.id !== 'prod-kiosk' || nailSalon));
  return (
    <>
      <Helmet>
        <title>Salon POS Hardware — Certxa | Terminals, Kiosks & Card Readers</title>
        <meta
          name="description"
          content="Shop Certxa POS hardware for nail salons, hair salons, barbershops, spas, and more — all-in-one terminals, self check-in kiosks, wireless card readers, receipt printers, and cash drawers. Plug-and-play, same-day ready."
        />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Salon POS Hardware — Certxa | Terminals, Kiosks & Card Readers" />
        <meta
          property="og:description"
          content="Certxa Station, customer check-in screens, and wireless card readers built for nail salons, hair salons, barbershops, spas, and more. Plug-and-play hardware that works with your Certxa account from day one."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Salon POS Hardware — Certxa | Terminals, Kiosks & Card Readers" />
        <meta
          name="twitter:description"
          content="Certxa Station, customer check-in screens, and wireless card readers built for nail salons, hair salons, barbershops, spas, and more."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="pt-16">

        {/* ── HERO: the Certxa Station, front and centre ── */}
        <section className="relative overflow-hidden bg-background pt-xl pb-xxl" aria-label="Certxa Station">
          <div className="relative max-w-7xl mx-auto px-6 md:px-10">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col items-center text-center gap-5 max-w-3xl mx-auto">
              <motion.span variants={fadeUp} className="text-xs font-semibold tracking-widest text-primary uppercase">
                {products.hero.eyebrow}
              </motion.span>
              <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                {products.hero.headline}
              </h1>
              <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                {products.hero.subhead}
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
              className="mt-10 md:mt-12 max-w-6xl mx-auto"
            >
              <img
                src={HERO_IMAGE}
                alt="Certxa Station all-in-one salon POS terminal showing the appointment calendar"
                className="w-full h-auto rounded-3xl"
                loading="eager"
                fetchPriority="high"
                width={1536}
                height={1024}
              />
            </motion.div>

            {station && (
              <motion.div variants={stagger} initial="hidden" animate="visible" className="mt-6 flex flex-col items-center text-center gap-5 max-w-3xl mx-auto">
                <motion.div variants={fadeUp}>
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{station.name}</h2>
                  <p className="mt-2 text-muted-foreground text-lg">{station.tagline}</p>
                </motion.div>
                <motion.ul variants={fadeUp} className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                  {station.highlights.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 text-sm text-foreground">
                      <Check size={14} className="text-primary" />
                      {h.text}
                    </li>
                  ))}
                </motion.ul>
                <motion.div variants={fadeUp} className="flex flex-col items-center gap-4 pt-2">
                  <span className="text-4xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{station.price}</span>
                  <div className="flex flex-wrap justify-center gap-4">
                    <BuyButton
                      productName={station.name}
                      className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                    >
                      {station.cta}
                      <ArrowRight size={16} />
                    </BuyButton>
                    <Link
                      to="/contact"
                      className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:-translate-y-px transition-all duration-200"
                    >
                      Talk to sales
                    </Link>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </div>
        </section>

        {/* ── MAIN PRODUCTS ── */}
        <section className="py-xxl bg-background border-t border-border" aria-label="Main hardware products">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-6 mb-16 max-w-2xl"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Choose your setup.
              </motion.h2>
              <motion.p variants={fadeUp} className="text-muted-foreground text-lg">
                Every device is plug-and-play and works with your Certxa account from day one.
              </motion.p>
            </motion.div>

            <div className={`grid grid-cols-1 gap-8 ${setup.length >= 3 ? 'md:grid-cols-3' : setup.length === 2 ? 'md:grid-cols-2 max-w-5xl' : 'max-w-xl'}`}>
              {setup.map((prod) => (
                <motion.div
                  key={prod.id}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden hover:-translate-y-1 transition-transform duration-300"
                >
                  {/* Badge */}
                  {prod.badge && (
                    <span className="absolute top-4 left-4 z-10 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1 rounded-full">
                      {prod.badge}
                    </span>
                  )}

                  {/* Product image */}
                  <div className="relative bg-background flex items-center justify-center p-6 min-h-[280px]">
                    <img
                      src={mainProductImages[prod.id]}
                      alt={prod.name}
                      className="w-full h-auto object-contain"
                      loading="lazy"
                      width={600}
                      height={600}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex flex-col gap-4 p-7 flex-1">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{prod.tagline}</p>
                      <h3
                        className="text-2xl font-bold text-foreground"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {prod.name}
                      </h3>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {prod.description}
                    </p>

                    <ul className="flex flex-col gap-2 mt-1">
                      {prod.highlights.map((h) => (
                        <li key={h.id} className="flex items-center gap-2.5 text-sm text-foreground">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
                            <Check size={10} className="text-primary" />
                          </span>
                          {h.text}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto pt-4 border-t border-border">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className="text-3xl font-extrabold text-foreground"
                          style={{ fontFamily: 'var(--font-heading)' }}
                        >
                          {prod.price}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">{prod.financing}</p>
                      {prod.price === 'Free' ? (
                        // Included with the Professional plan: the way to get it is to sign up.
                        <Link
                          to="/auth?mode=register&plan=professional"
                          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all duration-200"
                        >
                          {prod.cta}
                          <ArrowRight size={15} />
                        </Link>
                      ) : (
                        <BuyButton
                          productName={prod.name}
                          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all duration-200"
                        >
                          {prod.cta}
                          <ArrowRight size={15} />
                        </BuyButton>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ACCESSORIES ── */}
        <section className="py-xxl bg-muted" aria-label="Accessories">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-6 mb-12 max-w-2xl"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Accessories and add-ons.
              </motion.h2>
              <motion.p variants={fadeUp} className="text-muted-foreground text-lg">
                Complete your setup with hardware that connects directly to your Certxa devices.
              </motion.p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.accessories.map((acc, i) => (
                <motion.div
                  key={acc.id}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 flex flex-col"
                >
                  <div className="aspect-square bg-background overflow-hidden">
                    <img
                      src={accessoryImages[i]}
                      alt={acc.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={600}
                      height={600}
                    />
                  </div>
                  <div className="p-6 flex flex-col gap-3 flex-1">
                    <h3 className="text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                      {acc.name}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                      {acc.description}
                    </p>
                    <p className="text-xs text-muted-foreground">{acc.compatible}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                        {acc.price}
                      </span>
                      <BuyButton
                        productName={acc.name}
                        className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Order
                        <ArrowRight size={13} />
                      </BuyButton>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PAYMENTS RATES ── */}
        <section className="py-xxl bg-background" aria-label="Payment processing rates">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-12"
            >
              <motion.div variants={fadeUp} className="max-w-2xl">
                <h2
                  className="text-3xl md:text-4xl font-bold text-foreground mb-4"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {products.payments.headline}
                </h2>
                <p className="text-muted-foreground text-lg">{products.payments.subhead}</p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
                {products.payments.tiers.map((tier) => (
                  <motion.div
                    key={tier.id}
                    variants={fadeUp}
                    className="rounded-2xl border border-border bg-card p-8 flex flex-col gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Zap size={14} className="text-primary" />
                      </span>
                      <span className="text-sm font-semibold text-foreground">{tier.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tier.volume}</p>
                    <div>
                      <span
                        className="text-4xl font-extrabold text-foreground"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {tier.rate}
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">{tier.rateNote}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{tier.monthly}</p>
                  </motion.div>
                ))}
              </div>

              <motion.p variants={fadeUp} className="text-sm text-muted-foreground">
                {products.payments.note}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-muted" aria-label="Hardware FAQ">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-col gap-12"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Hardware FAQ.
              </motion.h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
                {products.faq.map((item) => (
                  <motion.div key={item.id} variants={fadeUp} className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
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
                  {products.cta.headline}
                </motion.h2>
                <motion.p variants={fadeUp} className="text-lg text-muted-foreground">
                  {products.cta.subhead}
                </motion.p>
                <motion.div variants={fadeUp} className="flex flex-wrap gap-4">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:-translate-y-px transition-all duration-200"
                  >
                    {products.cta.button}
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/auth?mode=register"
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all duration-200"
                  >
                    {products.cta.secondary}
                  </Link>
                </motion.div>
              </div>
              <div className="hidden lg:flex items-center justify-center" aria-hidden="true">
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
