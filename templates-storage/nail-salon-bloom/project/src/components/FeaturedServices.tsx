import { useState } from 'react';
import { Clock, Star, ArrowRight, ChevronDown, Users } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { useBooking } from '@/context/BookingContext';
import type { ServiceReviewEntry } from '@/hooks/useSiteData';
import type { LiveService } from '@/context/SiteContext';
import {
  getBestServiceImage,
  isCustomerImage,
  trimReviewText,
  formatDisplayName,
} from '@/utils/contentHelpers';

// ── Star row ──────────────────────────────────────────────────────────────────
function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

// ── Single service card ───────────────────────────────────────────────────────
function ServiceCard({
  service,
  review,
}: {
  service: LiveService;
  review?: ServiceReviewEntry | null;
}) {
  const { openBooking } = useBooking();
  const imageUrl = getBestServiceImage(service, review);
  const showCustomerBadge = isCustomerImage(review);
  const hasReview = Boolean(review?.comment);
  const displayName = formatDisplayName(review?.customerName);
  const quote = trimReviewText(review?.comment ?? '', 120);
  const avatarUrl = review?.reviewerAvatarUrl ?? null;
  const avatarInitial = (review?.customerName ?? 'V').charAt(0).toUpperCase();

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* ── Main body: compact split on mobile, stacked on wider cards ───── */}
      <div className="bloom-service-body flex min-h-[180px] sm:flex-col">
        {/* Image */}
        <div className="bloom-service-image relative w-[44%] flex-shrink-0 overflow-hidden bg-cream-100 sm:h-auto sm:w-full">
          <img
            src={imageUrl}
            alt={
              showCustomerBadge
                ? `Real client result for ${service.name}`
                : `${service.name} at our nail salon`
            }
            loading="lazy"
            className="h-full w-full object-cover sm:h-auto sm:w-full"
          />
          {showCustomerBadge && (
            <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-800 backdrop-blur-sm shadow-sm">
              ✨ Client photo
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
          {/* Service name */}
          <h3 className="font-serif text-[17px] font-semibold leading-snug text-gray-900">
            {service.name}
          </h3>

          {/* Price + Duration row */}
          <div className="flex items-center gap-3">
            <span className="font-serif text-[22px] font-bold text-gray-700">
              {service.price > 0 ? `$${service.price}` : 'POA'}
            </span>
            {service.durationMinutes > 0 && (
              <div className="flex items-center gap-1 text-[14px] text-gray-500">
                <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {service.durationMinutes} min
              </div>
            )}
          </div>

          {/* Description */}
          <p className="text-[12px] leading-relaxed text-gray-500 line-clamp-2">
            {service.description}
          </p>

          {/* Reviewer */}
          {hasReview && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {/* Avatar */}
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600"
                    aria-hidden="true"
                  >
                    {avatarInitial}
                  </div>
                )}
                <span className="text-[12px] font-semibold text-gray-800">{displayName}</span>
              </div>
              <StarRow rating={review!.rating} size={12} />
              <p className="text-[11px] italic leading-relaxed text-gray-600">
                &ldquo;{quote}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Book button ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={() => openBooking(service.id, service.name)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-700 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label={`Book ${service.name}`}
        >
          Book Now
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
export default function FeaturedServices() {
  const { services, categories, serviceReviews, avgRating, reviewCount } = useSite();
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const allCategories = ['All', ...categories];

  const filtered =
    activeCategory === 'All'
      ? services
      : services.filter((s) => s.category === activeCategory);

  return (
    <section
      id="services"
      aria-labelledby="services-heading"
      className="bg-[#f4ede8] px-4 py-10 sm:px-6 sm:py-14"
    >
      <div className="mx-auto w-full max-w-7xl">
      {/* Heading */}
      <div className="mb-5">
        <h2
          id="services-heading"
          className="font-serif text-[28px] font-bold leading-tight text-gray-900"
        >
          Our Services
        </h2>
        <p className="mt-1 text-[14px] text-gray-600">
          Real results from real clients{' '}
          <span aria-hidden="true" className="text-rose-500">♥</span>
        </p>
      </div>

      {/* Category dropdown — floats above the list */}
      {allCategories.length > 2 && (
        <div className="relative mb-5">
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
          </div>
          <select
            id="category-filter"
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 text-[14px] font-medium text-gray-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Services' : cat}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Service cards */}
      <div className="bloom-service-grid grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {filtered.map((service) => {
          const review =
            serviceReviews[service.id] ??
            serviceReviews[String(service.id)] ??
            serviceReviews[Number(service.id)] ??
            null;

          return (
            <ServiceCard
              key={service.id}
              service={service}
              review={review}
            />
          );
        })}

        {filtered.length === 0 && (
          <p className="py-10 text-center text-[14px] text-gray-500">
            No services in this category.
          </p>
        )}
      </div>

      {/* "View all reviews" banner */}
      {reviewCount > 0 && (
        <a
          href="#visit"
          className="mt-5 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-300"
          aria-label="View all Google reviews"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50">
              <Users className="h-5 w-5 text-rose-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-900">
                See more real results from our clients!
              </p>
              <p className="text-[12px] text-gray-500">View all reviews on Google</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" aria-hidden="true" />
        </a>
      )}
      </div>
    </section>
  );
}
