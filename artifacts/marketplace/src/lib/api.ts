import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';

// Plain, hand-written API client — replaces Haven's Orval-generated
// @workspace/api-client-react. Deliberately plain async functions (not tied
// to React) so the SSR entry point can call them directly for server-side
// prefetching, same as the generated client's underlying functions could.

let apiBaseUrl = '';

/** Server-side only: point fetch() at an absolute origin (relative /api/... paths don't resolve in Node). */
export function setApiBaseUrl(url: string) {
  apiBaseUrl = url;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Salon {
  id: number;
  slug: string;
  name: string;
  category: string;
  city: string;
  state: string;
  neighborhood?: string;
  rating: number;
  reviewCount: number;
  priceLevel: string;
  imageUrl: string;
  tags: string[];
  distance: string;
  isOpen?: boolean;
  featured?: boolean;
  description: string;
  latitude?: number;
  longitude?: number;
}

export interface SalonService {
  id: number;
  name: string;
  durationMinutes: number;
  price: number;
  category?: string;
}

export interface BusinessHour {
  day: string;
  open: string;
  close: string;
}

export interface SalonProfile extends Salon {
  address: string;
  phone: string;
  website?: string;
  hours: BusinessHour[];
  services: SalonService[];
  gallery: string[];
  highlights: string[];
  about?: string;
  /** Present only when this listing is claimed by a real Certxa store — links to the real booking flow. */
  bookingUrl?: string;
}

export interface InquiryInput {
  name: string;
  email: string;
  message: string;
}

export interface Inquiry extends InquiryInput {
  id: number;
  createdAt: string;
}

export interface ListSalonsParams {
  search?: string;
  location?: string;
  service?: string;
  sort?: 'recommended' | 'rating' | 'distance';
  limit?: number;
}

// ── Plain fetch functions — directly callable for SSR prefetch ─────────────

export function listSalons(params: ListSalonsParams = {}): Promise<Salon[]> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.location) q.set('location', params.location);
  if (params.service) q.set('service', params.service);
  if (params.sort) q.set('sort', params.sort);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return apiFetch(`/api/salons${qs ? `?${qs}` : ''}`);
}

export interface FeaturedSalonsParams {
  citySlug?: string;
  stateSlug?: string;
}

export function getFeaturedSalons(params: FeaturedSalonsParams = {}): Promise<Salon[]> {
  const q = new URLSearchParams();
  if (params.citySlug) q.set('citySlug', params.citySlug);
  if (params.stateSlug) q.set('stateSlug', params.stateSlug);
  const qs = q.toString();
  return apiFetch(`/api/salons/featured${qs ? `?${qs}` : ''}`);
}

export interface GeoCity {
  city: string;
  state: string;
  citySlug: string;
  stateSlug: string;
}

export function getGeoCity(): Promise<GeoCity | null> {
  return apiFetch('/api/geo');
}

export function getSalonBySlug(slug: string): Promise<SalonProfile> {
  return apiFetch(`/api/salons/${encodeURIComponent(slug)}`);
}

export function createInquiry(slug: string, data: InquiryInput): Promise<Inquiry> {
  return apiFetch(`/api/salons/${encodeURIComponent(slug)}/inquiries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createBusinessInquiry(data: InquiryInput): Promise<Inquiry> {
  return apiFetch('/api/business-inquiries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface StateListing {
  code: string;
  name: string;
  slug: string;
  count: number;
  cities: Array<{ name: string; slug: string; count: number }>;
}

export interface CityListing {
  stateName: string;
  stateSlug: string;
  cityName: string;
  citySlug: string;
  salons: Salon[];
}

export function getStateListing(stateSlug: string): Promise<StateListing> {
  return apiFetch(`/api/listings/${encodeURIComponent(stateSlug)}`);
}

export function getCityListing(citySlug: string, stateSlug: string): Promise<CityListing> {
  return apiFetch(`/api/listings/${encodeURIComponent(citySlug)}--${encodeURIComponent(stateSlug)}`);
}

// ── React Query hooks + query-key helpers ───────────────────────────────────

type QueryOpt<T> = { query?: Partial<UseQueryOptions<T>> };

export const getListSalonsQueryKey = (params: ListSalonsParams = {}) => ['salons', 'list', params] as const;
export function useListSalons(params: ListSalonsParams = {}, options?: QueryOpt<Salon[]>) {
  return useQuery({ queryKey: getListSalonsQueryKey(params), queryFn: () => listSalons(params), ...options?.query });
}

export const getGetFeaturedSalonsQueryKey = (params: FeaturedSalonsParams = {}) => ['salons', 'featured', params] as const;
export function useGetFeaturedSalons(params: FeaturedSalonsParams = {}, options?: QueryOpt<Salon[]>) {
  return useQuery({ queryKey: getGetFeaturedSalonsQueryKey(params), queryFn: () => getFeaturedSalons(params), ...options?.query });
}

export const getGeoCityQueryKey = () => ['geo', 'city'] as const;
export function useGetGeoCity(options?: QueryOpt<GeoCity | null>) {
  return useQuery({ queryKey: getGeoCityQueryKey(), queryFn: () => getGeoCity(), staleTime: 5 * 60 * 1000, ...options?.query });
}

export const getGetSalonBySlugQueryKey = (slug: string) => ['salons', 'bySlug', slug] as const;
export function useGetSalonBySlug(slug: string, options?: QueryOpt<SalonProfile>) {
  return useQuery({
    queryKey: getGetSalonBySlugQueryKey(slug),
    queryFn: () => getSalonBySlug(slug),
    enabled: !!slug,
    ...options?.query,
  });
}

export const getStateListingQueryKey = (stateSlug: string) => ['listings', 'state', stateSlug] as const;
export function useGetStateListing(stateSlug: string, options?: QueryOpt<StateListing>) {
  return useQuery({
    queryKey: getStateListingQueryKey(stateSlug),
    queryFn: () => getStateListing(stateSlug),
    enabled: !!stateSlug,
    ...options?.query,
  });
}

export const getCityListingQueryKey = (citySlug: string, stateSlug: string) => ['listings', 'city', citySlug, stateSlug] as const;
export function useGetCityListing(citySlug: string, stateSlug: string, options?: QueryOpt<CityListing>) {
  return useQuery({
    queryKey: getCityListingQueryKey(citySlug, stateSlug),
    queryFn: () => getCityListing(citySlug, stateSlug),
    enabled: !!citySlug && !!stateSlug,
    ...options?.query,
  });
}

export function useCreateInquiry() {
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: InquiryInput }) => createInquiry(slug, data),
  });
}

export function useCreateBusinessInquiry() {
  return useMutation({ mutationFn: (data: InquiryInput) => createBusinessInquiry(data) });
}
