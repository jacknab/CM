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
  /** The salon's about text (its website's own, else the text its account was prepared from). */
  about?: string | null;
  /** "Who can book online": 'all' | 'existing' | 'off' (Nobody). */
  online_booking_mode?: string | null;
  /** The website's opening sentence, written for this salon. */
  hero_text?: string | null;
  /** The hero photo: the salon's cover, else a nail photo picked for it. */
  hero_image?: string | null;
  /** The salon's own cover photo, when it set one. */
  cover_image?: string | null;
  /** The website look the salon chose (logo, accent, Instagram, Facebook): lib/tenant-data.ts. */
  booking_site?: { logoImage?: string | null; instagram?: string | null; facebook?: string | null; coverImage?: string | null } | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
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
  source?: string | null;
  customer_name?: string | null;
  reviewer_photo_url?: string | null;
  rating: number;
  review_text?: string | null;
  review_create_time?: string | null;
  review_image_urls?: string[] | null;
  review_media_items?: Array<Record<string, unknown>> | null;
  owner_reply?: Record<string, unknown> | null;
  /** Legacy aliases retained for existing templates. */
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
  galleryPhotos: GalleryPhotoEntry[];
  /** Keyed by service ID — best AI-matched Google review per service */
  serviceReviews?: Record<string | number, ServiceReviewEntry>;
  /** A website Certxa prepared from public listings (its owner may not have claimed it yet). */
  isCertxaPreparedSite?: boolean;
  /** Prepared and not yet claimed by its owner: no prices, and claimLine says how to claim it. */
  isUnclaimedAutoCreated?: boolean;
  claimLine?: string | null;
  /** Google's own total and average, when the reviews are Google's. */
  googleReviewCount?: number;
  googleAvgRating?: number;
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
