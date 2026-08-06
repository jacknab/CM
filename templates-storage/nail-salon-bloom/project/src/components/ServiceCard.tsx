/**
 * ServiceCard
 *
 * Each card is a mini sales page for a service. The image area occupies ~60%
 * of the card's visual height and uses the customer photo priority chain:
 *   1. Google review media (real customer photo from review)
 *   2. Customer-uploaded service photo
 *   3. Service's own image
 *   4. Category image
 *   5. Default template placeholder
 *
 * The matched Google review is shown inline below the image.
 */
import { useState } from 'react';
import { ArrowRight, Clock, Star } from 'lucide-react';
import type { LiveService } from '@/context/SiteContext';
import type { ServiceReviewEntry } from '@/hooks/useSiteData';
import { useBooking } from '@/context/BookingContext';
import {
  getBestServiceImage,
  isCustomerImage,
  trimReviewText,
  formatDisplayName,
} from '@/utils/contentHelpers';

interface ServiceCardProps {
  service: LiveService;
  review?: ServiceReviewEntry | null;
  bookingUrl: string;
  avgRating: number;
  reviewCount: number;
}

function StarRow({ rating, small = false }: { rating: number; small?: boolean }) {
  const size = small ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`${size} ${i < rating ? 'fill-gold-500 text-gold-500' : 'fill-cream-200 text-cream-200'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function ServiceCard({
  service,
  review,
  avgRating,
  reviewCount,
}: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { openBooking } = useBooking();

  const imageUrl = getBestServiceImage(service, review);
  const showCustomerBadge = isCustomerImage(review);

  // A service-result review is only meaningful when it has an actual customer
  // photo. Never turn an avatar-only Google review into a social-profile card.
  const hasReview = Boolean(review?.comment && isCustomerImage(review));
  const displayName = formatDisplayName(review?.customerName);
  const fullText = review?.comment ?? '';
  const trimmedText = trimReviewText(fullText, 110);
  const needsExpand = fullText.length > 110;

  // Reviewer avatar: Google profile pic → initials fallback
  const avatarUrl = review?.reviewerAvatarUrl ?? null;
  const avatarInitial = (review?.customerName ?? 'V').charAt(0).toUpperCase();

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* ── Image area (~60% of visual card) ─────────────────────────────── */}
      <div className="relative aspect-[4/3] overflow-hidden bg-cream-100">
        <img
          src={imageUrl}
          alt={
            showCustomerBadge
              ? `Real client result for ${service.name}`
              : `${service.name} at our nail salon`
          }
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            // Fallback to gradient placeholder on broken image
            const el = e.currentTarget;
            el.style.display = 'none';
          }}
        />

        {/* Verified client badge — only shown for real customer photos */}
        {showCustomerBadge && (
          <div
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm"
            aria-label="Verified client result"
          >
            <span className="text-sm" aria-hidden="true">✨</span>
            <span className="text-xs font-semibold text-ink-800">Verified Client Result</span>
          </div>
        )}

        {/* Popular badge */}
        {service.popular && (
          <div className="absolute right-3 top-3 rounded-full bg-gold-700 px-3 py-1 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-white">Popular</span>
          </div>
        )}
      </div>

      {/* ── Card content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Service name + rating */}
        <div>
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-serif text-xl font-semibold leading-tight text-ink-900 sm:text-2xl">
              {service.name}
            </h3>
            <span className="mt-1 shrink-0 rounded-full bg-cream-100 px-2.5 py-1 text-xs font-medium text-ink-600">
              {service.category}
            </span>
          </div>

          {/* Salon aggregate rating (shown when salon has reviews) */}
          {reviewCount > 0 && (
            <div className="flex items-center gap-2">
              <StarRow rating={Math.round(avgRating)} small />
              <span className="text-xs text-ink-500">
                {avgRating} · {reviewCount} Google Reviews
              </span>
            </div>
          )}

          {/* Service description (shown only when no review) */}
          {!hasReview && service.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{service.description}</p>
          )}
        </div>

        {/* ── Matched review block ──────────────────────────────────────── */}
        {hasReview && (
          <div className="rounded-2xl bg-cream-50 p-3.5">
            <div className="flex items-start gap-3">
              {/* Reviewer avatar */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${displayName}'s profile`}
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-cream-200"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = 'none';
                    const next = el.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-bold text-gold-800 ring-1 ring-gold-200"
                style={{ display: avatarUrl ? 'none' : 'flex' }}
                aria-hidden="true"
              >
                {avatarInitial}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-sm font-semibold text-ink-900">{displayName}</span>
                </div>
                <StarRow rating={review!.rating} small />
              </div>
            </div>

            {/* Review quote */}
            <p className="mt-2.5 text-xs leading-relaxed text-ink-700 italic">
              &ldquo;{expanded ? fullText : trimmedText}&rdquo;
            </p>

            {needsExpand && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 text-xs font-semibold text-gold-700 hover:text-gold-800 focus:outline-none"
                aria-expanded={expanded}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

        {/* ── Price + duration + book ───────────────────────────────────── */}
        <div className="mt-auto flex items-center justify-between border-t border-cream-100 pt-4">
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-semibold text-gold-700">
              {service.price > 0 ? `$${service.price}` : 'POA'}
            </span>
            {service.durationMinutes > 0 && (
              <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {service.durationMinutes} min
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => openBooking(service.id, service.name)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gold-800 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2"
            aria-label={`Book ${service.name}`}
          >
            Book
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
