export interface StoreData {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  bookingSlug?: string;
  bookingTheme?: string;
  /** 'manual': the business reviews each booking first, so a booking is sent as a request. */
  bookingApproval?: string | null;
  /** The page's look beyond the theme (set in the Certxa Pro app's website setup). */
  bookingSite?: BookingSiteLook | null;
  city?: string | null;
  category?: string | null;
  /** A Solo pro's label: "Nails by Toby" (server: lib/proCraft.ts). */
  byLabel?: string | null;
  state?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number;
  /** Rating to actually display — Google's if connected, else Certxa's own
   * native reviews aggregate (both gated at >=3 reviews server-side). Prefer
   * these over googleRating/googleReviewCount directly so themes don't have
   * to reimplement the fallback. */
  displayRating?: number | null;
  displayReviewCount?: number;
  reviewSource?: "google" | "native" | null;
  /** The business's Google reviews, named as Google's on the website (null: none shown, or a Solo business). */
  googleReviews?: { rating: number; count: number } | null;
  /** false: the business switched its booking system off; the website stays, its booking controls don't. */
  bookingSystem?: boolean;
  /** Online booking settings › Who can book online: 'all' | 'existing' | 'off' (Nobody). */
  onlineBookingMode?: string | null;
  /** The hours an independent pro set as available for services: what can really be booked. Null when not set. */
  serviceHours?: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean; blocks?: { open: string; close: string }[] }[] | null;
  businessHours?: {
    id: number;
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
}

export interface ServiceOptionData {
  id: number;
  serviceId: number;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string;
  isDefault: boolean;
  displayOrder: number;
  isActive: boolean;
}

export interface ServiceData {
  id: number;
  name: string;
  description?: string;
  duration: number;
  price: string;
  category: string;
  categoryId?: number;
  imageUrl?: string | null;
  depositRequired?: boolean;
  depositAmount?: string | null;
  /** Solo house calls: done at the professional's place, at the client's, or either. */
  offeredAt?: string | null;
  options: ServiceOptionData[];
}

export interface CategoryData {
  id: number;
  name: string;
  storeId: number;
}

export interface AddonData {
  id: number;
  name: string;
  description?: string;
  price: string;
  duration: number;
  storeId: number;
  allowQuantity?: boolean;
  maxQuantity?: number;
}

export interface ServiceAddonData {
  id: number;
  serviceId: number;
  addonId: number;
}

export interface TimeSlot {
  id: string;
  time: string;
  staffId: number;
  staffName: string;
  /** Two services that no one technician performs both of: who takes the second, straight after the first. */
  extraStaffId?: number;
  extraStaffName?: string;
}

export interface BookingSiteLook {
  accent?: string;
  /** The pro's own photo, on the Solo website's About tab. */
  aboutImage?: string;
  coverImage?: string;
  logoImage?: string;
  about?: string;
  instagram?: string;
  facebook?: string;
}
