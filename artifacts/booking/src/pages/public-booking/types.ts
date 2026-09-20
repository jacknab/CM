export interface StoreData {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  bookingSlug?: string;
  bookingTheme?: string;
  googleRating?: number | null;
  googleReviewCount?: number;
  /** Rating to actually display — Google's if connected, else Certxa's own
   * native reviews aggregate (both gated at >=3 reviews server-side). Prefer
   * these over googleRating/googleReviewCount directly so themes don't have
   * to reimplement the fallback. */
  displayRating?: number | null;
  displayReviewCount?: number;
  reviewSource?: "google" | "native" | null;
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
}
