import { useEffect, useState } from "react";
import type { StoreData } from "./types";

/**
 * A salon page Certxa prepared that its owner hasn't claimed yet (owner, 2026-11-10; server lib/preparedSalon.ts):
 * a thin line at the top saying so, with Certxa's number for the owner to claim it. Nothing for any other salon.
 */
export function PreparedNotice({ store }: { store: StoreData }) {
  if (!store.unclaimedPrepared || !store.claimLine) return null;
  return (
    <aside className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-center text-[13px] leading-snug text-stone-700" aria-label="About this page" data-testid="prepared-notice">
      {store.claimLine}
    </aside>
  );
}

type GoogleReview = { id: number; customerName: string | null; rating: number; reviewText: string | null; reviewCreateTime: string | null; source?: string };

/**
 * The Google reviews on a page Certxa prepared (owner, 2026-11-11; server lib/preparedReviews.ts), for designs that
 * have no review section of their own (Classic, Simple). Shown as Google's, with each reviewer's name.
 */
export function PreparedGoogleReviews({ store }: { store: StoreData }) {
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  useEffect(() => {
    if (!store.unclaimedPrepared || !store.bookingSlug) return;
    let live = true;
    fetch(`/api/public/store/${encodeURIComponent(store.bookingSlug)}/reviews`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (live && Array.isArray(rows)) setReviews(rows.filter((r: GoogleReview) => r.source === "google" && r.reviewText)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [store.unclaimedPrepared, store.bookingSlug]);
  if (!store.unclaimedPrepared || reviews.length === 0) return null;
  return (
    <section className="mt-8 border-t px-4 pt-6" aria-labelledby="google-reviews-heading" data-testid="prepared-google-reviews">
      <h2 id="google-reviews-heading" className="text-base font-semibold text-gray-900">Reviews from Google</h2>
      <ul className="mt-3 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="text-sm text-gray-700">
            <p className="text-amber-500" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(Math.round(r.rating))}<span className="text-gray-300">{"★".repeat(5 - Math.round(r.rating))}</span></p>
            <p className="mt-1 leading-relaxed">“{r.reviewText}”</p>
            <p className="mt-1 text-xs text-gray-500">{r.customerName ?? "Google user"} · Posted on Google</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
