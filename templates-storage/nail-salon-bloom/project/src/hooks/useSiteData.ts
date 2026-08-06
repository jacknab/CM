import { useState, useEffect } from 'react';

declare global {
  interface Window {
    __CERTXA_SLUG__?: string;
    __CERTXA_API_BASE__?: string;
  }
}

export interface BusinessData {
  id?: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  postcode?: string;
  booking_slug?: string;
  category?: string;
}

export interface HoursEntry {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface ServiceEntry {
  id: number;
  name: string;
  price: string | number;
  duration?: number;
  category_id?: number;
  description?: string;
  image_url?: string;
}

export interface CategoryEntry {
  id: number;
  name: string;
}

export interface StaffEntry {
  id: number;
  name: string;
  role?: string;
  avatar_url?: string;
  bio?: string;
}

export interface ReviewEntry {
  customer_name?: string | null;
  reviewer_photo_url?: string | null;
  rating: number;
  review_text?: string | null;
  review_create_time?: string | null;
  review_image_urls?: string[] | null;
  review_media_items?: Array<Record<string, unknown>> | null;
  owner_reply?: Record<string, unknown> | null;
  /** Legacy aliases */
  comment?: string | null;
  created_at?: string | null;
}

export interface GalleryPhotoEntry {
  image_url: string;
  caption?: string | null;
}

export interface ServiceReviewEntry {
  serviceId: number;
  customerName: string | null;
  rating: number;
  comment: string;
  createdAt: string | null;
  photoUrl: string | null;
  reviewerAvatarUrl?: string | null;
  reviewMediaItems?: Array<Record<string, unknown>>;
  ownerReply?: Record<string, unknown> | null;
}

export interface SiteData {
  website: { id: number; name: string; slug: string };
  business: BusinessData | null;
  hours: HoursEntry[];
  services: ServiceEntry[];
  serviceCategories: CategoryEntry[];
  staff: StaffEntry[];
  reviews: ReviewEntry[];
  /** Total Google review count across ALL ratings (the real GBP number) */
  googleReviewCount?: number;
  /** Aggregate average rating across all Google reviews */
  googleAvgRating?: number;
  galleryPhotos: GalleryPhotoEntry[];
  /** Keyed by service ID — best AI-matched Google review per service */
  serviceReviews?: Record<string | number, ServiceReviewEntry>;
}

export function useSiteData() {
  const [data, setData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const slug = window.__CERTXA_SLUG__;
    if (!slug) {
      setLoading(false);
      return;
    }
    const base = window.__CERTXA_API_BASE__ ?? '';
    fetch(`${base}/api/tenant/${slug}/data`)
      .then(async (r) => {
        if (r.status === 403 || r.status === 503) {
          setBlocked(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) setData(d as SiteData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, blocked };
}
