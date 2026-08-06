/**
 * ServiceReviewBadge
 *
 * Displays the best matched review for a service — prefers client reviews
 * with an uploaded photo, falls back to Google reviews with a profile photo,
 * then text-only reviews.
 *
 * Layout matches the "Gel Manicure" card design:
 *   ┌────────────────────────────────┐
 *   │ [photo]  Amara B. · 2 days ago │
 *   │          ★★★★★               │
 *   │          "Three weeks in…"     │
 *   └────────────────────────────────┘
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Star, X } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** Format a date as "X days/weeks/months ago" */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

/** Trim comment to fit in 2 lines */
function trimQuote(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export default function ServiceReviewBadge({ serviceId }: { serviceId: string | number }) {
  const { serviceReviews } = useSite();
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);

  const review =
    serviceReviews[serviceId] ??
    serviceReviews[String(serviceId)] ??
    serviceReviews[Number(serviceId)];
  const reviewMediaItems = review?.reviewMediaItems?.filter(
    (item: Record<string, unknown>) => typeof item.thumbnailUrl === 'string' && item.thumbnailUrl,
  ) ?? [];

  useEffect(() => {
    if (selectedMediaIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedMediaIndex(null);
      if (event.key === 'ArrowLeft') {
        setSelectedMediaIndex((current) =>
          current === null ? null : (current - 1 + reviewMediaItems.length) % reviewMediaItems.length,
        );
      }
      if (event.key === 'ArrowRight') {
        setSelectedMediaIndex((current) =>
          current === null ? null : (current + 1) % reviewMediaItems.length,
        );
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedMediaIndex, reviewMediaItems.length]);

  if (!review || !review.comment) return null;

  const displayName = review.customerName
    ? review.customerName.split(' ')[0] + (review.customerName.includes(' ') ? ' ' + review.customerName.split(' ').slice(1).map((w: string) => w[0] + '.').join(' ') : '')
    : 'Verified client';

  const ago = timeAgo(review.createdAt);
  const quote = trimQuote(review.comment);
  const reviewerAvatarUrl: string | null = review.reviewerAvatarUrl ?? null;
  const avatarInitial = (review.customerName ?? 'V').charAt(0).toUpperCase();

  return (
    <div className="mt-4 rounded-2xl bg-taupe-50 p-3 ring-1 ring-taupe-100">
      <div className="flex items-start gap-3">
        {/* Circular reviewer avatar — Google profile pic or initials fallback */}
        {reviewerAvatarUrl ? (
          <img
            src={reviewerAvatarUrl}
            alt={`${displayName}'s profile`}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-1 ring-taupe-200"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = 'none';
              const next = el.nextElementSibling as HTMLElement | null;
              if (next) next.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-600 ring-1 ring-rose-200"
          style={{ display: reviewerAvatarUrl ? 'none' : 'flex' }}
        >
          {avatarInitial}
        </div>

        {/* Right column: name + time, stars, quote */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold text-taupe-900 leading-tight">
              {displayName}
            </span>
            {ago && (
              <span className="text-xs text-taupe-400">· {ago}</span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i < review.rating
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-taupe-200 text-taupe-200'
                }`}
              />
            ))}
          </div>

          <p className="mt-1.5 text-xs leading-snug text-taupe-600 italic">
            "{quote}"
          </p>
        </div>
      </div>

      {reviewMediaItems.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Photos attached to this review">
          {reviewMediaItems.map((item: Record<string, unknown>, index: number) => (
            <button
              key={`${String(item.thumbnailUrl)}-${index}`}
              type="button"
              onClick={() => setSelectedMediaIndex(index)}
              className="group relative aspect-square overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-1"
              aria-label={`View review photo ${index + 1} larger`}
            >
              <img
                src={String(item.thumbnailUrl)}
                alt={typeof item.thumbnailLabel === 'string' ? item.thumbnailLabel : `Review photo ${index + 1}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-taupe-950/0 text-white opacity-0 transition-all group-hover:bg-taupe-950/30 group-hover:opacity-100">
                <Images className="h-5 w-5" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedMediaIndex !== null && reviewMediaItems[selectedMediaIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-taupe-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Google review photo"
          onClick={() => setSelectedMediaIndex(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedMediaIndex(null)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Close review photo"
          >
            <X className="h-6 w-6" />
          </button>

          {reviewMediaItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedMediaIndex((selectedMediaIndex - 1 + reviewMediaItems.length) % reviewMediaItems.length);
                }}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:left-6"
                aria-label="Previous review photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedMediaIndex((selectedMediaIndex + 1) % reviewMediaItems.length);
                }}
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:right-6"
                aria-label="Next review photo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <img
            src={String(reviewMediaItems[selectedMediaIndex].thumbnailUrl)}
            alt={typeof reviewMediaItems[selectedMediaIndex].thumbnailLabel === 'string'
              ? reviewMediaItems[selectedMediaIndex].thumbnailLabel as string
              : 'Larger review photo'}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
