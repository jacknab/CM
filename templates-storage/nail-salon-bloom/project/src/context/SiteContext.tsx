import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useSiteData, HoursEntry, GalleryPhotoEntry, ServiceReviewEntry } from '@/hooks/useSiteData';
import { salon as staticSalon, team as staticTeam, testimonials as staticTestimonials } from '@/data/content';
import { services as staticServices, categories as staticCategories } from '@/data/services';
import { toPhone } from '@/utils/contentHelpers';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface LiveService {
  id: string | number;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  category: string;
  popular?: boolean;
  /** Direct image URL from the service record (Priority 3 in image selection). */
  imageUrl?: string | null;
}

export interface LiveTeamMember {
  id?: string | number;
  name: string;
  role: string;
  specialty: string;
  image: string;
}

export interface LiveTestimonial {
  name: string;
  rating: number;
  quote: string;
  initial: string;
}

export interface LiveHoursRow {
  day: string;
  time: string;
}

export interface SiteContextValue {
  salonName: string;
  tagline: string;
  phone: string;
  phoneHref: string;
  email: string;
  emailHref: string;
  address: string;
  city: string;
  hours: LiveHoursRow[];
  services: LiveService[];
  categories: string[];
  team: LiveTeamMember[];
  galleryPhotos: GalleryPhotoEntry[];
  testimonials: LiveTestimonial[];
  reviewCount: number;
  avgRating: number;
  bookingUrl: string;
  bookingSlug: string | null;
  originalWebsiteUrl: string;
  isUnclaimedAutoCreated: boolean;
  isCertxaPreparedSite: boolean;
  googleMapsUrl: string;
  canBookOnline: boolean;
  loading: boolean;
  blocked: boolean;
  /** AI-matched Google review for each service, keyed by service ID */
  serviceReviews: Record<string | number, ServiceReviewEntry>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(t: string): string {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00 ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildHoursRows(entries: HoursEntry[]): LiveHoursRow[] {
  const sorted = [...entries].sort((a, b) => {
    const ai = a.day_of_week === 0 ? 7 : a.day_of_week;
    const bi = b.day_of_week === 0 ? 7 : b.day_of_week;
    return ai - bi;
  });
  return sorted.map((e) => ({
    day: DAY_NAMES[e.day_of_week] ?? `Day ${e.day_of_week}`,
    time: e.is_closed ? 'Closed' : `${formatTime(e.open_time)} – ${formatTime(e.close_time)}`,
  }));
}

const PLACEHOLDER_AVATAR = 'https://images.pexels.com/photos/1858175/pexels-photo-1858175.jpeg?auto=compress&cs=tinysrgb&w=600';
const NO_SALON_DETAILS = { name: '', tagline: '', phone: '', phoneHref: '', email: '', emailHref: '', address: '', city: '', hours: [] };

// ── Context ───────────────────────────────────────────────────────────────────

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, loading, blocked } = useSiteData();
  // A live tenant must never fall back to Bloom's demo catalog while its API
  // request is loading or when the store has deliberately configured zero
  // services. Static content remains available for template previews.
  const isLiveTenant = typeof window !== 'undefined' && Boolean(window.__CERTXA_SLUG__);

  const value = useMemo<SiteContextValue>(() => {
    if (!data) {
      const details = isLiveTenant ? NO_SALON_DETAILS : staticSalon;
      return {
        salonName: details.name,
        tagline: details.tagline,
        phone: details.phone,
        phoneHref: details.phoneHref,
        email: details.email,
        emailHref: details.emailHref,
        address: details.address,
        city: details.city,
        hours: details.hours,
        services: (isLiveTenant ? [] : staticServices).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          durationMinutes: s.durationMinutes,
          category: s.category,
          popular: s.popular,
          imageUrl: null,
        })),
        categories: isLiveTenant ? [] : [...staticCategories],
        team: (isLiveTenant ? [] : staticTeam).map((m) => ({
          name: m.name,
          role: m.role,
          specialty: m.specialty,
          image: m.image,
        })),
        galleryPhotos: [],
        testimonials: isLiveTenant ? [] : staticTestimonials,
        reviewCount: isLiveTenant ? 0 : 248,
        avgRating: isLiveTenant ? 0 : 4.9,
        bookingUrl: '#book',
        bookingSlug: null,
        originalWebsiteUrl: '', isUnclaimedAutoCreated: false, isCertxaPreparedSite: false, googleMapsUrl: '', canBookOnline: !isLiveTenant,
        loading,
        blocked,
        serviceReviews: {},
      };
    }

    // ── Live data mapping ─────────────────────────────────────────────────────

    const biz = data.business;

    const rawPhone = biz?.phone ?? (data.isCertxaPreparedSite ? '' : staticSalon.phone);
    const displayPhone = toPhone(rawPhone);
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phoneHref =
      phoneDigits.length >= 10
        ? `tel:+${phoneDigits.startsWith('1') ? phoneDigits : '1' + phoneDigits}`
        : (data.isCertxaPreparedSite ? '' : staticSalon.phoneHref);

    const rawEmail = biz?.email ?? staticSalon.email;

    // Hours
    const hours = data.hours.length > 0 ? buildHoursRows(data.hours) : (data.isCertxaPreparedSite ? [] : staticSalon.hours);

    // Services
    const catMap = new Map(data.serviceCategories.map((c) => [c.id, c.name]));
    const liveServices: LiveService[] = data.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      price: typeof s.price === 'string' ? parseFloat(s.price) || 0 : s.price,
      durationMinutes: s.duration ?? 60,
      category: s.category_id != null ? (catMap.get(s.category_id) ?? 'General') : 'General',
      imageUrl: s.image_url ?? null,
    }));
    const liveCategories = [...new Set(liveServices.map((s) => s.category))];

    // Team
    const liveTeam: LiveTeamMember[] = data.staff.map((m, i) => ({
      id: m.id,
      name: m.name,
      role: m.role ?? 'Nail Technician',
      specialty: m.bio ?? m.role ?? 'Nail care specialist',
      image: m.avatar_url ?? (data.isCertxaPreparedSite ? '' : staticTeam[i % staticTeam.length]?.image ?? PLACEHOLDER_AVATAR),
    }));

    // Reviews → Testimonials
    const validReviews = data.reviews
      .map((r) => ({
        ...r,
        comment: r.comment ?? r.review_text ?? null,
      }))
      .filter((r) => r.comment && r.comment.trim().length > 0);

    const liveTestimonials: LiveTestimonial[] = validReviews.slice(0, 6).map((r) => {
      const name = r.customer_name ?? 'Anonymous';
      return {
        name,
        rating: r.rating,
        quote: r.comment!,
        initial: name.charAt(0).toUpperCase(),
      };
    });

    // Use the pre-aggregated totals from the API (covers ALL reviews, not just the
    // sampled subset returned in data.reviews). Falls back to computing from the
    // sample only if the aggregate fields are absent (old API / static preview).
    const reviewCount: number =
      typeof (data as any).googleReviewCount === 'number' && (data as any).googleReviewCount > 0
        ? (data as any).googleReviewCount
        : data.reviews.length;
    const avgRating: number =
      typeof (data as any).googleAvgRating === 'number' && (data as any).googleAvgRating > 0
        ? (data as any).googleAvgRating
        : reviewCount > 0
          ? Math.round((data.reviews.reduce((s, r) => s + r.rating, 0) / data.reviews.length) * 10) / 10
          : (data.isCertxaPreparedSite ? 0 : 5);

    // Booking URL
    const slug = biz?.booking_slug ?? null;
    const bookingUrl = '#book';

    return {
      salonName: biz?.name ?? (data.isCertxaPreparedSite ? data.website.name : staticSalon.name),
      tagline: data.isCertxaPreparedSite ? '' : staticSalon.tagline,
      phone: displayPhone,
      phoneHref,
      email: rawEmail,
      emailHref: `mailto:${rawEmail}`,
      address: biz?.address ?? (data.isCertxaPreparedSite ? '' : staticSalon.address),
      city: [biz?.city, biz?.state, biz?.postcode].filter(Boolean).join(', ') || (data.isCertxaPreparedSite ? '' : staticSalon.city),
      hours,
      // The tenant API is authoritative. An empty service array means the
      // owner has no services and must render an empty section—not demo data.
      services: liveServices,
      categories: liveCategories,
      team: data.isCertxaPreparedSite ? liveTeam : (liveTeam.length > 0 ? liveTeam : staticTeam),
      galleryPhotos: data.galleryPhotos ?? [],
      testimonials: data.isCertxaPreparedSite ? liveTestimonials : (liveTestimonials.length > 0 ? liveTestimonials : staticTestimonials),
      reviewCount: data.isCertxaPreparedSite ? reviewCount : (reviewCount > 0 ? reviewCount : 248),
      avgRating,
      bookingUrl,
      bookingSlug: slug,
      originalWebsiteUrl: biz?.website ?? '',
      isUnclaimedAutoCreated: data.isUnclaimedAutoCreated === true,
      isCertxaPreparedSite: data.isCertxaPreparedSite === true,
      googleMapsUrl: data.googlePlaceId ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(data.googlePlaceId)}` : '',
      canBookOnline: !data.isUnclaimedAutoCreated && biz?.online_booking_mode !== 'off',
      loading,
      blocked,
      serviceReviews: (data.serviceReviews ?? {}) as Record<string | number, ServiceReviewEntry>,
    };
  }, [data, loading, blocked, isLiveTenant]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside SiteProvider');
  return ctx;
}
