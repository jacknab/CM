/**
 * The salon this website shows (owner, 2026-11-11). A real salon's page (window.__CERTXA_SLUG__, set by the server's
 * template-serve) reads everything from Certxa: /api/tenant/<slug>/data (api-server lib/tenant-data.ts) — its name,
 * phone, address, hours, services and prices, reviews (Google's when they're Google's), photos, about text, logo and
 * social links. Booking is Certxa's own (certxa.com/book/<slug>). The template's preview (no slug) shows the sample
 * salon in data.ts. A real salon never shows sample content: no made-up reviews, prices, hours, claims or photos of work.
 * Nail salons, hair salons and barbershops get their own words and default photos (businessWording).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSiteData } from '@/hooks/useSiteData';
import { businessWording, NAIL_WORDING, type BusinessWording } from '@/utils/businessWording';
import * as sample from '@/data';

export interface LiveService {
  id: string | number;
  name: string;
  description: string;
  /** null: no price shown (a page Certxa prepared that its owner hasn't claimed). */
  price: number | null;
  duration: string;
  category: string;
  popular?: boolean;
}
export interface LiveReview { name: string; text: string; rating: number; label: string }
export interface LivePhoto { url: string; alt: string }
export interface HoursRow { day: string; time: string; closed: boolean }
export interface Faq { question: string; answer: string }

export type SiteKind = 'nail' | 'hair' | 'barber' | 'other';

export interface SiteValue {
  /** The template's own preview: the sample salon. */
  isSample: boolean;
  loading: boolean;
  blocked: boolean;
  kind: SiteKind;
  wording: BusinessWording;
  salonName: string;
  /** The name split for the two-tone logo: the first word bold, the rest light. */
  nameFirst: string;
  nameRest: string;
  logoImage: string | null;
  phone: string;
  phoneHref: string;
  street: string;
  cityLine: string;
  fullAddress: string;
  mapQuery: string;
  hours: HoursRow[];
  /** The hours in one short line for the top bar ("Tue–Fri 9:30–7 · Sat 9–6"). */
  hoursLine: string;
  services: LiveService[];
  categories: string[];
  reviews: LiveReview[];
  reviewCount: number;
  avgRating: number;
  reviewsFromGoogle: boolean;
  galleryPhotos: LivePhoto[];
  aboutText: string;
  heroText: string;
  heroImage: string;
  aboutImages: [string, string];
  instagramUrl: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  canBookOnline: boolean;
  /** Certxa's booking for this salon; with a service, that service chosen. */
  bookingUrl: (serviceId?: string | number) => string;
  isUnclaimed: boolean;
  claimLine: string | null;
  claimUrl: string | null;
  faqs: Faq[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "09:30" → "9:30 AM"; short: "9:30" / "7". */
function time(t: string, short = false): string {
  const [hs, ms = '0'] = t.split(':');
  const h = parseInt(hs, 10), m = parseInt(ms, 10);
  const hour = h % 12 || 12;
  if (short) return m ? `${hour}:${String(m).padStart(2, '0')}` : `${hour}`;
  return `${hour}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

function minutesLabel(min: number | undefined | null): string {
  if (!min || min <= 0) return '';
  return min >= 60 ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
}

/** Days with the same hours, joined: "Tue–Fri 9:30–7 · Sat 9–6 · Sun 10–4". */
function hoursLineOf(rows: { day: number; open: string; close: string; closed: boolean }[]): string {
  const open = [1, 2, 3, 4, 5, 6, 0].map((d) => rows.find((r) => r.day === d)).filter((r): r is NonNullable<typeof r> => !!r && !r.closed);
  const parts: string[] = [];
  for (let i = 0; i < open.length; i++) {
    let j = i;
    const span = `${time(open[i].open, true)}–${time(open[i].close, true)}`;
    while (j + 1 < open.length && `${time(open[j + 1].open, true)}–${time(open[j + 1].close, true)}` === span
      && ((open[j + 1].day + 6) % 7) === ((open[j].day + 6) % 7) + 1) j++;
    parts.push(`${DAY_SHORT[open[i].day]}${j > i ? `–${DAY_SHORT[open[j].day]}` : ''} ${span}`);
    i = j;
  }
  return parts.join(' · ');
}

function kindOf(category: string | null | undefined): SiteKind {
  const c = String(category ?? '').toLowerCase();
  if (/nail/.test(c)) return 'nail';
  if (/barber/.test(c)) return 'barber';
  if (/hair/.test(c)) return 'hair';
  return c ? 'other' : 'nail';
}

/** Default photos for each kind of business, until the salon adds its own (Pexels). */
const px = (id: number, w: number, h: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`;
const KIND_PHOTOS: Record<SiteKind, { hero: string; about: [string, string] }> = {
  nail: { hero: px(36328527, 1920, 1200), about: [px(13424007, 900, 1100), px(4677850, 600, 600)] },
  hair: { hero: px(3065171, 1920, 1200), about: [px(3065170, 900, 1100), px(3065171, 600, 600)] },
  barber: { hero: px(1813346, 1920, 1200), about: [px(1570807, 900, 1100), px(3998429, 600, 600)] },
  other: { hero: px(36328527, 1920, 1200), about: [px(13424007, 900, 1100), px(4677850, 600, 600)] },
};

/** The city line: the business's own city, state and ZIP, else read from a one-line address. */
function cityOf(biz: { address?: string; city?: string; state?: string; postcode?: string } | null | undefined): string {
  const own = [biz?.city, [biz?.state, biz?.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (own) return own;
  const parts = String(biz?.address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|us|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length >= 3 ? parts.slice(-2).join(', ') : '';
}

const SiteContext = createContext<SiteValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, loading, blocked } = useSiteData();
  const slug = typeof window !== 'undefined' ? window.__CERTXA_SLUG__ ?? null : null;

  const value = useMemo<SiteValue>(() => {
    // The salon's own booking address (its booking slug; the website's slug can differ, e.g. in a template preview).
    const bookSlug = data?.business?.booking_slug || slug;
    const bookingUrl = (serviceId?: string | number) =>
      bookSlug ? `https://certxa.com/book/${encodeURIComponent(bookSlug)}${serviceId != null ? `?serviceId=${encodeURIComponent(String(serviceId))}` : ''}` : '#/visit';

    // ── The template's preview, or a real salon still loading (nothing of the sample shows for a real salon) ──
    if (!data) {
      const isSample = !slug;
      const s = sample.salon;
      return {
        isSample, loading, blocked, kind: 'nail', wording: NAIL_WORDING,
        salonName: isSample ? s.name : '', nameFirst: isSample ? s.nameFirst : '', nameRest: isSample ? s.nameRest : '', logoImage: null,
        phone: isSample ? s.phone : '', phoneHref: isSample ? s.phoneHref : '',
        street: isSample ? s.street : '', cityLine: isSample ? s.cityLine : '', fullAddress: isSample ? `${s.street}, ${s.cityLine}` : '',
        mapQuery: isSample ? `${s.street}, ${s.cityLine}` : '',
        hours: isSample ? s.hours : [], hoursLine: isSample ? s.hoursLine : '',
        services: isSample ? sample.services.map((x) => ({ id: x.id, name: x.name, description: x.description, price: Number(x.price) || null, duration: x.duration, category: x.category, popular: x.popular })) : [],
        categories: isSample ? [...new Set(sample.services.map((x) => x.category))] : [],
        reviews: isSample ? sample.testimonials.map((t) => ({ name: t.name, text: t.text, rating: t.rating, label: t.location })) : [],
        reviewCount: isSample ? 327 : 0, avgRating: isSample ? 4.9 : 0, reviewsFromGoogle: isSample,
        galleryPhotos: isSample ? sample.galleryItems.map((g) => ({ url: g.image, alt: g.alt })) : [],
        aboutText: isSample ? s.about : '', heroText: isSample ? s.heroText : '',
        heroImage: KIND_PHOTOS.nail.hero, aboutImages: KIND_PHOTOS.nail.about,
        instagramUrl: isSample ? 'https://www.instagram.com/' : null, instagramHandle: isSample ? 'luxenailbar' : null, facebookUrl: isSample ? 'https://www.facebook.com/' : null,
        canBookOnline: isSample, bookingUrl, isUnclaimed: false, claimLine: null, claimUrl: null,
        faqs: isSample ? sample.faqs : [],
      };
    }

    // ── A real salon ──
    const biz = data.business;
    const kind = kindOf(biz?.category);
    const wording = businessWording(biz?.category ?? 'nail');
    const name = biz?.name ?? '';
    const words = name.trim().split(/\s+/);
    const isUnclaimed = data.isUnclaimedAutoCreated === true;

    const digits = String(biz?.phone ?? '').replace(/\D/g, '');
    const phoneHref = digits.length >= 10 ? `tel:+${digits.length === 10 ? `1${digits}` : digits}` : '';
    const cityLine = cityOf(biz);
    // The address as one line, with the city when the saved address is the street only.
    const savedAddress = String(biz?.address ?? '').replace(/,\s*(usa|us|united states)$/i, '').trim();
    const fullAddress = savedAddress && cityLine && !savedAddress.toLowerCase().includes(cityLine.split(',')[0].toLowerCase())
      ? `${savedAddress}, ${cityLine}` : savedAddress;
    const street = fullAddress ? fullAddress.split(',')[0].trim() : '';

    const hoursRaw = data.hours.map((h) => ({ day: h.day_of_week, open: h.open_time, close: h.close_time, closed: h.is_closed }));
    const hours: HoursRow[] = [1, 2, 3, 4, 5, 6, 0].map((d) => hoursRaw.find((h) => h.day === d)).filter((h): h is NonNullable<typeof h> => !!h)
      .map((h) => ({ day: DAY_NAMES[h.day], time: h.closed ? 'Closed' : `${time(h.open)} – ${time(h.close)}`, closed: h.closed }));

    const catName = new Map(data.serviceCategories.map((c) => [c.id, c.name]));
    const services: LiveService[] = data.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      price: isUnclaimed ? null : (typeof s.price === 'string' ? parseFloat(s.price) : s.price) || null,
      duration: minutesLabel(s.duration),
      category: s.category_id != null ? catName.get(s.category_id) ?? 'Services' : 'Services',
    }));
    const categories = [...new Set(services.map((s) => s.category))];

    // Google's reviews are named as Google's, with Google's own total and average (owner, 2026-11-05).
    const withText = data.reviews.filter((r) => String(r.review_text ?? r.comment ?? '').trim());
    const googleCount = Number(data.googleReviewCount) || 0;
    const fromGoogle = googleCount > 0 || withText.some((r) => r.source === 'google');
    const reviews: LiveReview[] = withText.slice(0, 8).map((r) => ({
      name: r.customer_name?.trim() || (fromGoogle ? 'Google user' : 'Verified client'),
      text: String(r.review_text ?? r.comment ?? '').trim(),
      rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5))),
      label: fromGoogle ? 'Google review' : 'Verified client',
    }));
    const rated = data.reviews.filter((r) => Number(r.rating) > 0);
    const reviewCount = googleCount > 0 ? googleCount : rated.length;
    const avgRating = googleCount > 0 && Number(data.googleAvgRating) > 0
      ? Number(data.googleAvgRating)
      : rated.length ? Math.round((rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length) * 10) / 10 : 0;

    const site = biz?.booking_site ?? null;
    const insta = String(site?.instagram ?? '').replace(/^@/, '').trim();
    const fb = String(site?.facebook ?? '').trim();
    const ownCover = String(site?.coverImage ?? biz?.cover_image ?? '').trim();
    const heroImage = ownCover || (kind === 'nail' ? String(biz?.hero_image ?? '').trim() || KIND_PHOTOS.nail.hero : KIND_PHOTOS[kind].hero);
    const canBookOnline = data.isCertxaPreparedSite !== true && biz?.online_booking_mode !== 'off';
    const city = cityLine.split(',')[0];

    // Questions answered from the salon's own facts only (no claims the salon hasn't made).
    const faqs: Faq[] = [
      ...(fullAddress ? [{ question: `Where is ${name}?`, answer: `${name} is at ${fullAddress}.` }] : []),
      ...(hours.length ? [{ question: `What are ${name}'s hours?`, answer: hours.map((h) => `${h.day}: ${h.time}`).join('. ') + '.' }] : []),
      { question: `How do I book at ${name}?`, answer: canBookOnline
        ? `Book online at any time with the Book buttons on this page${digits.length >= 10 ? `, or call ${prettyPhone(digits)}` : ''}.`
        : digits.length >= 10 ? `Call ${prettyPhone(digits)} to book an appointment.` : `Contact ${name} to book an appointment.` },
      ...(categories.length ? [{ question: `What services does ${name} offer?`, answer: `${name} offers ${categories.slice(0, 6).join(', ').toLowerCase()}${city ? ` in ${city}` : ''}. See the Services page for every service${isUnclaimed ? '' : ' with its price and time'}.` }] : []),
    ];

    return {
      isSample: false, loading, blocked, kind, wording,
      salonName: name, nameFirst: words[0] ?? '', nameRest: words.slice(1).join(' '),
      logoImage: String(site?.logoImage ?? '').trim() || null,
      phone: digits.length >= 10 ? prettyPhone(digits) : String(biz?.phone ?? ''), phoneHref,
      street, cityLine, fullAddress, mapQuery: fullAddress || cityLine,
      hours, hoursLine: hoursLineOf(hoursRaw),
      services, categories, reviews, reviewCount, avgRating, reviewsFromGoogle: fromGoogle,
      galleryPhotos: (data.galleryPhotos ?? []).filter((p) => p.image_url).map((p, i) => ({ url: p.image_url, alt: p.caption?.trim() || wording.galleryAlt(name, i + 1) })),
      aboutText: String(biz?.about ?? '').trim(),
      heroText: String(biz?.hero_text ?? '').trim() || `${wording.label}${city ? ` in ${city}` : ''}. ${canBookOnline ? 'Book your appointment online in seconds.' : 'Call us to book your appointment.'}`,
      heroImage, aboutImages: KIND_PHOTOS[kind].about,
      instagramUrl: insta ? `https://instagram.com/${encodeURIComponent(insta)}` : null, instagramHandle: insta || null,
      facebookUrl: /^[A-Za-z0-9.\-]{1,80}$/.test(fb) ? `https://facebook.com/${fb}` : null,
      canBookOnline, bookingUrl,
      isUnclaimed, claimLine: typeof data.claimLine === 'string' ? data.claimLine : null,
      claimUrl: isUnclaimed && biz?.booking_slug ? `https://certxa.com/claim/salon/${biz.booking_slug}` : null,
      faqs,
    };
  }, [data, loading, blocked, slug]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside SiteProvider');
  return ctx;
}
