import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Check, Copy, Mail, ExternalLink } from 'lucide-react';
import { backlinks_trade_publications as c } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/backlinks/trade-publications`;

interface Publication {
  name: string;
  url: string;
  contact: string;
  contactType: string;
  section: string;
  angle: string;
}

const publications: Publication[] = [
  {
    name: 'Nailpro Magazine',
    url: 'https://www.nailpro.com',
    contact: 'editorial@nailpro.com',
    contactType: 'Email',
    section: 'Business & Technology',
    angle: 'Former nail salon owner builds the software she always wished existed',
  },
  {
    name: 'Modern Salon',
    url: 'https://www.modernsalon.com',
    contact: 'https://www.modernsalon.com/contact',
    contactType: 'Contact form',
    section: 'Tech Tools / Business',
    angle: 'All-in-one platform replacing 4–5 separate tools salon owners juggle daily',
  },
  {
    name: 'Barber Magazine',
    url: 'https://www.barbermag.com',
    contact: 'https://www.barbermag.com/contact',
    contactType: 'Contact form',
    section: 'Business & Products',
    angle: 'Turn rotation and walk-in management built specifically for high-volume shops',
  },
  {
    name: 'Salon Today',
    url: 'https://www.salontoday.com',
    contact: 'https://www.salontoday.com/contact',
    contactType: 'Contact form',
    section: 'Technology / Business Tools',
    angle: 'Autumn AI receptionist handles after-hours bookings so owners can focus on clients',
  },
  {
    name: 'Behind the Chair',
    url: 'https://www.behindthechair.com',
    contact: 'https://www.behindthechair.com/contact',
    contactType: 'Contact form',
    section: 'Community / Business',
    angle: 'Built by a salon owner — not a tech company that has never held a nail file',
  },
  {
    name: 'American Salon',
    url: 'https://www.americansalon.com',
    contact: 'https://www.americansalon.com/contact',
    contactType: 'Contact form',
    section: 'Business Tools Column',
    angle: 'Free hardware bundle with Pro plan — zero upfront cost to modernize your checkout',
  },
];

function buildPitch(pub: Publication): string {
  return `Subject: Founder story pitch — Certxa salon management platform

Hi [Editor's name],

I'm Thanh Lam, founder of Certxa (certxa.com) — an all-in-one salon management platform I built after running my own nail salon and hitting the same walls every owner does: juggling four different apps, losing clients to missed calls, and spending Sunday nights doing payroll instead of resting.

Certxa brings booking, POS, turn rotation, loyalty programs, and an AI receptionist called Autumn into one platform — with hardware included on the Pro plan.

I'd love to share this story with ${pub.name}'s readers. The angle I think fits your ${pub.section} section best: ${pub.angle}.

I'm happy to offer:
- An exclusive founder interview
- A contributed piece on [relevant topic for your audience]
- A free trial account for your editorial team to test

Would this fit your editorial calendar? I can send over more details, screenshots, or a product walkthrough at your convenience.

Thanks for your time,

Thanh Lam
Founder, Certxa
thanh@certxa.com
certxa.com`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary transition-colors duration-150"
    >
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export default function TradePublicationsPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <Helmet>
        <title>Trade Publication Pitches — Certxa Backlink Strategy</title>
        <meta name="description" content="Ready-to-send pitch emails for Nailpro, Modern Salon, Barber Magazine, Salon Today, Behind the Chair, and American Salon." />
        <link rel="canonical" href={PAGE_URL} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="pt-16 pb-xxl">
        <div className="max-w-4xl mx-auto px-6 md:px-10">

          {/* Header */}
          <div className="py-12 border-b border-border mb-10">
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">{c.eyebrow}</span>
            <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-foreground tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              {c.heading}
            </h1>
            <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
              {c.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border">
                <Mail size={13} />
                {c.badges.count}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border">
                {c.badges.angle}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border">
                {c.badges.personalised}
              </span>
            </div>
          </div>

          {/* Publication cards */}
          <div className="flex flex-col gap-4">
            {publications.map((pub) => {
              const pitch = buildPitch(pub);
              const isOpen = open === pub.name;
              return (
                <div key={pub.name} className="rounded-2xl border border-border bg-card overflow-hidden">
                  {/* Row header */}
                  <button
                    onClick={() => setOpen(isOpen ? null : pub.name)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-muted/40 transition-colors duration-150"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>{pub.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{pub.angle}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="hidden sm:inline text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                        {pub.section}
                      </span>
                      <span className="text-xs font-medium text-primary">{isOpen ? 'Collapse' : 'View pitch'}</span>
                    </div>
                  </button>

                  {/* Expanded pitch */}
                  {isOpen && (
                    <div className="border-t border-border px-6 pb-6 pt-5 flex flex-col gap-4">
                      {/* Contact info */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Contact:</span>
                        {pub.contactType === 'Email' ? (
                          <a href={`mailto:${pub.contact}`} className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                            <Mail size={13} />
                            {pub.contact}
                          </a>
                        ) : (
                          <a href={pub.contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                            <ExternalLink size={13} />
                            {pub.contactType}
                          </a>
                        )}
                        <a href={pub.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs">
                          <ExternalLink size={12} />
                          {pub.url.replace('https://www.', '')}
                        </a>
                      </div>

                      {/* Pitch email */}
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted rounded-xl p-5 border border-border leading-relaxed overflow-x-auto">
                          {pitch}
                        </pre>
                        <div className="mt-3 flex gap-2">
                          <CopyButton text={pitch} label="Copy full email" />
                          <CopyButton text={`Subject: Founder story pitch — Certxa salon management platform`} label="Copy subject line" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tips */}
          <div className="mt-12 rounded-2xl border border-border bg-muted p-6 flex flex-col gap-3">
            <h2 className="font-bold text-foreground text-sm" style={{ fontFamily: 'var(--font-heading)' }}>{c.tips.heading}</h2>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground list-disc list-inside">
              {c.tips.items.map((tip) => (
                <li key={tip.id}>{tip.text}</li>
              ))}
            </ul>
          </div>

        </div>
      </main>
    </>
  );
}
