import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Check,
  Copy,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Rocket,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';

// ─── Copy hook ────────────────────────────────────────────────────────────────
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

// ─── Shared copy ──────────────────────────────────────────────────────────────

const SHORT_DESCRIPTION = `Certxa is all-in-one salon management software built for nail salons, hair salons, barbershops, spas, and massage studios. Online booking, salon POS, self check-in kiosk, waitlist and turn rotation, loyalty programs, staff payroll, and Autumn — an AI receptionist that answers every call 24/7 in under 2 seconds.`;

const LONG_DESCRIPTION = `Certxa is all-in-one salon management software built for nail salons, hair salons, barbershops, spas, massage studios, hair removal studios, and braid and weave salons.

Most salon owners juggle 4–5 separate tools — a booking app, a POS, a payroll tool, a loyalty platform, and a voicemail box that fills up every night. Certxa replaces all of them.

Core features:
• Online booking — your own booking page, bookable from Google, Instagram, or a direct link. Automated reminders cut no-shows.
• Salon POS — Stripe-powered payments, service and retail sales, tip management, and end-of-day reports.
• Self check-in kiosk — clients check themselves in on a tablet in English, Spanish, Vietnamese, Chinese, or Korean.
• Waitlist and turn rotation — walk-in queue management that keeps staff assignments fair automatically.
• Loyalty programs — points, rewards, and redemption built in, no third-party app needed.
• Staff scheduling and payroll — shifts, commissions, and payout reports in one place.
• Review automation — post-visit review requests sent automatically to grow your Google rating.
• Autumn AI receptionist — answers every call in under 2 seconds, 24/7. Books appointments, handles rescheduling and cancellations, answers questions about services and pricing, checks the live wait board, and upsells add-ons. Salons that miss 30–40% of their calls get all of them back.

Pricing starts at $29/month (Starter) and $79/month (Pro, includes Autumn). 60-day free trial.`;

const TAGLINE = 'All-in-one salon software with a 24/7 AI receptionist';

const KEY_FEATURES = [
  'Online booking (Google, Instagram, direct link)',
  'Salon POS with Stripe payments',
  'Self check-in kiosk (5 languages)',
  'Waitlist and turn rotation',
  'Loyalty programs',
  'Staff scheduling and payroll',
  'Review automation',
  'Autumn AI receptionist (24/7 call answering)',
];

const CATEGORIES = {
  primary: 'Salon Software / Beauty Salon Software',
  secondary: ['Appointment Scheduling', 'POS Software', 'Small Business Software'],
};

// ─── Platform data ────────────────────────────────────────────────────────────

interface Step {
  action: string;
  detail: string;
  link?: string;
  linkLabel?: string;
  warning?: string;
}

interface Platform {
  id: string;
  name: string;
  da: number;
  submissionUrl: string;
  reviewUrl?: string;
  timeToLive: string;
  effort: 'Low' | 'Medium' | 'High';
  backlink: 'Dofollow' | 'Nofollow' | 'Mixed';
  priority: 1 | 2 | 3;
  why: string;
  steps: Step[];
  tips: string[];
  reviewAsk: string;
}

const platforms: Platform[] = [
  {
    id: 'capterra',
    name: 'Capterra',
    da: 91,
    submissionUrl: 'https://www.capterra.com/vendors/sign-up',
    reviewUrl: 'https://www.capterra.com',
    timeToLive: '3–7 business days',
    effort: 'Medium',
    backlink: 'Nofollow',
    priority: 1,
    why: 'Highest traffic of the four. DA 91. Salon owners actively search here when evaluating software. A strong profile with 5+ reviews ranks in Google for "salon software" comparison queries.',
    steps: [
      {
        action: 'Go to the vendor sign-up page',
        detail: 'Click "List your product for free." You\'ll need a business email — use thanh@certxa.com or a team address.',
        link: 'https://www.capterra.com/vendors/sign-up',
        linkLabel: 'Capterra vendor sign-up',
      },
      {
        action: 'Select your primary category',
        detail: 'Search for "Salon Software" — it\'s a recognized Capterra category. Also add "Appointment Scheduling Software" as a secondary category.',
      },
      {
        action: 'Fill in the product profile',
        detail: 'Product name: Certxa. Tagline: use the short tagline below. Description: paste the long description. Website: https://certxa.com. Pricing: starts at $29/mo, free trial available.',
        warning: 'Capterra limits descriptions to ~750 words. Trim the long description if needed — keep Autumn and the kiosk, they\'re differentiators.',
      },
      {
        action: 'Upload logo and screenshots',
        detail: 'Logo: square PNG, min 300×300px. Screenshots: min 3, max 8. Use the same 5 screenshots from the Product Hunt guide (1270×760px). Lead with the Autumn screenshot.',
      },
      {
        action: 'Add all feature tags',
        detail: 'Check every applicable feature tag: Online Booking, POS, Loyalty Program, Staff Management, Payroll, Automated Reminders, Multi-language, API. More tags = more category appearances.',
      },
      {
        action: 'Set pricing tiers',
        detail: 'Add both plans: Starter ($29/mo) and Pro ($79/mo). Mark "Free Trial" as available. Do NOT mark "Free Plan" — Certxa doesn\'t have one.',
      },
      {
        action: 'Submit and wait for review',
        detail: 'Capterra manually reviews new listings. Expect 3–7 business days. You\'ll get an email when it\'s live.',
      },
      {
        action: 'Request your first 5 reviews immediately after going live',
        detail: 'Capterra ranks profiles heavily by review count. Email 5 early users or beta testers the day your listing goes live. Use the review ask template below.',
        warning: 'Capterra prohibits incentivized reviews. Ask genuinely — don\'t offer discounts in exchange.',
      },
    ],
    tips: [
      'Profiles with 10+ reviews appear in Capterra\'s "Top Performers" shortlists — a second backlink from a high-DA page.',
      'Respond to every review publicly. It shows you\'re active and improves your ranking.',
      'Add a Capterra "Reviews" badge to your homepage once you have 5+ reviews.',
      'Capterra syncs with GetApp and Software Advice (same parent company, Gartner Digital Markets) — one submission populates all three, but you\'ll need to claim each profile separately.',
    ],
    reviewAsk: `Hi [Name],

I wanted to reach out personally — you've been using Certxa and your feedback has meant a lot to us.

We just listed Certxa on Capterra and reviews from real users make a huge difference for small teams like ours. Would you be willing to leave an honest review? It takes about 3 minutes.

[CAPTERRA REVIEW LINK]

No pressure at all — and thank you for being an early supporter.

Thanh
Founder, Certxa`,
  },
  {
    id: 'g2',
    name: 'G2',
    da: 91,
    submissionUrl: 'https://sell.g2.com/free-listing',
    reviewUrl: 'https://www.g2.com',
    timeToLive: '5–10 business days',
    effort: 'Medium',
    backlink: 'Nofollow',
    priority: 1,
    why: 'G2 profiles rank on page 1 for "[software] reviews" queries. DA 91. G2\'s "Grid" reports (Leader, High Performer, Momentum Leader) are earned with reviews and become powerful trust signals and additional backlinks.',
    steps: [
      {
        action: 'Claim your free listing',
        detail: 'Go to sell.g2.com/free-listing. Use your business email. G2 may already have a stub profile for Certxa — search first and claim it rather than creating a duplicate.',
        link: 'https://sell.g2.com/free-listing',
        linkLabel: 'G2 free listing',
      },
      {
        action: 'Complete your vendor profile',
        detail: 'Company name: Certxa. Founded: [your year]. HQ: [your city]. Employee count: honest number. Website: https://certxa.com.',
      },
      {
        action: 'Fill in the product profile',
        detail: 'Product name: Certxa. Description: paste the long description. Categories: "Salon & Spa Management" + "Appointment Scheduling." Pricing: $29/mo starting price, free trial.',
      },
      {
        action: 'Add feature checklist',
        detail: 'G2 has a detailed feature checklist for each category. Check every feature Certxa supports. This powers the "Feature Comparison" tab that buyers use heavily.',
      },
      {
        action: 'Upload media',
        detail: 'Logo (square, min 200×200px) + at least 3 screenshots. G2 also supports a product video — add your Loom demo if you have one.',
      },
      {
        action: 'Submit for review',
        detail: 'G2 takes 5–10 business days. They\'ll email you when the profile is live.',
      },
      {
        action: 'Collect 5 reviews in the first 2 weeks',
        detail: 'G2\'s algorithm requires a minimum of 5 reviews before a product appears in category grids. This is the single most important action after going live.',
        warning: 'G2 verifies reviewers via LinkedIn. Ask users who have a LinkedIn profile and can confirm they use Certxa.',
      },
    ],
    tips: [
      'G2 Grid reports (Leader, High Performer) require 10+ reviews and a satisfaction score above the category average. Target 10 reviews in month 1.',
      'G2 Badges ("High Performer — Spring 2027") are free to download and use in marketing once earned.',
      'G2 has a "Reference Program" — once you have reviews, G2 can connect you with buyers who want to speak to a reference customer.',
      'G2 reviews appear in Google rich snippets for "[product] reviews" searches — high-intent traffic.',
    ],
    reviewAsk: `Hi [Name],

Quick ask — we just launched Certxa on G2 and reviews from verified users are what get us into their category rankings.

Would you be willing to leave a review? G2 verifies via LinkedIn (takes about 5 minutes total):

[G2 REVIEW LINK]

Your honest feedback helps other salon owners find software that actually works for them. Thank you!

Thanh
Founder, Certxa`,
  },
  {
    id: 'getapp',
    name: 'GetApp',
    da: 88,
    submissionUrl: 'https://www.getapp.com/list-your-software',
    timeToLive: '3–5 business days',
    effort: 'Low',
    backlink: 'Nofollow',
    priority: 2,
    why: 'Owned by Gartner Digital Markets (same parent as Capterra). If your Capterra profile is live, GetApp pulls the same data — but you still need to claim the profile to control the listing and get the backlink credit.',
    steps: [
      {
        action: 'Check if a profile already exists',
        detail: 'Search "Certxa" on GetApp. If a stub exists, click "Is this your product?" to claim it. If not, use the list-your-software link.',
        link: 'https://www.getapp.com/list-your-software',
        linkLabel: 'GetApp listing page',
      },
      {
        action: 'Log in with your Capterra vendor account',
        detail: 'Gartner Digital Markets uses a shared vendor portal. If you\'ve already submitted to Capterra, your login works here too — and your profile data may already be pre-populated.',
      },
      {
        action: 'Verify and complete the profile',
        detail: 'Confirm all fields are accurate. GetApp sometimes pulls slightly different category mappings than Capterra — double-check "Salon Software" is selected.',
      },
      {
        action: 'Add GetApp-specific content',
        detail: 'GetApp has a "Pros and Cons" section that Capterra doesn\'t. Pre-populate it: Pros — "All-in-one platform, no integrations needed; Autumn AI handles after-hours calls; multilingual kiosk." Cons — "No free plan; Autumn requires a credit balance."',
      },
      {
        action: 'Submit and confirm',
        detail: 'GetApp reviews are faster than Capterra — typically 3–5 business days.',
      },
    ],
    tips: [
      'GetApp\'s "Category Leaders" report is separate from Capterra\'s — you can earn both badges.',
      'GetApp has a stronger European audience than Capterra. If you plan to expand internationally, this listing matters more over time.',
      'Reviews on Capterra automatically appear on GetApp (same platform) — you don\'t need to ask for separate reviews.',
    ],
    reviewAsk: `Hi [Name],

We just claimed our GetApp profile and would love your help building our presence there.

If you have 3 minutes, an honest review would mean a lot:

[GETAPP REVIEW LINK]

Thank you for supporting Certxa!

Thanh`,
  },
  {
    id: 'software-advice',
    name: 'Software Advice',
    da: 87,
    submissionUrl: 'https://www.softwareadvice.com/vendor',
    timeToLive: '3–5 business days',
    effort: 'Low',
    backlink: 'Nofollow',
    priority: 2,
    why: 'Third Gartner Digital Markets property. Same shared vendor portal as Capterra and GetApp. Software Advice ranks well for "best salon software" buyer-intent queries and drives warm leads — their model is connecting buyers with vendors.',
    steps: [
      {
        action: 'Access via the shared Gartner vendor portal',
        detail: 'Software Advice uses the same login as Capterra and GetApp. Go to the vendor page and sign in with your existing credentials.',
        link: 'https://www.softwareadvice.com/vendor',
        linkLabel: 'Software Advice vendor portal',
      },
      {
        action: 'Claim or create your Software Advice profile',
        detail: 'Same process as GetApp — search for Certxa first, claim if a stub exists, otherwise create new.',
      },
      {
        action: 'Complete the profile',
        detail: 'Software Advice has a "Buyer\'s Guide" section for each category. Your profile description should answer: Who is this for? What problem does it solve? What makes it different from competitors?',
      },
      {
        action: 'Enable the "FrontRunners" program',
        detail: 'Software Advice\'s FrontRunners report is their equivalent of Capterra\'s Shortlist. It requires 20+ reviews. Opt in now so you\'re tracked from day one.',
        warning: 'FrontRunners is based on user reviews, not paid placement. You can\'t buy your way in.',
      },
      {
        action: 'Set up lead notifications',
        detail: 'Software Advice sends "buyer match" leads when someone fills out their advisor form and matches your profile. Make sure your notification email is set to thanh@certxa.com.',
      },
    ],
    tips: [
      'Software Advice advisors sometimes call vendors to verify listings — pick up if you see a call from a Scottsdale, AZ number.',
      'The "FrontRunners" badge is one of the most recognized trust signals in B2B SaaS — worth the effort to earn it.',
      'Software Advice buyer leads are warm — they\'ve already described their needs to an advisor. Respond within 1 hour.',
    ],
    reviewAsk: `Hi [Name],

We're building our presence on Software Advice and your review would help other salon owners find Certxa.

Takes about 3 minutes:

[SOFTWARE ADVICE REVIEW LINK]

Really appreciate your support.

Thanh`,
  },
];

// ─── Week 1 timeline ──────────────────────────────────────────────────────────

const timeline = [
  {
    day: 'Today — Sat Oct 11',
    label: 'Submit Capterra + G2 + start PH activity',
    tasks: [
      'Submit Capterra listing (~45 min — do this first, it pre-populates GetApp/Software Advice)',
      'Submit G2 listing (~45 min — separate portal, LinkedIn-verified reviews)',
      'Start PH account activity today — upvote 10–15 products (you need 7 days before Oct 17 launch)',
      'Identify 5 early users to ask for reviews once listings go live',
    ],
    critical: true,
  },
  {
    day: 'Sun Oct 12',
    label: 'Submit GetApp + Software Advice',
    tasks: [
      'Log into Gartner vendor portal — claim/create GetApp profile (same login as Capterra)',
      'Claim/create Software Advice profile in the same session',
      'Continue PH activity — upvote 10–15 more products',
      'Draft your review ask emails using the templates below',
    ],
    critical: true,
  },
  {
    day: 'Mon Oct 13 – Wed Oct 15',
    label: 'PH prep + hunter confirmation',
    tasks: [
      'Continue PH activity daily — upvote 10–15 products each day',
      'Confirm your hunter has agreed and knows: submit at 12:01 AM PT on Thursday Oct 17',
      'Finalize 5 PH screenshots (1270×760px) — see /backlinks/product-hunt for the shot list',
      'Build your upvote request list — aim for 30+ warm contacts (past users, friends, colleagues)',
      'Check email for Capterra/G2 approval confirmations — listings typically go live within 3–7 days',
    ],
    critical: false,
  },
  {
    day: 'Thu Oct 16 (day before)',
    label: 'Final prep day',
    tasks: [
      'Send review ask emails to 5 early users for any listings already live',
      'Copy and finalize your PH first comment (template at /backlinks/product-hunt)',
      'Schedule your LinkedIn and Twitter/X posts for 8 AM PT Thursday',
      'Prep your community posts for r/Entrepreneur, Indie Hackers, Show HN, and the 4 others',
      'Set an alarm for 12:01 AM PT Thursday — you need to post the first comment immediately',
    ],
    critical: true,
  },
  {
    day: 'Thu Oct 17 — 12:01 AM PT',
    label: 'Product Hunt launch day',
    tasks: [
      '12:01 AM PT — hunter submits; you post your founder first comment immediately',
      '6–8 AM PT — send personal upvote requests to your 30+ warm contacts',
      '8–10 AM PT — post in all 7 communities (see community schedule below)',
      'All day — respond to every PH comment within 30 minutes',
      '12 PM PT — check your rank; if outside top 10, send a second wave of personal messages',
      '6–8 PM PT — post a launch update in communities ("We\'re #X on PH today!")',
    ],
    critical: true,
  },
  {
    day: 'Fri Oct 18 onwards',
    label: 'Post-launch + directory reviews',
    tasks: [
      'Reply to all remaining PH comments and reviews',
      'Download your PH badge and add it to the certxa.com homepage',
      'Send review ask emails to any remaining early users for live directory listings',
      'Begin Week 2 — trade publication outreach (/backlinks/trade-publications)',
    ],
    critical: false,
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
      <pre className="p-4 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed overflow-x-auto max-h-64">
        {text}
      </pre>
    </div>
  );
}

function StatusBadge({ status }: { status: 'not-started' | 'in-progress' | 'submitted' | 'live' }) {
  const map = {
    'not-started': { label: 'Not started', cls: 'bg-muted text-muted-foreground' },
    'in-progress': { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
    'submitted': { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
    'live': { label: 'Live ✓', cls: 'bg-green-100 text-green-700' },
  };
  const { label, cls } = map[status];
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
}

function PlatformCard({ platform, copiedKey, onCopy }: {
  platform: Platform;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'not-started' | 'in-progress' | 'submitted' | 'live'>('not-started');
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const toggleStep = (i: number) => setCheckedSteps(prev => ({ ...prev, [i]: !prev[i] }));
  const doneSteps = Object.values(checkedSteps).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-primary-foreground ${
              platform.priority === 1 ? 'bg-primary' : 'bg-primary/60'
            }`}>
              {platform.priority === 1 ? <Star size={16} /> : <Zap size={16} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                  {platform.name}
                </h3>
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">DA {platform.da}</span>
                {platform.priority === 1 && (
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Submit first</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{platform.timeToLive} to go live · {platform.effort} effort · {platform.backlink} link</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={e => setStatus(e.target.value as typeof status)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
              aria-label={`Status for ${platform.name}`}
            >
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
              <option value="submitted">Submitted</option>
              <option value="live">Live</option>
            </select>
            <StatusBadge status={status} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{platform.why}</p>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <a
            href={platform.submissionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Submit listing
            <ExternalLink size={11} />
          </a>
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-foreground text-xs font-semibold hover:bg-muted transition-colors"
          >
            {open ? 'Hide steps' : `Show ${platform.steps.length} steps`}
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expandable steps */}
      {open && (
        <div className="border-b border-border">
          <div className="px-6 py-3 bg-muted/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submission steps</span>
            <span className="text-xs text-muted-foreground">{doneSteps}/{platform.steps.length} done</span>
          </div>
          <ul className="divide-y divide-border">
            {platform.steps.map((step, i) => (
              <li key={i} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => toggleStep(i)}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      checkedSteps[i] ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'
                    }`}
                    aria-label={`Mark step ${i + 1} as ${checkedSteps[i] ? 'incomplete' : 'complete'}`}
                  >
                    {checkedSteps[i] && <Check size={11} className="text-primary-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${checkedSteps[i] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>{step.action}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.detail}</p>
                    {step.warning && (
                      <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{step.warning}</span>
                      </div>
                    )}
                    {step.link && (
                      <a
                        href={step.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
                      >
                        {step.linkLabel ?? step.link}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Tips */}
          <div className="px-6 py-4 bg-muted/20 border-t border-border">
            <p className="text-xs font-semibold text-foreground mb-2">Pro tips for {platform.name}</p>
            <ul className="space-y-1.5">
              {platform.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Review ask */}
          <div className="px-6 py-4 border-t border-border">
            <CopyBlock
              label={`${platform.name} review ask email`}
              text={platform.reviewAsk}
              copyKey={`review-${platform.id}`}
              copiedKey={copiedKey}
              onCopy={onCopy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Week1SubmissionsPage() {
  const { copiedKey, copy } = useCopy();

  return (
    <>
      <Helmet>
        <title>Week 1 Submissions — Certxa Internal</title>
        <meta name="description" content="Internal Week 1 backlink submission tracker for Certxa." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="pt-16 pb-24">
        <div className="max-w-4xl mx-auto px-6 md:px-10">

          {/* Header */}
          <div className="py-12 border-b border-border mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Trophy size={20} className="text-primary" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Internal · Not indexed</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
              Week 1 — Directory Submissions + Product Hunt
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
              Submit Certxa to Capterra, G2, GetApp, and Software Advice this week, then launch on Product Hunt the following Tuesday. Track your progress with the status dropdowns on each platform card.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <a
                href="/backlinks/product-hunt"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Rocket size={14} />
                Product Hunt playbook
              </a>
              <a
                href="/backlinks/trade-publications"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
              >
                Week 2 — Trade publications
                <ExternalLink size={13} />
              </a>
              <a
                href="/backlinks/roundup-outreach"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
              >
                Week 3 — Roundup outreach
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* ── SECTION 1: Week timeline ── */}
          <section className="mb-10" aria-label="Week 1 timeline">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Day-by-day timeline
              </h2>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {timeline.map((day, i) => (
                  <div key={i} className="flex gap-4 px-6 py-5">
                    <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        day.critical ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {i + 1}
                      </div>
                      {i < timeline.length - 1 && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                    </div>
                    <div className="pb-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          <Clock size={10} />
                          {day.day}
                        </span>
                        {day.critical && (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Priority</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-2">{day.label}</p>
                      <ul className="space-y-1">
                        {day.tasks.map((task, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                            <span>{task}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── SECTION 2: Shared copy assets ── */}
          <section className="mb-10" aria-label="Shared copy assets">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Copy size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Shared copy — paste into every listing
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <CopyBlock
                label="Tagline (use everywhere)"
                text={TAGLINE}
                copyKey="tagline"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Short description (150–200 words)"
                text={SHORT_DESCRIPTION}
                copyKey="short-desc"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Long description (full — trim to platform limits)"
                text={LONG_DESCRIPTION}
                copyKey="long-desc"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Key features (paste into feature checklists)"
                text={KEY_FEATURES.join('\n')}
                copyKey="features"
                copiedKey={copiedKey}
                onCopy={copy}
              />
              <CopyBlock
                label="Categories"
                text={`Primary: ${CATEGORIES.primary}\nSecondary: ${CATEGORIES.secondary.join(', ')}`}
                copyKey="categories"
                copiedKey={copiedKey}
                onCopy={copy}
              />
            </div>
          </section>

          {/* ── SECTION 3: Platform cards ── */}
          <section className="mb-10" aria-label="Platform submissions">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Star size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Platform submissions
              </h2>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 mb-5 flex gap-3">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Capterra, GetApp, and Software Advice share a vendor portal</p>
                <p className="text-sm text-amber-700 mt-0.5">All three are owned by Gartner Digital Markets. One login, one vendor account. Submit Capterra first — the other two will pre-populate from the same data. You still need to claim each profile separately.</p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {platforms.map(platform => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  copiedKey={copiedKey}
                  onCopy={copy}
                />
              ))}
            </div>
          </section>

          {/* ── SECTION 4: After Week 1 ── */}
          <section aria-label="After Week 1">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Rocket size={16} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                After Week 1 — what to watch
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Review velocity is everything',
                  body: 'The single biggest lever on all four platforms is review count. 5 reviews gets you listed. 10 reviews gets you into shortlists. 20+ reviews gets you badges and "Leader" status. Start asking on day 1 your listing goes live.',
                },
                {
                  title: 'Respond to every review',
                  body: 'Public responses to reviews signal that you\'re an active vendor. Platforms surface active vendors more prominently. Aim to respond within 24 hours — even a two-sentence thank-you counts.',
                },
                {
                  title: 'Track your backlink in Ahrefs / Search Console',
                  body: 'Each listing is a DA 87–91 backlink to certxa.com. Check Google Search Console 2–3 weeks after going live to see if the links are being indexed and passing authority.',
                },
                {
                  title: 'Watch for buyer leads from Software Advice',
                  body: 'Software Advice sends warm leads via email when a buyer matches your profile. These are high-intent — respond within 1 hour. Set up a notification to your phone.',
                },
                {
                  title: 'Add badges to your homepage',
                  body: 'Once you earn "High Performer" or "Top Rated" badges, add them to the social proof section of your homepage. They increase conversion rate for visitors who arrive from search.',
                },
                {
                  title: 'Week 2 starts immediately after',
                  body: 'While waiting for listings to go live, start outreach to trade publications (Nailpro, Modern Salon, Barber Magazine). The Week 2 playbook is at /backlinks/trade-publications.',
                },
              ].map(card => (
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
