import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { ArrowRight, Check } from 'lucide-react';

/**
 * "Nail salon software" — the broad page for every US nail salon (2026-11-05). It used to 301 to the
 * Vietnamese-salon page, which left the head term without a page of its own; that page stays for its own
 * audience and the two link to each other.
 *
 * Every claim here is true of the product as built: online booking with text and e-mail reminders, walk-in
 * tickets and the waitlist, six turn methods, check-in kiosk, POS with tip split, cash price, gift cards and the
 * Stripe M2 reader, commissions and payroll, loyalty, review requests, reports, offline tickets and cash sales,
 * Autumn calls 20 / 50 / 100 then $0.50. Marketing rules kept: no deposits, no native-app claims, support is not
 * 24/7, no offline-card claim, plan prices and trial as on /pricing.
 */

const SITE = 'https://certxa.com';
const PATH = '/nail-salon-software';
const PAGE_URL = `${SITE}${PATH}`;
const OG_IMAGE = `${SITE}/assets/images/og-image.jpg`;

const META_TITLE = 'Nail Salon Software | Booking, POS, Turns & Payroll | Certxa';
const META_DESCRIPTION =
  'Nail salon software for US salons: online booking, walk-in turn rotation, POS with tips per tech, payroll and an AI receptionist. Solo free; teams from $29/mo.';

const DOES = [
  { title: 'Booking and reminders', body: 'Clients book online around the clock from your website, a direct link, Google or Instagram, and choose their technician. Text and e-mail reminders go out before every appointment, and a waitlist fills the gaps from cancellations.' },
  { title: 'Walk-ins and turns', body: 'Every walk-in gets a ticket number and joins the turn line. Six turn methods are built in, including dollar-based turns and counted turns with half turns, and a manager can adjust turns by hand.' },
  { title: 'Check-in kiosk', body: 'Clients check in by phone number on a tablet at the door and pick their services. The kiosk speaks English, Spanish, Vietnamese, Chinese and Korean.' },
  { title: 'Front desk POS', body: 'Check out the ticket, split the tip between technicians, offer a cash price, sell and redeem gift cards and take cards on the Stripe M2 reader. A customer screen shows the total and lets the client choose a tip.' },
  { title: 'Commissions and payroll', body: 'Commission on services and products, supply-fee deductions, pay part by check and part in cash, print paychecks, and let each technician print their own pay slip.' },
  { title: 'Clients, loyalty and reviews', body: 'One client record with visit history and notes, a points program you set, and review requests sent after each visit.' },
  { title: 'Reports and day close', body: 'Sales, tips, technician pay, client retention and cash reports, and a day close with a cash count and printed report for each drawer.' },
  { title: 'Autumn, the AI receptionist', body: 'Autumn answers the salon phone, books, moves and cancels appointments, and knows when each technician works. She is included on Starter, Professional and Enterprise.' },
];

const CHECKLIST = [
  { q: 'Does it handle walk-ins, not just appointments?', a: 'Most nail salons run on walk-ins. Look for tickets, a waitlist and a turn line that decides who gets the next client.' },
  { q: 'Does the turn system match your rules?', a: 'Salons count turns differently: by client, by dollars, with half turns for small services. The software should follow your rules instead of making you change them.' },
  { q: 'Can technicians split tips and see their pay?', a: 'Tips per technician on one ticket, commission on services, and pay slips technicians can print themselves save the owner hours every pay period.' },
  { q: 'Does it keep working when the internet drops?', a: 'A busy Saturday should not stop at the front desk. Ask what still works during an outage.' },
  { q: 'Is it one system or several subscriptions?', a: 'Check-in, booking, the POS and payroll from different vendors means several monthly fees and several client lists.' },
  { q: 'Can your staff read it?', a: 'Many nail salon teams work in more than one language. Screens your technicians can read in their own language cut mistakes at checkout.' },
];

const PRICES = [
  { plan: 'Solo', price: 'Free', note: 'One technician working on their own' },
  { plan: 'Starter', price: '$29 a month', note: 'Up to 3 staff; 20 Autumn calls a month' },
  { plan: 'Professional', price: '$99 a month', note: 'Up to 12 staff; 50 Autumn calls a month' },
  { plan: 'Enterprise', price: '$179 a month', note: 'Larger salons or several locations; 100 Autumn calls a month' },
];

const FAQ = [
  { q: 'What is nail salon software?', a: 'Nail salon software is the system a nail salon uses to run the day: booking appointments, checking in walk-ins, deciding which technician takes the next client, checking out tickets and taking payment, splitting tips, and paying technicians. Certxa puts all of these in one system for US nail salons.' },
  { q: 'What is the best software for a nail salon?', a: 'The best fit is the one that handles walk-ins and turns the way your salon already works, not only appointments. Certxa is built around nail salons: walk-in tickets, six turn methods, tip split per technician, technician pay slips, a check-in kiosk and an AI receptionist, with a free Solo plan and team plans from $29 a month.' },
  { q: 'How much does nail salon software cost?', a: 'Certxa is free for one technician working alone. Salons with a team use Starter at $29 a month for up to 3 staff, Professional at $99 a month for up to 12, or Enterprise at $179 a month for larger salons. There is no setup fee, and paid plans start with a 60-day free trial with no credit card needed.' },
  { q: 'Does Certxa handle walk-ins and turns?', a: 'Yes. Every walk-in gets a ticket and joins the turn line. Certxa has six turn methods, including dollar-based turns and counted turns with half turns, and a manager can adjust turns by hand.' },
  { q: 'Can clients book nail appointments online?', a: 'Yes. Clients book around the clock from your website, a booking link, Google or Instagram, choose their technician, and get text and e-mail reminders before the appointment.' },
  { q: 'What happens if the internet goes down?', a: 'Tickets, check-ins and cash sales keep working on the tablet and are sent to the server when the connection comes back.' },
  { q: 'What hardware do I need?', a: 'Certxa runs on touchscreen tablets and computers you may already have, with the Stripe M2 card reader for card payments and a receipt printer and cash drawer at the front desk.' },
  { q: 'Is Certxa available in Vietnamese?', a: 'Yes. Each POS tablet switches between English, Vietnamese and Spanish, and the check-in kiosk offers English, Spanish, Vietnamese, Chinese and Korean.' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${PAGE_URL}#webpage`,
      name: META_TITLE,
      url: PAGE_URL,
      inLanguage: 'en',
      description: META_DESCRIPTION,
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#software` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Nail salon software', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${PAGE_URL}#faq`,
      inLanguage: 'en',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

const heading = { fontFamily: 'var(--font-heading)' };

export default function NailSalonSoftwarePage() {
  return (
    <>
      <Helmet>
        <title>{META_TITLE}</title>
        <meta name="description" content={META_DESCRIPTION} />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content={META_TITLE} />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META_TITLE} />
        <meta name="twitter:description" content={META_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16">
        {/* ── Hero: the answer first ── */}
        <section className="bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 py-20 flex flex-col gap-6">
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">Nail salon software</span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight" style={heading}>
              Nail salon software for booking, walk-ins, checkout and payroll
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
              Certxa is nail salon software for salons in the United States. It runs online booking, walk-in tickets and the
              turn line, the check-in kiosk, checkout with tips per technician, commissions and payroll, and an AI phone
              receptionist in one system. One technician uses it free; salons with a team pay from $29 a month, with no setup fee.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/auth?mode=register" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200">
                Start free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors duration-200">
                See pricing
              </Link>
            </div>
          </div>
        </section>

        {/* ── What it does ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={heading}>What Certxa does for a nail salon</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DOES.map((f) => (
                <div key={f.title} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                  <h3 className="font-bold text-foreground" style={heading}>{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How to choose ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={heading}>How to choose nail salon software</h2>
              <p className="text-muted-foreground leading-relaxed">
                General salon software is built around appointments. A nail salon also needs to handle walk-ins, turns and
                tips shared between technicians. Six questions to ask before you choose:
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {CHECKLIST.map((item) => (
                <li key={item.q} className="flex items-start gap-3">
                  <span className="mt-1 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold text-foreground">{item.q}</span>
                    <span className="text-sm text-muted-foreground leading-relaxed">{item.a}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              More on this:{' '}
              <Link to="/nail-salon-turn-system" className="text-primary font-semibold underline underline-offset-4">how the nail salon turn system works</Link>
              {' · '}
              <Link to="/vietnamese-nail-salon-software" className="text-primary font-semibold underline underline-offset-4">software for Vietnamese-owned nail salons</Link>
              {' · '}
              <a href="/blog/how-to-choose-nail-salon-software" className="text-primary font-semibold underline underline-offset-4">how to choose nail salon software</a>
            </p>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col gap-8">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={heading}>Pricing</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRICES.map((p) => (
                <div key={p.plan} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-primary tracking-widest uppercase">{p.plan}</span>
                  <span className="text-2xl font-extrabold text-foreground" style={heading}>{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.note}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              No setup fee. Paid plans start with a 60-day free trial, no credit card needed. Autumn calls past the allowance are
              $0.50 each.{' '}
              <Link to="/pricing" className="text-primary font-semibold underline underline-offset-4">See pricing</Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Comparing options?{' '}
              <Link to="/compare/certxa-vs-glossgenius" className="text-primary font-semibold underline underline-offset-4">GlossGenius</Link>
              {' · '}
              <Link to="/compare/certxa-vs-vagaro" className="text-primary font-semibold underline underline-offset-4">Vagaro</Link>
              {' · '}
              <Link to="/compare/certxa-vs-fresha" className="text-primary font-semibold underline underline-offset-4">Fresha</Link>
              {' · '}
              <Link to="/compare/certxa-vs-square" className="text-primary font-semibold underline underline-offset-4">Square</Link>
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={heading}>Questions salon owners ask</h2>
            {FAQ.map((f) => (
              <div key={f.q} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                <h3 className="font-bold text-foreground" style={heading}>{f.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final call to action ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="rounded-3xl bg-primary p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex flex-col gap-3 max-w-xl">
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={heading}>Try Certxa in your salon</h2>
                <p className="text-primary-foreground/80">Set up your services and technicians in an afternoon. No setup fee, and the Solo plan is free.</p>
              </div>
              <Link to="/auth?mode=register" className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-opacity duration-200">
                Start free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
