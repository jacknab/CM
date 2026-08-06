declare global {
  interface Window {
    __CERTXA_SLUG__?: string;
    __CERTXA_API_BASE__?: string;
  }
}

export const SLUG = (typeof window !== 'undefined' && window.__CERTXA_SLUG__) || null;
export const API_BASE = (typeof window !== 'undefined' && window.__CERTXA_API_BASE__) || '';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const fmtTime = (t?: string): string => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const fmtPhone = (p?: string): string => {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return p;
};

export const fmtPrice = (p?: string | number): string => {
  if (p == null) return '';
  const n = parseFloat(String(p));
  return isNaN(n) ? String(p) : `$${n % 1 === 0 ? n : n.toFixed(2)}`;
};

export interface HourEntry {
  day_of_week: number;
  open_time?: string;
  close_time?: string;
  is_closed?: boolean;
}

export interface HourGroup {
  label: string;
  hours: string;
  is_closed: boolean;
}

export function groupHours(hours: HourEntry[]): HourGroup[] {
  if (!hours || hours.length === 0) return [];
  const sorted = [...hours].sort((a, b) => a.day_of_week - b.day_of_week);
  const groups: HourGroup[] = [];
  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    const isClosed = !!cur.is_closed;
    const openStr = cur.open_time || '';
    const closeStr = cur.close_time || '';
    let j = i + 1;
    while (
      j < sorted.length &&
      !!sorted[j].is_closed === isClosed &&
      (isClosed || (sorted[j].open_time === openStr && sorted[j].close_time === closeStr)) &&
      sorted[j].day_of_week === sorted[j - 1].day_of_week + 1
    ) {
      j++;
    }
    const label =
      j - i === 1
        ? DAYS[cur.day_of_week]
        : `${DAYS[cur.day_of_week].slice(0, 3)}–${DAYS[sorted[j - 1].day_of_week].slice(0, 3)}`;
    const hoursStr = isClosed ? 'Closed' : `${fmtTime(openStr)} – ${fmtTime(closeStr)}`;
    groups.push({ label, hours: hoursStr, is_closed: isClosed });
    i = j;
  }
  return groups;
}

export interface Business {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  booking_slug?: string | null;
}

export interface Service {
  id?: number;
  name: string;
  price?: string | number;
  duration?: number;
  category_id?: number;
}

export interface ServiceCategory {
  id: number;
  name: string;
}

export interface StaffMember {
  id?: number;
  name: string;
  role?: string;
  avatar_url?: string | null;
  bio?: string;
}

export interface Review {
  customer_name?: string;
  rating?: number;
  comment?: string;
  created_at?: string | null;
}

export interface SiteData {
  business: Business;
  hours: HourEntry[];
  services: Service[];
  serviceCategories: ServiceCategory[];
  staff: StaffMember[];
  reviews: Review[];
}

export const PLACEHOLDER: SiteData = {
  business: {
    name: 'Lumière Nail Studio',
    address: '142 Meridian Boulevard',
    phone: '3105559012',
    email: 'hello@lumierebeauty.com',
    city: 'Beverly Hills',
    state: 'CA',
    booking_slug: null,
  },
  hours: [
    { day_of_week: 0, open_time: '10:00', close_time: '18:00', is_closed: false },
    { day_of_week: 1, open_time: '09:00', close_time: '19:00', is_closed: false },
    { day_of_week: 2, open_time: '09:00', close_time: '19:00', is_closed: false },
    { day_of_week: 3, open_time: '09:00', close_time: '19:00', is_closed: false },
    { day_of_week: 4, open_time: '09:00', close_time: '20:00', is_closed: false },
    { day_of_week: 5, open_time: '09:00', close_time: '20:00', is_closed: false },
    { day_of_week: 6, open_time: '10:00', close_time: '18:00', is_closed: false },
  ],
  services: [
    { id: 1, name: 'Signature Manicure', price: '65', duration: 60, category_id: 1 },
    { id: 2, name: 'Luxury Gel Set', price: '95', duration: 90, category_id: 1 },
    { id: 3, name: 'Bespoke Nail Art', price: '120', duration: 75, category_id: 1 },
    { id: 4, name: 'Royal Pedicure', price: '85', duration: 75, category_id: 2 },
    { id: 5, name: 'Spa Pedicure Deluxe', price: '110', duration: 90, category_id: 2 },
    { id: 6, name: 'Full Set Acrylics', price: '130', duration: 120, category_id: 1 },
  ],
  serviceCategories: [
    { id: 1, name: 'Manicure' },
    { id: 2, name: 'Pedicure' },
  ],
  staff: [
    { id: 1, name: 'Celeste Morel', role: 'Creative Director', bio: 'A decade of artistry across Paris and New York, Celeste brings a refined editorial eye to every set.' },
    { id: 2, name: 'Sasha Yuen', role: 'Senior Nail Artist', bio: 'Precision and imagination in equal measure. Sasha specializes in architectural shapes and textured designs.' },
    { id: 3, name: 'Mia Laurent', role: 'Wellness Specialist', bio: 'Blending restorative technique with contemporary beauty, Mia transforms every pedicure into a ritual.' },
  ],
  reviews: [
    { customer_name: 'Victoria H.', rating: 5, comment: 'An extraordinary experience from start to finish. The attention to detail is unmatched anywhere in the city.' },
    { customer_name: 'Isabelle P.', rating: 5, comment: 'I have never felt so pampered. The team is incredibly talented and the ambiance is absolutely stunning.' },
    { customer_name: 'Nadia S.', rating: 5, comment: 'Worth every penny. My nails have never looked this beautiful. I will not go anywhere else.' },
  ],
};

import { useState, useEffect } from 'react';

export function useSiteData(): SiteData {
  const [data, setData] = useState<SiteData>(PLACEHOLDER);
  useEffect(() => {
    if (!SLUG) return;
    fetch(`${API_BASE}/api/tenant/${SLUG}/data`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SiteData | null) => {
        if (d?.business) setData(d);
      })
      .catch(() => {});
  }, []);
  return data;
}
