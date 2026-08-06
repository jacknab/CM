import { useSite } from '../context/SiteContext';
import { useBookingPanel } from '../context/BookingPanelContext';
import type { ServiceEntry, CategoryEntry, ServiceReviewEntry } from '../hooks/useSiteData';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price: string | number): string {
  if (typeof price === 'string' && (price.startsWith('$') || price === '')) return price;
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(n)) return String(price);
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return '1 year ago';
  return `${Math.floor(days / 365)} years ago`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 20 20"
          fill={i < rating ? '#F59E0B' : 'none'}
          stroke={i < rating ? '#F59E0B' : '#D1D5DB'}
          strokeWidth="1.5"
        >
          <path d="M10 1l2.39 4.84L18 6.69l-4 3.9.94 5.5L10 13.4l-4.94 2.69.94-5.5-4-3.9 5.61-.85z" />
        </svg>
      ))}
    </span>
  );
}

// ── Reviewer avatar ───────────────────────────────────────────────────────────

function ReviewerAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string | null }) {
  const initial = (name ?? 'C').charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <div className="relative flex-shrink-0 w-9 h-9">
        <img
          src={avatarUrl}
          alt={name ? `${name}'s profile` : 'Reviewer'}
          className="w-9 h-9 rounded-full object-cover ring-1 ring-cream-200"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = 'none';
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div
          className="absolute inset-0 w-9 h-9 rounded-full bg-pink-100 items-center justify-center text-[13px] font-bold text-pink-700 ring-1 ring-pink-200"
          style={{ display: 'none' }}
        >
          {initial}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-[13px] font-bold text-pink-700 ring-1 ring-pink-200">
      {initial}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisplayCard {
  categoryName: string;
  service: ServiceEntry;
  review: ServiceReviewEntry | null;
}

// ── Fallback (no real data) ───────────────────────────────────────────────────

const FALLBACK_CARDS: DisplayCard[] = [
  {
    categoryName: 'Manicures',
    service: { id: 0, name: 'Classic Manicure', price: 25, duration: 45, description: 'A timeless treatment featuring shaping, cuticle care, and a flawless polish finish.' },
    review: null,
  },
  {
    categoryName: 'Pedicures',
    service: { id: 0, name: 'Spa Pedicure', price: 55, duration: 60, description: 'Indulge in our signature pedicure with a soak, scrub, massage, and gel-polish finish.' },
    review: null,
  },
  {
    categoryName: 'Nail Enhancements',
    service: { id: 0, name: 'Acrylic Full Set', price: 58, duration: 90, description: 'Durable acrylic extensions sculpted and polished to your desired length and shape.' },
    review: null,
  },
];

// ── Card ──────────────────────────────────────────────────────────────────────

interface ServiceCardProps {
  card: DisplayCard;
  /** Called when the customer clicks Book — undefined means no booking configured */
  onBook?: (serviceId: number) => void;
}

function ServiceCard({ card, onBook }: ServiceCardProps) {
  const { categoryName, service, review } = card;
  const hasMostLoved = !!review;

  const handleBook = () => {
    if (service.id && onBook) {
      // Pre-select this specific service in the booking flow
      onBook(service.id);
    } else if (onBook) {
      // Fallback: open the booking panel on the service list
      onBook(0);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-5 flex flex-col h-full">

      {/* ── Top badges ── */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-block text-[11px] font-medium text-charcoal-500 bg-white border border-cream-300 px-3 py-1 rounded-full">
          {categoryName}
        </span>
        {hasMostLoved && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-white px-3 py-1 rounded-full whitespace-nowrap"
            style={{ background: '#BE185D' }}
          >
            <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            Most Loved
          </span>
        )}
      </div>

      {/* ── Service name ── */}
      <h3 className="font-serif text-[1.35rem] font-bold text-charcoal-800 mt-4 leading-snug">
        {service.name}
      </h3>

      {/* ── Description ── */}
      {service.description && (
        <p className="text-[13px] text-charcoal-400 mt-2 leading-relaxed line-clamp-3">
          {service.description}
        </p>
      )}

      {/* ── Review ── */}
      {review && (
        <div className="mt-4 pt-4 border-t border-cream-100">
          <div className="flex gap-3 items-start">
            <ReviewerAvatar
              avatarUrl={review.reviewerAvatarUrl ?? null}
              name={review.customerName}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[13px] font-bold text-charcoal-800 leading-tight">
                  {review.customerName ?? 'Customer'}
                </span>
                {review.createdAt && (
                  <span className="text-[11px] text-charcoal-400 whitespace-nowrap">
                    · {timeAgo(review.createdAt)}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <Stars rating={review.rating} />
              </div>
              {review.comment && (
                <p className="mt-1.5 text-[12.5px] text-charcoal-600 italic leading-snug line-clamp-3">
                  "{review.comment}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Footer: price + duration + book ── */}
      <div className="mt-5 pt-4 border-t border-cream-100 flex items-end justify-between gap-3">
        <div>
          <p className="text-[1.6rem] font-bold leading-none" style={{ color: '#BE185D' }}>
            {formatPrice(service.price)}
          </p>
          {service.duration && (
            <p className="flex items-center gap-1 text-[11px] text-charcoal-400 mt-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {service.duration} min
            </p>
          )}
        </div>
        {/* Book button — opens the booking panel with this service pre-selected */}
        <button
          onClick={handleBook}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-5 py-2.5 rounded-full flex-shrink-0 transition-all hover:opacity-90"
          style={{ background: '#FCE7F3', color: '#BE185D' }}
        >
          Book
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Services() {
  const site = useSite();
  const { open, openWithService } = useBookingPanel();
  const siteServices = site?.services ?? [];
  const siteCategories = site?.serviceCategories ?? [] as CategoryEntry[];
  const serviceReviews = (site?.serviceReviews ?? {}) as Record<string | number, ServiceReviewEntry>;
  const hasBookingSlug = !!site?.business?.booking_slug;

  // Helper: get a photo review for a service only if it has a photo and rating >= 4
  function getPhotoReview(serviceId: number): ServiceReviewEntry | null {
    const r = serviceReviews[serviceId] ?? serviceReviews[String(serviceId)];
    if (r && r.rating >= 4 && r.photoUrl) return r;
    return null;
  }

  // Build display cards from real data
  let cards: DisplayCard[] = [];

  if (siteServices.length > 0) {
    const catMap = new Map<number, string>(siteCategories.map(c => [c.id, c.name]));

    // Group services by category
    const groups = new Map<number, ServiceEntry[]>();
    for (const svc of siteServices) {
      const key = svc.category_id ?? 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(svc);
    }

    // Top 3 categories by service count
    const topCats = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);

    cards = topCats.map(([catId, svcs]) => {
      const withPhoto = svcs.filter(s => getPhotoReview(s.id) !== null);
      const featured = withPhoto.length > 0
        ? withPhoto.sort((a, b) => (getPhotoReview(b.id)?.rating ?? 0) - (getPhotoReview(a.id)?.rating ?? 0))[0]
        : svcs[0];

      return {
        categoryName: catMap.get(catId) ?? 'Services',
        service: featured,
        review: getPhotoReview(featured.id),
      };
    });
  } else {
    cards = FALLBACK_CARDS;
  }

  // onBook handler: opens panel with this service pre-selected (or plain open if no id)
  const handleBook = hasBookingSlug
    ? (serviceId: number) => {
        if (serviceId > 0) {
          openWithService(serviceId);
        } else {
          open();
        }
      }
    : undefined;

  return (
    <section id="services" className="bg-cream-50 py-24 px-6">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="text-center mb-14">
          <p className="font-sans text-[10px] font-semibold tracking-[0.5em] uppercase text-gold-500 mb-3">
            What We Offer
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-charcoal-800">
            Our Services & Pricing
          </h2>
          <div className="mt-4 w-16 h-px bg-gold-400 mx-auto" />
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, idx) => (
            <ServiceCard
              key={`${card.categoryName}-${idx}`}
              card={card}
              onBook={handleBook}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <button
            onClick={() => hasBookingSlug ? open() : undefined}
            disabled={!hasBookingSlug}
            className="inline-flex items-center gap-3 bg-charcoal-800 hover:bg-charcoal-700 text-white font-sans text-xs font-bold tracking-[0.25em] uppercase px-10 py-4 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Book Your Service
          </button>
        </div>

      </div>
    </section>
  );
}
