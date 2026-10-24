import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Check,
  Copy,
  ExternalLink,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Rocket,
  User,
  Image,
  MessageSquare,
  Calendar,
  Trophy,
  Zap,
} from 'lucide-react';

// ─── Copy-to-clipboard hook ───────────────────────────────────────────────────
function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };
  return { copiedKey, copy };
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const TAGLINE = 'The all-in-one salon software with a 24/7 AI receptionist';

const DESCRIPTION = `Certxa is salon management software built for nail salons, hair salons, barbershops, spas, and massage studios — by someone who actually ran one.

Most salon software is either too basic or too bloated. Certxa hits the sweet spot: online booking, a salon POS, self check-in kiosk, waitlist and turn rotation, loyalty programs, staff payroll, and review automation — all in one place. Solo is free; team plans start at $22/mo.

The standout feature is **Autumn**, our AI receptionist. She answers every call in under 2 seconds, 24/7. She books new appointments, handles rescheduling and cancellations, answers questions about services and pricing, upsells add-ons, and checks your live wait board so callers always get accurate information — not a voicemail.

Most salons miss 30–40% of their calls. Autumn fixes that.

**What makes Certxa different:**
→ Built by a salon owner, not a tech company
→ Autumn AI answers every call — even at 2am
→ Self check-in kiosk in 5 languages (EN, ES, VI, ZH, KO)
→ Turn rotation keeps walk-in assignments fair automatically
→ 60-day free trial

We'd love your feedback — especially from anyone who has worked in or owned a beauty business.`;

const FIRST_COMMENT = `Hey Product Hunt! 👋 I'm Thanh, founder of Certxa.

I built this because I ran a nail salon and couldn't find software that actually fit how a salon works. Everything was either too simple (just booking) or too complex and expensive (enterprise tools built for spas with 50 staff). I kept duct-taping together 4–5 different apps — and paying for all of them.

So I built Certxa.

The feature I'm most excited about is **Autumn**, our AI receptionist. She answers every call in under 2 seconds, around the clock. While your salon is open she sees your live board, so she can tell callers the real wait time. After hours she keeps booking without implying anyone is in the building. Salons that miss 30–40% of their calls get all of them back.

A few things I'd genuinely love your feedback on:
1. Is the pricing clear? (Free Solo / $29 Starter / $99 Professional / $179 Enterprise, Autumn calls included)
2. Does the Autumn credit model (pay-per-minute balance) make sense?
3. What feature would make you switch from your current salon software?

Happy to answer anything. This community has been invaluable for early-stage products and I'm grateful to be here. 🙏`;

const HUNTER_COMMENT_TEMPLATE = `Hi [Hunter's name],

I'm Thanh, founder of Certxa — all-in-one salon software with an AI receptionist called Autumn that answers every call 24/7.

I've been following your hunts and think Certxa would resonate with your audience. We're targeting a Product Hunt launch on [DATE] and would love your support as our hunter.

Happy to share early access, a demo, or a call — whatever works best for you.

Thanks,
Thanh
certxa.com`;

const UPVOTE_REQUEST = `Hey [Name]! 👋

Launching Certxa on Product Hunt today — it's the salon software I built after running my own nail salon and getting frustrated with everything else out there. The standout is Autumn, an AI receptionist that answers every call 24/7.

Would mean a lot if you could check it out and upvote if it looks useful: [PRODUCT HUNT LINK]

Takes 30 seconds and you'd be helping a small team a ton. Thanks! 🙏`;

interface ChecklistItem {
  id: string;
  task: string;
  detail: string;
  link?: string;
  linkLabel?: string;
  urgent?: boolean;
}

const makerProfileChecklist: ChecklistItem[] = [
  {
    id: 'ph-account',
    task: 'Create / verify your Product Hunt account',
    detail: 'Use your real name (Thanh Lam). Profile photo, bio, and Twitter/X link all increase credibility.',
    link: 'https://www.producthunt.com/settings',
    linkLabel: 'PH Settings',
  },
  {
    id: 'ph-activity',
    task: 'Build 7+ days of PH activity before launch',
    detail: 'Upvote 10–15 products per day for at least a week before your launch. New accounts with zero activity get flagged.',
    urgent: true,
  },
  {
    id: 'ph-maker',
    task: 'Claim maker status on your product listing',
    detail: 'When you submit the product, mark yourself as a maker. This lets you post the first comment and respond to reviews.',
  },
  {
    id: 'ph-twitter',
    task: 'Connect Twitter/X to your PH profile',
    detail: 'Increases trust score. Use the same @handle you\'ll use to promote the launch.',
    link: 'https://www.producthunt.com/settings',
    linkLabel: 'PH Settings',
  },
  {
    id: 'ph-hunter',
    task: 'Line up a hunter with 500+ followers',
    detail: 'A well-known hunter submitting your product gives it a visibility boost on launch day. Reach out 1–2 weeks in advance.',
    urgent: true,
  },
  {
    id: 'ph-notify',
    task: 'Enable "Notify me" on your own product draft',
    detail: 'So you get alerts the moment comments or upvotes come in on launch day.',
  },
];

const submissionChecklist: ChecklistItem[] = [
  {
    id: 'sub-name',
    task: 'Product name: Certxa',
    detail: 'Exact casing. No tagline in the name field.',
  },
  {
    id: 'sub-tagline',
    task: `Tagline: "${TAGLINE}"`,
    detail: 'Under 60 characters. Clear, specific, no buzzwords.',
  },
  {
    id: 'sub-description',
    task: 'Paste the full description (copy below)',
    detail: 'Markdown supported. Lead with the problem, then the solution, then Autumn.',
  },
  {
    id: 'sub-url',
    task: 'URL: https://certxa.com',
    detail: 'Use the homepage. Add UTM: ?utm_source=producthunt&utm_medium=launch',
  },
  {
    id: 'sub-logo',
    task: 'Upload logo (240×240px PNG, transparent background)',
    detail: 'Use the horizontal logo variant. Square crop with padding.',
  },
  {
    id: 'sub-gallery',
    task: 'Upload 3–5 gallery screenshots (1270×760px)',
    detail: 'See screenshot guide below. Order matters — hero shot first.',
  },
  {
    id: 'sub-video',
    task: 'Add a 60–90 second demo video (optional but strongly recommended)',
    detail: 'Loom or YouTube link. Show Autumn answering a call — that\'s your hook.',
  },
  {
    id: 'sub-topics',
    task: 'Select topics: SaaS, Productivity, Small Business, Artificial Intelligence',
    detail: 'Max 3 topics. SaaS + Small Business are the highest-traffic for your category.',
  },
  {
    id: 'sub-pricing',
    task: 'Set pricing: Freemium (Solo free; team plans from $29/mo with a 60-day free trial)',
    detail: 'Be accurate. "Free trial" is a separate checkbox — check it.',
  },
];

const screenshotGuide = [
  {
    slot: '1 — Hero shot',
    subject: 'Autumn answering a call',
    copy: 'Your receptionist, available 24/7',
    note: 'Use the new-screenshot or device-mockup. This is the thumbnail people see in the feed.',
  },
  {
    slot: '2 — Dashboard overview',
    subject: 'Full Certxa dashboard',
    copy: 'Everything your salon needs, in one place',
    note: 'Wide shot showing booking, POS, and waitlist panels together.',
  },
  {
    slot: '3 — Online booking',
    subject: 'Client-facing booking page',
    copy: 'Your own booking page — on Google, Instagram, everywhere',
    note: 'Show the client view, not the admin view.',
  },
  {
    slot: '4 — Self check-in kiosk',
    subject: 'Kiosk language selector',
    copy: 'Check in in English, Spanish, Vietnamese, Chinese, or Korean',
    note: 'The multilingual angle is a strong differentiator — show it.',
  },
  {
    slot: '5 — Pricing / CTA',
    subject: 'Pricing cards',
    copy: 'Solo free · Starter $29 · Professional $99 · Enterprise $179 · 60-day free trial on team plans',
    note: 'Ends the gallery with a clear next step.',
  },
];

const timingGuide = [
  {
    time: 'Today, Mon Oct 12 — right now',
    action: 'Final prep: confirm hunter, finalize assets, set your alarm',
    detail: 'Confirm your hunter knows to submit at exactly 12:01 AM PT Tuesday Oct 13. Complete your 5 screenshots (1270×760px). Schedule your LinkedIn and Twitter/X posts for 8 AM PT Tuesday. Pre-write your 7 community posts using the copy below. Set an alarm for 12:00 AM PT tonight — you need to post your first comment within 5 minutes of the listing going live.',
    critical: true,
  },
  {
    time: 'Mon Oct 12 — evening',
    action: 'Build your upvote request list and send personal messages',
    detail: 'Compile 30+ warm contacts (friends, family, past clients, fellow founders). Pre-write personal messages for each — not a mass blast. Have them ready to send the moment the listing goes live at 12:01 AM.',
    critical: true,
  },
  {
    time: 'Tue Oct 13 — 12:01 AM PT',
    action: 'Hunter submits — post your first comment immediately',
    detail: 'Product Hunt resets at midnight PT. Your hunter submits at 12:01 AM. You post the founder first comment within the first 5 minutes. Being first signals you\'re active and sets the tone for the whole day.',
    critical: true,
  },
  {
    time: 'Tue Oct 13 — 6:00–8:00 AM PT',
    action: 'Send upvote requests to all warm contacts',
    detail: 'Email, Slack, WhatsApp, iMessage — anyone who knows you personally. Keep each message personal, not a mass blast. 20–30 early upvotes in the first 2 hours are the single most important factor in the algorithm.',
    critical: true,
  },
  {
    time: 'Tue Oct 13 — 8:00–10:15 AM PT',
    action: 'Post in all 7 communities on the staggered schedule',
    detail: 'r/Entrepreneur at 8:00, r/smallbusiness at 8:15, Indie Hackers at 8:30, Show HN at 9:00, r/nail_art at 9:30, Facebook Nail Salon Owners at 10:00, Facebook Hair Salon Business at 10:15. Full post copy for each is in the community section below.',
    critical: true,
  },
  {
    time: 'Tue Oct 13 — all day',
    action: 'Respond to every comment within 30 minutes',
    detail: 'Comment velocity is a direct ranking signal. Thank every upvoter by name. Answer every question thoroughly. A product with 50 comments and 150 upvotes ranks above one with 200 upvotes and 5 comments.',
    critical: true,
  },
  {
    time: 'Tue Oct 13 — 12:00 PM PT',
    action: 'Check your rank — send a second wave if needed',
    detail: 'If you\'re outside the top 10, send a second round of personal messages to anyone you haven\'t reached yet. If you\'re in the top 5, post a "We\'re #X on Product Hunt today!" update on LinkedIn and Twitter/X.',
    critical: false,
  },
  {
    time: 'Tue Oct 13 — 6:00–8:00 PM PT',
    action: 'Evening push — update communities with your rank',
    detail: 'Evening PT is peak US East Coast + Europe overlap. Post a brief update in the same communities: "We\'re #X on Product Hunt today — thank you!" Late European votes can move you up 2–3 positions.',
    critical: false,
  },
  {
    time: 'Wed Oct 14 — morning',
    action: 'Post-launch: badge, reviews, warm leads',
    detail: 'Reply to all remaining PH comments. Download your PH badge and add it to the certxa.com homepage. Screenshot your final rank. DM anyone who left a thoughtful comment — they\'re warm leads. Begin Week 2 trade pub outreach.',
    critical: false,
  },
];

interface Community {
  name: string;
  url: string;
  time: string;
  angle: string;
  note: string;
  postCopy: string;
}

const communities: Community[] = [
  {
    name: 'r/Entrepreneur',
    url: 'https://reddit.com/r/entrepreneur',
    time: '8:00 AM PT — Tue Oct 13',
    angle: 'I built salon software after running my own nail salon — launching on PH today',
    note: 'Flair as "Milestone / Success." Link to your PH listing, not certxa.com. Respond to every comment.',
    postCopy: `Title: I built salon software after running my own nail salon — launching on Product Hunt today

I ran a nail salon for years and spent way too much time duct-taping together 4–5 different apps: one for booking, one for payments, one for payroll, a loyalty platform, and a voicemail box that filled up every night.

So I built Certxa — all-in-one salon management software that replaces all of them. Online booking, POS, self check-in kiosk, waitlist and turn rotation, loyalty programs, staff payroll, and review automation.

The feature I'm most proud of is Autumn, our AI receptionist. She answers every call in under 2 seconds, 24/7. Most salons miss 30–40% of their calls — Autumn fixes that.

We're live on Product Hunt today: [YOUR PH LINK]

Would love any feedback from other founders, especially on pricing clarity (free Solo plan, $29 Starter, $99 Professional, $179 Enterprise, Autumn included).`,
  },
  {
    name: 'r/smallbusiness',
    url: 'https://reddit.com/r/smallbusiness',
    time: '8:15 AM PT — Tue Oct 13',
    angle: 'How I stopped missing 40% of my salon\'s calls (and what I built to fix it)',
    note: 'Problem-first framing works well here. Keep it practical and solution-focused.',
    postCopy: `Title: How I stopped missing 40% of my salon's calls — and what I built to fix it

When I ran my nail salon, I'd come in every morning to a voicemail full of missed calls. Clients who couldn't get through just booked somewhere else.

I tried hiring a part-time receptionist. Too expensive. I tried forwarding to my cell. Unsustainable.

So I built Autumn — an AI receptionist that answers every call in under 2 seconds, 24/7. She books appointments, handles rescheduling, answers questions about services and pricing, and checks the live wait board so callers always get accurate information.

It's part of Certxa, the salon management software I built after getting frustrated with everything else out there. We launched on Product Hunt today: [YOUR PH LINK]

If you run a service business and deal with missed calls, I'd love to hear how you handle it.`,
  },
  {
    name: 'Indie Hackers',
    url: 'https://www.indiehackers.com',
    time: '8:30 AM PT — Tue Oct 13',
    angle: 'Launched Certxa on PH today — built it after running a nail salon, would love IH feedback',
    note: 'IH loves founder stories and traction numbers. Share MRR or trial signups if you have them.',
    postCopy: `Title: Launched Certxa on Product Hunt today — built it after running my own nail salon

Hey IH,

Certxa is live on Product Hunt today: [YOUR PH LINK]

The quick story: I ran a nail salon and couldn't find software that actually fit how a salon works. Everything was either too basic or too expensive. I kept paying for 4–5 separate tools that didn't talk to each other.

So I built Certxa — all-in-one salon management software with online booking, POS, self check-in kiosk, waitlist management, loyalty programs, payroll, and Autumn, an AI receptionist that answers every call 24/7.

A few things I learned building in this space:
- Salon owners are extremely price-sensitive but will pay for things that save them time
- The "missed call" problem is massive and almost nobody is solving it well
- Multilingual support (we do 5 languages on the kiosk) is a huge differentiator in urban markets

Would love any feedback on the product, the positioning, or the pricing. Happy to return the favor on your projects.`,
  },
  {
    name: 'Hacker News (Show HN)',
    url: 'https://news.ycombinator.com/submit',
    time: '9:00 AM PT — Tue Oct 13',
    angle: 'Show HN: Certxa – Salon software with an AI receptionist that answers every call',
    note: 'Title must start with "Show HN:". Link to certxa.com, NOT your PH listing. Keep it factual — no marketing language.',
    postCopy: `Title: Show HN: Certxa – Salon software with an AI receptionist that answers every call

Body:
Certxa is salon management software for nail salons, hair salons, barbershops, spas, and massage studios.

The core product: online booking, a Stripe-powered POS, self check-in kiosk (5 languages: EN/ES/VI/ZH/KO), waitlist and turn rotation, loyalty programs, staff payroll, and review automation.

The differentiating feature is Autumn, an AI receptionist that answers every inbound call in under 2 seconds, 24/7. She books appointments, handles rescheduling and cancellations, answers questions about services and pricing, and checks the live wait board so callers get accurate wait times. Most salons miss 30–40% of their calls — Autumn routes all of them.

Autumn is included on the paid plans (20 calls a month on Starter, 50 on Professional, 100 on Enterprise), then $0.50 per call. We chose per-call pricing over a flat fee because call volume varies enormously between a 2-chair nail salon and a 12-chair hair salon.

Built with React, Express, and a custom telephony layer. Happy to answer technical questions.

https://certxa.com`,
  },
  {
    name: 'r/nail_art',
    url: 'https://reddit.com/r/nail_art',
    time: '9:30 AM PT — Tue Oct 13',
    angle: 'Soft mention — "tools I use to run my nail salon" framing, not a direct promo',
    note: 'Check subreddit rules before posting. If self-promotion is banned, skip this one entirely.',
    postCopy: `Title: For nail salon owners — the software tools I use to run my business

I've been running a nail salon for a few years and wanted to share the tools that have made the biggest difference operationally (not a sponsored post, just what actually works for me):

**Booking:** I switched to Certxa (certxa.com) about [X months] ago. It handles online booking, POS, the waitlist, and payroll all in one place. The self check-in kiosk has been a game changer — clients check themselves in on a tablet and it supports Vietnamese, Spanish, and Korean which matters a lot for my clientele.

**The thing I'm most excited about:** Autumn, their AI receptionist. She answers every call 24/7. I used to miss 30–40% of my calls. Now I get all of them.

We actually just launched on Product Hunt today if anyone wants to check it out: [YOUR PH LINK]

Happy to answer questions from other salon owners about what's worked for us.`,
  },
  {
    name: 'Facebook: Nail Salon Owners',
    url: 'https://facebook.com',
    time: '10:00 AM PT — Tue Oct 13',
    angle: 'We just launched on Product Hunt — would love feedback from real salon owners',
    note: 'Personal tone. End with a question to drive comments. Tag 2–3 salon owner friends if appropriate.',
    postCopy: `Hey everyone 👋

Big day for us — Certxa just launched on Product Hunt today!

For those who don't know me: I'm Thanh, and I built Certxa after running my own nail salon and getting frustrated with every piece of software out there. Too many tools, too many logins, too many monthly fees.

Certxa is all-in-one: online booking, POS, self check-in kiosk, waitlist management, loyalty programs, payroll, and Autumn — an AI receptionist that answers every call 24/7 so you never miss a client again.

If you have 30 seconds, an upvote on Product Hunt would mean the world to a small team: [YOUR PH LINK]

And I'd genuinely love to hear from you: what's the #1 thing your current salon software is missing? I read every reply.`,
  },
  {
    name: 'Facebook: Hair Salon Business',
    url: 'https://facebook.com',
    time: '10:15 AM PT — Tue Oct 13',
    angle: 'Same personal story angle — customize opening line for hair salons',
    note: 'Change "nail salon" references to "hair salon" in the opening. Same structure as the nail salon post.',
    postCopy: `Hey hair salon owners 👋

We just launched Certxa on Product Hunt today — and I wanted to share it here first.

I built Certxa after years of running a salon and dealing with the same problems you probably deal with: missed calls, no-shows, juggling 4 different apps, and payroll that takes half a Sunday.

Certxa replaces all of it: online booking, POS, self check-in kiosk (supports 5 languages), waitlist and turn rotation, loyalty programs, payroll, and Autumn — an AI receptionist that answers every call in under 2 seconds, 24/7.

If you've ever come in on a Monday morning to a voicemail full of missed calls, Autumn is for you.

Would love your support on Product Hunt today: [YOUR PH LINK]

And genuinely curious — what's the biggest operational headache in your salon right now?`,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyBlock({ label, text, copyKey, copiedKey, onCopy }: {
  label: string;
  text: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <div className="rounded-xl border border-border bg-muted overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <button
          onClick={() => onCopy(text, copyKey)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed overflow-x-auto">
        {text}
      </pre>
    </div>
  );
}

function ChecklistSection({ title, icon: Icon, items }: {
  title: string;
  icon: React.ElementType;
  items: ChecklistItem[];
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon size={16} className="text-primary" />
          </div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h3>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          {done}/{items.length} done
        </span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="px-6 py-4">
            <div className="flex items-start gap-4">
              <button
                onClick={() => toggle(item.id)}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  checked[item.id]
                    ? 'bg-primary border-primary'
                    : 'border-border hover:border-primary/50'
                }`}
                aria-label={`Mark "${item.task}" as ${checked[item.id] ? 'incomplete' : 'complete'}`}
              >
                {checked[item.id] && <Check size={11} className="text-primary-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${checked[item.id] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.task}
                  </p>
                  {item.urgent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <AlertCircle size={9} />
                      Do first
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
                  >
                    {item.linkLabel ?? item.link}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpandableSection({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon size={16} className="text-primary" />
          </div>
          <span className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

function CommunityCard({ community: c, index: i, copiedKey, onCopy }: {
  community: Community;
  index: number;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-start gap-4 px-6 py-4">
        <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0 mt-0.5">
          {i + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              {c.name}
              <ExternalLink size={11} />
            </a>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              <Clock size={9} />
              {c.time}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 italic">"{c.angle}"</p>
          <p className="text-xs text-primary mt-1">{c.note}</p>
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors mt-2"
          >
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? 'Hide post copy' : 'Show post copy'}
          </button>
        </div>
      </div>
      {open && (
        <div className="px-6 pb-5">
          <CopyBlock
            label={`${c.name} — post copy`}
            text={c.postCopy}
            copyKey={`community-${i}`}
            copiedKey={copiedKey}
            onCopy={onCopy}
          />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductHuntLaunchPage() {
  const { copiedKey, copy } = useCopy();

  return (
    <>
      <Helmet>
        <title>Product Hunt Launch — Certxa Internal</title>
        <meta name="description" content="Internal Product Hunt launch playbook for Certxa." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="pt-16 pb-24">
        <div className="max-w-4xl mx-auto px-6 md:px-10">

          {/* Header */}
          <div className="py-12 border-b border-border mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Rocket size={20} className="text-orange-600" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Internal · Not indexed</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
              Product Hunt Launch Playbook
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
              Everything you need to execute a top-10 Product Hunt launch for Certxa. Work through the checklists in order, copy the prepared assets, and follow the timing guide on launch day.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <a
                href="https://www.producthunt.com/posts/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-colors"
              >
                Submit on Product Hunt
                <ExternalLink size={13} />
              </a>
              <a
                href="https://www.producthunt.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
              >
                Browse PH to build activity
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* ── SECTION 1: Timing ── */}
          <section className="mb-10" aria-label="Launch timing">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Launch timing
              </h2>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 mb-5 flex gap-3">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Launch date: Tuesday, October 13 — 12:01 AM PT (tomorrow)</p>
                <p className="text-sm text-amber-700 mt-0.5">Today is Monday Oct 12. Confirm your hunter, finalize screenshots, and set your midnight alarm. Your upvote request messages should be ready to send the moment the listing goes live.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {timingGuide.map((step, i) => (
                  <div key={i} className="flex gap-4 px-6 py-4">
                    <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        step.critical ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {i + 1}
                      </div>
                      {i < timingGuide.length - 1 && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          <Clock size={10} />
                          {step.time}
                        </span>
                        {step.critical && (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Critical</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{step.action}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── SECTION 2: Maker profile checklist ── */}
          <section className="mb-10" aria-label="Maker profile setup">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <User size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Maker profile setup
              </h2>
            </div>
            <ChecklistSection title="Before you submit" icon={User} items={makerProfileChecklist} />
          </section>

          {/* ── SECTION 3: Submission checklist ── */}
          <section className="mb-10" aria-label="Submission checklist">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Rocket size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Submission checklist
              </h2>
            </div>
            <ChecklistSection title="Product listing fields" icon={Rocket} items={submissionChecklist} />
          </section>

          {/* ── SECTION 4: Copy assets ── */}
          <section className="mb-10" aria-label="Copy assets">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Copy assets — ready to paste
              </h2>
            </div>

            <div className="flex flex-col gap-5">
              <CopyBlock
                label="Tagline (60 chars)"
                text={TAGLINE}
                copyKey="tagline"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Product description (paste into PH description field)"
                text={DESCRIPTION}
                copyKey="description"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Founder first comment (post immediately at 12:01 AM PT)"
                text={FIRST_COMMENT}
                copyKey="first-comment"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Hunter outreach DM (send 1–2 weeks before launch)"
                text={HUNTER_COMMENT_TEMPLATE}
                copyKey="hunter-dm"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Upvote request (personal message to warm contacts on launch day)"
                text={UPVOTE_REQUEST}
                copyKey="upvote-request"
                copiedKey={copiedKey}
                onCopy={copy}
              />
            </div>
          </section>

          {/* ── SECTION 5: Screenshot guide ── */}
          <section className="mb-10" aria-label="Screenshot guide">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Image size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Screenshot guide
              </h2>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-border bg-muted/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Spec: 1270 × 760px · PNG or JPG · Max 5 images</p>
              </div>
              <div className="divide-y divide-border">
                {screenshotGuide.map((s, i) => (
                  <div key={i} className="px-6 py-4 grid grid-cols-[auto_1fr] gap-4 items-start">
                    <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.slot}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Subject: {s.subject}</p>
                      <p className="text-xs text-muted-foreground">Overlay copy: <span className="font-medium text-foreground">"{s.copy}"</span></p>
                      <p className="text-xs text-primary mt-1">{s.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 px-5 py-4">
              <p className="text-xs font-semibold text-foreground mb-2">Recommended screenshot tools</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Screely</strong> (screely.com) — adds a browser frame, great for dashboard shots</li>
                <li>• <strong>Shots.so</strong> — device mockup frames, good for mobile views</li>
                <li>• <strong>Figma</strong> — if you want to add overlay text/copy to each screenshot</li>
                <li>• <strong>CleanShot X</strong> (Mac) — best for annotated screenshots</li>
              </ul>
            </div>
          </section>

          {/* ── SECTION 6: Communities ── */}
          <section className="mb-10" aria-label="Communities to post in">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Communities to post in on launch day
              </h2>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {communities.map((c, i) => (
                  <CommunityCard key={i} community={c} index={i} copiedKey={copiedKey} onCopy={copy} />
                ))}
              </div>
            </div>
          </section>

          {/* ── SECTION 7: Hunter outreach (expandable) ── */}
          <section className="mb-10" aria-label="Hunter outreach">
            <ExpandableSection title="Finding and approaching a hunter" icon={Trophy}>
              <div className="px-6 py-5 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A hunter with 500+ followers submitting your product gives it a visibility boost in the "Featured" section. Here's how to find one:
                </p>
                <ol className="text-sm text-foreground space-y-3 list-decimal list-inside">
                  <li>
                    <span className="font-medium">Search PH for similar products</span>
                    <span className="text-muted-foreground"> — look at who hunted top SaaS / small business tools in the last 6 months.</span>
                  </li>
                  <li>
                    <span className="font-medium">Check their follower count</span>
                    <span className="text-muted-foreground"> — 500+ is the threshold where the boost is meaningful. 2,000+ is ideal.</span>
                  </li>
                  <li>
                    <span className="font-medium">DM them on Twitter/X or LinkedIn</span>
                    <span className="text-muted-foreground"> — use the hunter outreach template above. Keep it short and personal.</span>
                  </li>
                  <li>
                    <span className="font-medium">Offer early access or a demo</span>
                    <span className="text-muted-foreground"> — hunters want to genuinely vouch for products they submit.</span>
                  </li>
                </ol>
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold text-foreground mb-1">Good hunter profiles to look at</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Search "hunted by" + "SaaS" or "small business" on Product Hunt</li>
                    <li>• <a href="https://www.producthunt.com/leaderboard/hunters" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PH Hunter Leaderboard</a> — sort by "All time" and filter by category</li>
                    <li>• Indie Hackers community — many active PH hunters post there</li>
                  </ul>
                </div>
              </div>
            </ExpandableSection>
          </section>

          {/* ── SECTION 8: After launch ── */}
          <section aria-label="After launch">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Trophy size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                After the launch
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Claim your badge',
                  body: 'Product Hunt provides "Featured on Product Hunt" badges. Add it to your homepage and email signature — it\'s a trust signal for salon owners who don\'t know you yet.',
                },
                {
                  title: 'Reply to every review',
                  body: 'Reviews left after launch day still drive traffic for weeks. Reply to each one — it shows you\'re active and builds credibility with future visitors.',
                },
                {
                  title: 'Add PH to your backlink list',
                  body: 'Your PH listing page (producthunt.com/posts/certxa) is a DA 90+ backlink. Make sure your website URL is correct in the listing.',
                },
                {
                  title: 'Screenshot your rank',
                  body: 'If you hit top 5 or #1 Product of the Day, screenshot it. Use it in future marketing: "As seen on Product Hunt — #1 Product of the Day".',
                },
                {
                  title: 'Follow up with commenters',
                  body: 'Anyone who left a thoughtful comment is a warm lead. DM them with a free trial offer or a personal onboarding call.',
                },
                {
                  title: 'Submit to PH collections',
                  body: 'After launch, submit Certxa to relevant PH collections: "Best tools for small businesses", "AI tools", "SaaS for service businesses".',
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border border-border bg-card p-5">
                  <p className="text-sm font-semibold text-foreground mb-1.5">{card.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </>
  );
}
