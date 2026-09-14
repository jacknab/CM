import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetFeaturedSalonsQueryKey,
  getGetSalonBySlugQueryKey,
  getGeoCityQueryKey,
  getListSalonsQueryKey,
  getStateListingQueryKey,
  getCityListingQueryKey,
  useCreateBusinessInquiry,
  useCreateInquiry,
  useGetFeaturedSalons,
  useGetGeoCity,
  useGetSalonBySlug,
  useGetStateListing,
  useGetCityListing,
  useListSalons,
} from '@/lib/api';
import type { Salon, SalonProfile } from '@/lib/api';
import { ArrowRight, ArrowUpDown, ArrowUpRight, BadgeCheck, CalendarDays, Check, ChevronDown, Clock3, Heart, LocateFixed, MapPin, Menu, MessageCircle, Minus, Navigation, Plus, Search, SlidersHorizontal, Sparkles, Star, Store, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import type { SsrContext } from 'wouter';

const categories = ['Hair', 'Nails', 'Skin', 'Barber', 'Wellness'];
const browseCategories = ['Haircut & style', 'Hair color', 'Barber', 'Spa', 'Nails', 'Yoga', 'Med spa', 'Massage', 'Pilates'];
const fallbackImages = [
  'linear-gradient(135deg,#e6a688 0%,#c9614a 42%,#3d2233 100%)',
  'linear-gradient(135deg,#e8c78f 0%,#d97a5f 45%,#3d2233 100%)',
  'linear-gradient(135deg,#f0d9ab 0%,#c9614a 48%,#4d7a6c 100%)',
  'linear-gradient(135deg,#e0a5a0 0%,#a05a4d 48%,#3d2233 100%)',
];

function useSavedSalons() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem('certxa-saved') || '[]')); } catch { setSaved([]); }
  }, []);
  const toggle = (slug: string) => setSaved((current) => {
    const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
    localStorage.setItem('certxa-saved', JSON.stringify(next));
    return next;
  });
  return { saved, toggle };
}

function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-wordmark font-bold tracking-[-.02em] ${className}`}>Certxa<span className="text-accent">.</span></span>;
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background" data-testid="header-site">
      <div className="mx-auto flex h-[68px] max-w-[1320px] items-center gap-5 px-5 lg:px-10">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2 focus-ring" data-testid="link-logo"><Wordmark className="text-[26px] leading-none text-foreground" /><span className="hidden font-mono text-[9px] uppercase tracking-[.2em] text-muted-foreground sm:inline">salon marketplace</span></Link>
        <nav className="ml-auto hidden items-center gap-6 text-[13px] font-semibold md:flex" data-testid="nav-primary"><Link href="/search" className="text-muted-foreground transition hover:text-primary focus-ring" data-testid="link-discover">Discover</Link><Link href="/saved" className="text-muted-foreground transition hover:text-primary focus-ring" data-testid="link-saved">Saved</Link><Link href="/for-business" className="rounded-[3px] bg-primary px-4 py-2.5 text-primary-foreground transition hover:bg-primary/90 focus-ring" data-testid="link-business">For salons</Link></nav>
        <button onClick={() => setMenuOpen(!menuOpen)} className="ml-auto rounded-full p-2 text-primary md:hidden" aria-label="Toggle menu" data-testid="button-mobile-menu">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {menuOpen && <div className="border-t border-border bg-background px-5 py-5 md:hidden" data-testid="menu-mobile"><div className="grid gap-3 text-lg"><Link href="/search" onClick={() => setMenuOpen(false)} data-testid="link-mobile-discover">Discover salons</Link><Link href="/saved" onClick={() => setMenuOpen(false)} data-testid="link-mobile-saved">Saved salons</Link><Link href="/for-business" onClick={() => setMenuOpen(false)} data-testid="link-mobile-business">For salon owners</Link></div></div>}
    </header>
  );
}

function Footer() {
  return <footer className="mt-24 bg-primary text-primary-foreground" data-testid="footer-site"><div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-10"><div><Wordmark className="text-5xl leading-none" /><p className="mt-4 max-w-xs text-sm leading-6 text-primary-foreground/65">Find and book independent salons and spas, powered by Certxa.</p></div><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">Explore</p><div className="mt-4 grid gap-3 text-sm"><Link href="/search" className="hover:text-accent" data-testid="footer-link-search">Find a salon</Link><Link href="/saved" className="hover:text-accent" data-testid="footer-link-saved">Your saved list</Link></div></div><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">For owners</p><div className="mt-4 grid gap-3 text-sm"><Link href="/for-business" className="hover:text-accent" data-testid="footer-link-business">List your salon</Link><a href="mailto:hello@certxa.com" className="hover:text-accent" data-testid="footer-link-contact">Say hello</a></div></div><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">A small note</p><p className="mt-4 text-sm leading-6 text-primary-foreground/65">Independent places, considered carefully. No endless scrolling required.</p></div></div><div className="mx-auto flex max-w-[1320px] justify-between border-t border-primary-foreground/15 px-5 py-5 font-mono text-[10px] uppercase tracking-[.15em] text-primary-foreground/45 lg:px-10"><span>© 2026 Certxa</span><span>Made for good hair days</span></div></footer>;
}

function setMeta(name: string, content: string, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    if (property) element.setAttribute('property', name);
    else element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.content = content;
}

// Client-side safety net only — the SSR entry computes and inlines the real
// title/meta/canonical for crawlers before this ever runs. This just keeps
// tags in sync on client-side navigations between pages after hydration.
const KNOWN_SEO_MANAGED_PATHS = new Set(['/', '/search', '/saved', '/for-business']);

function SeoManager() {
  const [location] = useLocation();
  useEffect(() => {
    const cleanPath = location.split('?')[0];
    const isListings = cleanPath.startsWith('/listings/');
    // Profile pages (any other single-segment path) set their own accurate
    // title/description/JSON-LD from real salon data (see ProfilePage below,
    // and the SSR entry for the pre-hydration version) — this generic,
    // slug-derived guess would otherwise overwrite that correct SSR title
    // with something worse the instant the page hydrates.
    if (!KNOWN_SEO_MANAGED_PATHS.has(cleanPath) && !isListings) return;
    const isHome = cleanPath === '/';
    const isSearch = cleanPath === '/search';
    const isBusiness = cleanPath === '/for-business';
    const title = isHome
      ? 'Certxa — Find your good place'
      : isSearch
        ? 'Find independent salons near you — Certxa'
        : isBusiness
          ? 'List your salon on Certxa'
          : isListings
            ? 'Nail salons — Certxa'
            : 'Certxa — Independent beauty, found locally';
    const description = isHome
      ? 'Certxa is a considered local guide to independent salons, studios, and beauty people worth knowing.'
      : isSearch
        ? 'Search independent hair salons, nail studios, skin clinics, and beauty professionals by service and neighborhood.'
        : isBusiness
          ? 'Give your independent salon a beautiful public profile and get discovered by clients who care where they book.'
          : 'Discover a local beauty business, see the services and details, and get in touch with confidence.';
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${cleanPath}`;
  }, [location]);
  return null;
}

function ImageBlock({ salon, className = '' }: { salon: Partial<Salon>; className?: string }) {
  return <div className={`relative overflow-hidden ${className}`} style={{ background: fallbackImages[(salon.id || 0) % fallbackImages.length] }} data-testid={`image-salon-${salon.slug || salon.id || 'unknown'}`}>{(salon as Salon).imageUrl && <img src={(salon as Salon).imageUrl} alt={`${salon.name || 'Salon'} interior`} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />}</div>;
}

function SalonCard({ salon, saved, toggle }: { salon: Salon; saved: boolean; toggle: (slug: string) => void }) {
  return <article className="group relative" data-testid={`card-salon-${salon.id}`}><Link href={`/${salon.slug}`} className="block focus-ring" data-testid={`link-salon-${salon.id}`}><div className="relative aspect-[1.18/1] overflow-hidden rounded-[3px]"><ImageBlock salon={salon} className="h-full w-full" />{salon.featured && <span className="absolute left-4 top-4 z-10 rounded-full bg-background/90 px-3 py-1 font-mono text-[9px] uppercase tracking-[.16em] text-primary">Certxa pick</span>}<span className="absolute bottom-4 left-4 z-10 rounded-full bg-primary/90 px-3 py-1 text-xs text-primary-foreground">{salon.isOpen ? 'Open now' : 'By appointment'}</span></div><div className="pt-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-[19px] font-semibold tracking-[-.025em] text-primary">{salon.name}</h3><p className="mt-1 text-sm text-muted-foreground">{salon.category} · {salon.neighborhood || salon.city}</p></div><span className="flex items-center gap-1 pt-1 text-sm text-primary"><Star size={13} fill="currentColor" /> {salon.rating?.toFixed(1)}</span></div><div className="mt-3 flex flex-wrap gap-2">{salon.tags?.slice(0, 2).map((tag) => <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">{tag}</span>)}</div></div></Link><button onClick={() => toggle(salon.slug)} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-primary transition hover:scale-105" aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-${salon.id}`}><Heart size={16} fill={saved ? 'currentColor' : 'none'} className={saved ? 'text-accent' : ''} /></button></article>;
}

function ErrorState({ onRetry, label = 'We could not load this just now.' }: { onRetry?: () => void; label?: string }) {
  return <div className="rounded-[3px] border border-border bg-card px-6 py-12 text-center" data-testid="state-error"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/20 text-primary"><Sparkles size={19} /></div><h3 className="mt-4 font-display text-3xl text-primary">A little pause.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{label}</p>{onRetry && <button onClick={onRetry} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="button-retry">Try again</button>}</div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="rounded-[3px] border border-dashed border-border bg-card px-6 py-16 text-center" data-testid="state-empty"><div className="mx-auto h-1 w-12 bg-accent" /><h3 className="mt-5 font-display text-3xl text-primary">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p></div>;
}

function FeaturedMarketplaceCard({ salon, saved, toggle }: { salon: Salon; saved: boolean; toggle: (slug: string) => void }) {
  return <article className="group relative" data-testid={`card-featured-${salon.id}`}><Link href={`/${salon.slug}`} className="block focus-ring"><div className="relative aspect-[1.4/1] overflow-hidden rounded-[7px] border border-border bg-secondary"><ImageBlock salon={salon} className="h-full w-full" /><span className="absolute bottom-3 left-3 rounded-[3px] bg-background/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-primary">Certxa pick</span></div><div className="mt-2 flex items-start justify-between gap-3"><div><h3 className="text-[14px] font-bold text-primary">{salon.name}</h3><p className="mt-0.5 text-[12px] text-muted-foreground">{salon.city}, {salon.state} · {salon.distance}</p></div><span className="flex items-center gap-1 text-[12px] font-semibold text-primary"><Star size={12} fill="currentColor" className="text-accent" /> {salon.rating.toFixed(1)}</span></div></Link><button onClick={() => toggle(salon.slug)} className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-background/95 text-primary transition hover:scale-105" aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-featured-${salon.id}`}><Heart size={14} fill={saved ? 'currentColor' : 'none'} className={saved ? 'text-primary' : ''} /></button></article>;
}

function SalonSkeletons({ count = 3 }: { count?: number }) {
  return <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" data-testid="state-loading">{Array.from({ length: count }).map((_, i) => <div key={i}><div className="skeleton aspect-[1.18/1] rounded-[3px]" /><div className="skeleton mt-4 h-5 w-2/3 rounded" /><div className="skeleton mt-2 h-4 w-1/2 rounded" /></div>)}</div>;
}

function Home() {
  const { data: geo } = useGetGeoCity({ query: { queryKey: getGeoCityQueryKey() } });
  const featuredParams = useMemo(() => (geo ? { citySlug: geo.citySlug, stateSlug: geo.stateSlug } : {}), [geo]);
  const { data, isLoading, isError, refetch } = useGetFeaturedSalons(featuredParams, { query: { queryKey: getGetFeaturedSalonsQueryKey(featuredParams) } });
  const { saved, toggle } = useSavedSalons();
  const [businessQuery, setBusinessQuery] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [timeQuery, setTimeQuery] = useState('Anytime');
  const [, setLocation] = useLocation();
  const submit = (event: FormEvent) => { event.preventDefault(); setLocation(`/search?search=${encodeURIComponent(businessQuery)}&service=${encodeURIComponent(serviceQuery)}`); };
  const salons = data || [];
  const heroImage = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1600&q=85';
  return <div className="page-in bg-background"><section className="relative min-h-[445px] overflow-hidden bg-primary bg-cover bg-center" style={{ backgroundImage: `linear-gradient(90deg, rgba(61,34,51,.86), rgba(61,34,51,.5)), url(${salons[0]?.imageUrl || heroImage})` }}><div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_25%,rgba(240,195,107,.3),transparent_28%)]" /><div className="relative mx-auto flex min-h-[445px] max-w-[1120px] flex-col justify-center px-5 py-16 text-white lg:px-10"><p className="font-mono text-[10px] uppercase tracking-[.24em] text-accent">Independent beauty, found locally</p><h1 className="mt-5 font-display text-[clamp(3.5rem,7vw,6.5rem)] leading-[.86] tracking-[-.055em]">Book your next<br /><em>good day.</em></h1><form onSubmit={submit} className="mt-9 grid max-w-[920px] gap-1 rounded-[4px] bg-white p-1 text-primary shadow-2xl md:grid-cols-[1fr_1fr_170px_105px]" data-testid="form-hero-search"><label className="relative flex h-12 items-center border-b border-border md:border-b-0 md:border-r"><Search size={16} className="ml-4 text-muted-foreground" /><input value={businessQuery} onChange={(e) => setBusinessQuery(e.target.value)} placeholder="Business name or location" className="h-full w-full bg-transparent px-3 text-sm outline-none" data-testid="input-hero-business" /></label><label className="relative flex h-12 items-center border-b border-border md:border-b-0 md:border-r"><Search size={16} className="ml-4 text-muted-foreground" /><input value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} placeholder="Search services and classes" className="h-full w-full bg-transparent px-3 text-sm outline-none" data-testid="input-hero-service" /></label><label className="relative flex h-12 items-center border-b border-border md:border-b-0 md:border-r"><select value={timeQuery} onChange={(e) => setTimeQuery(e.target.value)} className="h-full w-full appearance-none bg-transparent px-4 text-sm outline-none" data-testid="select-hero-time"><option>Anytime</option><option>Today</option><option>This week</option><option>This weekend</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 text-muted-foreground" /></label><button className="h-12 rounded-[3px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90" data-testid="button-hero-search">Search</button></form><div className="mt-5 flex max-w-[920px] gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">{browseCategories.map((category) => <Link href={`/search?service=${encodeURIComponent(category)}`} key={category} className="shrink-0 rounded-full border border-white/50 bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white hover:text-primary" data-testid={`link-hero-category-${category.toLowerCase().replace(/\s+/g, '-')}`}>{category}</Link>)}</div></div></section><main className="mx-auto max-w-[1320px] px-5 pb-20 lg:px-10"><section className="border-t border-border py-10"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold tracking-[-.03em] text-primary">{geo ? `Featured in ${geo.city}, ${geo.state}` : 'Featured salons'}</h2><Link href="/search" className="flex items-center gap-1 text-sm font-semibold text-primary" data-testid="link-featured-see-all">See all <ArrowRight size={14} /></Link></div><div className="mt-6">{isLoading ? <SalonSkeletons count={4} /> : isError ? <ErrorState onRetry={() => refetch()} /> : salons.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-4 md:gap-x-6">{salons.map((salon) => <FeaturedMarketplaceCard key={salon.id} salon={salon} saved={saved.includes(salon.slug)} toggle={toggle} />)}</div> : <EmptyState title="The list is taking shape." copy="Check back soon for new independent places in your city." />}</div></section><section className="border-t border-border py-10"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold tracking-[-.03em] text-primary">Browse by ritual</h2><Link href="/search" className="flex items-center gap-1 text-sm font-semibold text-primary" data-testid="link-browse-all">All services <ArrowRight size={14} /></Link></div><div className="mt-5 grid grid-cols-2 gap-x-5 md:grid-cols-5">{categories.map((category) => <Link href={`/search?service=${category}`} key={category} className="flex items-center justify-between border-b border-border py-4 text-sm font-semibold text-primary transition hover:text-primary/80" data-testid={`link-category-${category.toLowerCase()}`}><span>{category}</span><ArrowUpRight size={14} className="text-muted-foreground" /></Link>)}</div></section></main></div>;
}

type SearchSort = 'recommended' | 'rating' | 'distance';

function safeSearchSort(value: string | null): SearchSort {
  return value === 'rating' || value === 'distance' ? value : 'recommended';
}

function resultDistance(salon: Salon) {
  if (salon.distance) return String(salon.distance).includes('mi') ? String(salon.distance) : `${salon.distance} mi`;
  return salon.city || 'Nearby';
}

function resultReviews(salon: Salon) {
  return salon.reviewCount ? `(${salon.reviewCount})` : '';
}

function resultInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function SearchResultCard({ salon, selected, saved, toggle, onSelect }: { salon: Salon; selected: boolean; saved: boolean; toggle: (slug: string) => void; onSelect: () => void }) {
  return <article className={`group relative border-b border-border/80 transition ${selected ? 'bg-secondary/65' : 'hover:bg-card'}`} data-testid={`card-search-result-${salon.id}`}>
    <Link href={`/${salon.slug}`} onClick={onSelect} className="block p-4 pr-16 focus-ring sm:p-5 sm:pr-16">
      <div className="flex gap-4">
        <div className="relative h-[108px] w-[108px] shrink-0 overflow-hidden rounded-[4px] sm:h-[124px] sm:w-[124px]">
          <ImageBlock salon={salon} className="h-full w-full" />
          <span className="absolute bottom-2 left-2 rounded-[3px] bg-primary/75 px-2 py-1 font-mono text-[9px] tracking-[.14em] text-primary-foreground">{resultInitials(salon.name)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold tracking-[-.02em] text-primary">{salon.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">{salon.neighborhood || salon.city}<span className="text-border">·</span>{resultDistance(salon)}</p>
            </div>
            {salon.featured && <BadgeCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-label="Certxa pick" />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 font-bold text-primary"><Star size={12} fill="currentColor" className="text-accent" />{salon.rating?.toFixed(1)} <span className="font-normal text-muted-foreground">{resultReviews(salon)}</span></span>
            {salon.priceLevel && <span className="rounded-[3px] bg-accent/25 px-1.5 py-0.5 font-mono text-[10px] text-primary">{salon.priceLevel}</span>}
            {salon.category && <span className="text-muted-foreground">{salon.category}</span>}
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] leading-[1.45] text-muted-foreground">{salon.description || 'A thoughtful local place with a point of view.'}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`flex min-w-0 items-center gap-1.5 text-[10px] font-bold ${salon.isOpen ? 'text-[#2d6843]' : 'text-muted-foreground'}`}><Clock3 size={12} /><span className="truncate">{salon.isOpen ? 'Open now' : 'By appointment'}</span></span>
            {salon.tags?.[0] && <span className="max-w-[125px] truncate text-[10px] text-muted-foreground">{salon.tags[0]}</span>}
          </div>
        </div>
      </div>
    </Link>
    <button type="button" onClick={() => toggle(salon.slug)} className={`absolute right-4 top-5 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 transition hover:scale-105 focus-ring ${saved ? 'text-accent' : 'text-muted-foreground'}`} aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-search-${salon.id}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
  </article>;
}

function SearchMap({ results, selectedId, setSelectedId }: { results: Salon[]; selectedId: string | null; setSelectedId: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const selected = results.find((salon) => String(salon.id) === selectedId);
  const hasRealCoords = results.some((s) => s.latitude != null && s.longitude != null);
  const bounds = useMemo(() => {
    const coords = results.filter((s) => s.latitude != null && s.longitude != null);
    if (!coords.length) return null;
    const lats = coords.map((s) => s.latitude!);
    const lngs = coords.map((s) => s.longitude!);
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  }, [results]);
  // Real lat/lng when available (proportionally placed within the salons'
  // own bounding box), falling back to a deterministic hash-based scatter
  // only when a listing genuinely has no coordinates.
  const mapPoint = (salon: Salon, index: number) => {
    if (salon.latitude != null && salon.longitude != null && bounds) {
      const latSpan = bounds.maxLat - bounds.minLat || 1;
      const lngSpan = bounds.maxLng - bounds.minLng || 1;
      const top = 12 + (1 - (salon.latitude - bounds.minLat) / latSpan) * 76;
      const left = 12 + ((salon.longitude - bounds.minLng) / lngSpan) * 76;
      return { top, left };
    }
    const seed = String(salon.id || salon.slug).split('').reduce((total, character) => total + character.charCodeAt(0), index * 17);
    return { top: 22 + (seed % 57), left: 16 + ((seed * 7) % 68) };
  };
  return <section className="relative min-h-[470px] flex-1 overflow-hidden border-l border-border bg-[#e8e2d5] md:min-h-0" aria-label="Map of nearby salons" data-testid="panel-search-map">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-[-8%] transition-transform duration-500" style={{ transform: `scale(${zoom})` }}>
        <div className="search-map-grid absolute inset-0 opacity-80" />
        {!hasRealCoords && <>
          <div className="search-map-water left-[-12%] top-[32%] h-[58%] w-[46%] rotate-[18deg] rounded-[48%]" />
          <div className="search-map-water right-[-16%] top-[-12%] h-[42%] w-[44%] rotate-[-22deg] rounded-[48%]" />
          <div className="search-map-road left-[-4%] top-[28%] w-[120%] rotate-[28deg]" />
          <div className="search-map-road left-[-10%] top-[68%] w-[118%] rotate-[-14deg]" />
          <div className="search-map-road left-[50%] top-[-3%] w-[115%] rotate-[78deg]" />
        </>}
        {results.map((salon, index) => {
          const point = mapPoint(salon, index);
          const isSelected = String(salon.id) === selectedId;
          return <button key={salon.id} type="button" onClick={() => setSelectedId(String(salon.id))} className={`search-pin-pop absolute z-10 -translate-x-1/2 -translate-y-full transition hover:z-20 hover:scale-110 ${isSelected ? 'z-20 scale-[1.16]' : ''}`} style={{ top: `${point.top}%`, left: `${point.left}%`, animationDelay: `${index * 55}ms` }} aria-label={`Show ${salon.name} on map`} data-testid={`pin-search-${salon.id}`}>
            <span className={`relative flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-card shadow-md ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/80 text-white'}`}><MapPin size={17} fill="currentColor" strokeWidth={1.5} /></span>
            <span className={`absolute left-1/2 top-[30px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 ${isSelected ? 'bg-primary' : 'bg-primary/80'}`} />
          </button>;
        })}
      </div>
    </div>
    <div className="absolute right-5 top-5 z-20 flex flex-col overflow-hidden rounded-[4px] border border-card/80 bg-card/90 shadow-md backdrop-blur-sm">
      <button type="button" onClick={() => setZoom((value) => Math.min(1.25, value + .1))} aria-label="Zoom in map" className="p-2.5 text-primary transition hover:bg-secondary" data-testid="button-search-map-zoom-in"><Plus size={16} /></button>
      <div className="h-px bg-border" />
      <button type="button" onClick={() => setZoom((value) => Math.max(.9, value - .1))} aria-label="Zoom out map" className="p-2.5 text-primary transition hover:bg-secondary" data-testid="button-search-map-zoom-out"><Minus size={16} /></button>
    </div>
    <button type="button" onClick={() => setZoom(1)} aria-label="Center map" className="absolute bottom-5 right-5 z-20 rounded-[4px] border border-card/80 bg-card/90 p-3 text-primary shadow-md backdrop-blur-sm transition hover:bg-card" data-testid="button-search-map-center"><LocateFixed size={17} /></button>
    <div className="absolute bottom-5 left-5 z-20 hidden items-center gap-2 rounded-[4px] border border-card/80 bg-card/85 px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground shadow-sm backdrop-blur-sm sm:flex"><span className="h-2 w-2 rounded-full bg-accent" /> {results.length} {results.length === 1 ? 'place' : 'places'} nearby</div>
    {selected && <div className="absolute bottom-5 left-1/2 z-30 hidden w-[270px] -translate-x-1/2 rounded-[4px] border border-border bg-card p-4 shadow-lg sm:block" data-testid={`map-selected-${selected.id}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-bold text-primary">{selected.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{selected.neighborhood || selected.city} · {resultDistance(selected)}</p></div><span className="flex items-center gap-1 text-xs font-bold text-primary"><Star size={12} fill="currentColor" className="text-accent" /> {selected.rating?.toFixed(1)}</span></div>
      <Link href={`/${selected.slug}`} className="mt-3 flex w-full items-center justify-center gap-1 rounded-[3px] bg-secondary py-2 text-[11px] font-bold text-primary transition hover:bg-accent/30" data-testid={`link-map-details-${selected.id}`}>View details <Navigation size={12} /></Link>
    </div>}
  </section>;
}

function SearchLoading() {
  return <div className="grid min-h-[600px] md:grid-cols-[minmax(360px,440px)_1fr]" data-testid="state-search-loading"><div className="border-r border-border p-5"><div className="skeleton h-5 w-44 rounded" /><div className="skeleton mt-3 h-3 w-24 rounded" />{Array.from({ length: 4 }).map((_, index) => <div key={index} className="mt-5 flex gap-4 border-b border-border pb-5"><div className="skeleton h-28 w-28 shrink-0 rounded-[4px]" /><div className="flex-1"><div className="skeleton h-4 w-4/5 rounded" /><div className="skeleton mt-3 h-3 w-1/2 rounded" /><div className="skeleton mt-4 h-8 w-full rounded" /></div></div>)}</div><div className="skeleton hidden rounded-none md:block" /></div>;
}

function SearchPage() {
  const [location, setLocation] = useLocation();
  const initialParams = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const [search, setSearch] = useState(() => initialParams.get('search') || '');
  const [service, setService] = useState(() => initialParams.get('service') || '');
  const [sort, setSort] = useState<SearchSort>(() => safeSearchSort(initialParams.get('sort')));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  useEffect(() => {
    const nextParams = new URLSearchParams(location.split('?')[1] || '');
    const nextSearch = nextParams.get('search') || '';
    const nextService = nextParams.get('service') || '';
    const safeSort = safeSearchSort(nextParams.get('sort'));
    setSearch(nextSearch);
    setService(nextService);
    setSort(safeSort);
  }, [location]);
  const params = useMemo(() => ({ search: search || undefined, service: service || undefined, sort, limit: 50 }), [search, service, sort]);
  const { data, isLoading, isError, refetch } = useListSalons(params, { query: { queryKey: getListSalonsQueryKey(params) } });
  const { saved, toggle } = useSavedSalons();
  const results = data || [];
  const activeId = selectedId && results.some((salon) => String(salon.id) === selectedId) ? selectedId : (results[0] ? String(results[0].id) : null);
  const syncUrl = (nextSearch: string, nextService: string, nextSort: SearchSort) => {
    const next = new URLSearchParams();
    if (nextSearch.trim()) next.set('search', nextSearch.trim());
    if (nextService) next.set('service', nextService);
    if (nextSort !== 'recommended') next.set('sort', nextSort);
    const query = next.toString();
    setLocation(query ? `/search?${query}` : '/search');
  };
  const submit = (event: FormEvent) => { event.preventDefault(); syncUrl(search, service, sort); };
  const chooseService = (nextService: string) => { setService(nextService); setSelectedId(null); syncUrl(search, nextService, sort); };
  const chooseSort = (nextSort: SearchSort) => { setSort(nextSort); setSelectedId(null); syncUrl(search, service, nextSort); };
  return <div className="page-in bg-background">
    <main className="mx-auto flex min-h-[calc(100dvh-68px)] w-full max-w-[1440px] flex-col">
      <section className="border-b border-border bg-secondary/35 px-5 py-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1"><Link href="/" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground" data-testid="link-search-breadcrumb">Certxa / Discover</Link><h1 className="mt-3 font-display text-[clamp(2.6rem,5vw,4.8rem)] leading-[.9] tracking-[-.055em] text-primary">Find your place.</h1></div>
          <form onSubmit={submit} className="flex w-full max-w-[610px] gap-2 rounded-[4px] border border-border bg-card p-2 shadow-sm" data-testid="form-search-results">
            <div className="relative flex min-h-11 min-w-0 flex-1 items-center"><Search size={16} className="ml-3 shrink-0 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search salons, services, or neighborhoods" className="w-full bg-transparent px-3 text-sm outline-none" data-testid="input-search-page" />{search && <button type="button" onClick={() => { setSearch(''); syncUrl('', service, sort); }} aria-label="Clear search" className="mr-2 rounded-full p-1 text-muted-foreground hover:bg-secondary" data-testid="button-clear-search-page"><X size={14} /></button>}</div>
            <button type="submit" className="rounded-[3px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" data-testid="button-search-page">Search</button>
          </form>
        </div>
        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {['', ...categories].map((item) => <button key={item || 'all'} type="button" onClick={() => chooseService(item)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${service === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary'}`} data-testid={`button-filter-${item || 'all'}`}>{item || 'All services'}</button>)}
          <div className="relative ml-auto shrink-0">
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${filtersOpen ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-primary hover:border-primary'}`} aria-expanded={filtersOpen} data-testid="button-search-filters"><SlidersHorizontal size={14} /> Filters</button>
            {filtersOpen && <div className="absolute right-0 top-11 z-40 w-[240px] rounded-[4px] border border-border bg-card p-4 shadow-lg" data-testid="panel-search-filters"><div className="flex items-center justify-between"><p className="text-xs font-bold text-primary">Refine your search</p><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" data-testid="button-close-search-filters"><X size={15} /></button></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Choose a service above, or sort the nearby places by what matters most.</p><div className="mt-4 grid gap-2">{(['recommended', 'rating', 'distance'] as SearchSort[]).map((option) => <button type="button" key={option} onClick={() => { chooseSort(option); setFiltersOpen(false); }} className={`flex items-center justify-between rounded-[3px] px-3 py-2 text-left text-xs font-semibold ${sort === option ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary/60'}`} data-testid={`button-filter-sort-${option}`}>{option === 'recommended' ? 'Recommended' : option === 'rating' ? 'Top rated' : 'Nearest first'}{sort === option && <Check size={14} />}</button>)}</div></div>}
          </div>
        </div>
      </section>
      {isLoading ? <SearchLoading /> : isError ? <div className="mx-5 my-8 lg:mx-8"><ErrorState onRetry={() => refetch()} label="We could not load nearby places just now." /></div> : <div className="flex min-h-[600px] flex-1 flex-col md:flex-row">
        <section className={`${mobileMapOpen ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col bg-background md:w-[440px] md:shrink-0`} aria-label="Search results">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-[15px] font-bold tracking-[-.02em] text-primary">{search ? `Places matching "${search}"` : 'Beauty near you'}</h2><p className="mt-1 font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">{results.length} {results.length === 1 ? 'place' : 'places'} to explore</p></div><label className="relative"><span className="sr-only">Sort results</span><select value={sort} onChange={(event) => chooseSort(event.target.value as SearchSort)} className="h-9 appearance-none rounded-[3px] border border-border bg-card py-0 pl-3 pr-8 text-[11px] font-bold text-primary outline-none" data-testid="select-sort-results"><option value="recommended">Recommended</option><option value="rating">Top rated</option><option value="distance">Nearest first</option></select><ArrowUpDown size={13} className="pointer-events-none absolute right-2.5 top-3 text-muted-foreground" /></label></div>
          <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">{results.length ? results.map((salon) => <SearchResultCard key={salon.id} salon={salon} selected={String(salon.id) === activeId} saved={saved.includes(salon.slug)} toggle={toggle} onSelect={() => setSelectedId(String(salon.id))} />) : <div className="flex min-h-[390px] flex-col items-center justify-center px-8 text-center"><span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary"><Sparkles size={22} /></span><h2 className="font-display text-3xl text-primary">A quiet corner.</h2><p className="mt-2 max-w-[250px] text-xs leading-6 text-muted-foreground">Nothing matched that search. Try another neighborhood, service, or a wider search.</p><button type="button" onClick={() => { setSearch(''); setService(''); setSort('recommended'); setSelectedId(null); syncUrl('', '', 'recommended'); }} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground" data-testid="button-clear-search-filters">Clear filters</button></div>}</div>
        </section>
        <div className={`${mobileMapOpen ? 'flex' : 'hidden'} min-h-0 flex-1 md:flex`}><SearchMap results={results} selectedId={activeId} setSelectedId={setSelectedId} /></div>
      </div>}
    </main>
    <button type="button" onClick={() => setMobileMapOpen((open) => !open)} className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-bold text-primary-foreground shadow-lg transition hover:bg-primary/90 md:hidden" data-testid="button-toggle-search-map">Toggle map</button>
  </div>;
}

function ProfilePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError, refetch } = useGetSalonBySlug(slug, { query: { queryKey: getGetSalonBySlugQueryKey(slug) } });
  const { saved, toggle } = useSavedSalons();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const inquiry = useCreateInquiry();
  useEffect(() => {
    if (!data) return;
    const title = `${data.name} - ${data.address} | Nail Salon`;
    const ratingStr = data.rating > 0 ? ` Rated ${data.rating}/5 from ${data.reviewCount} reviews.` : '';
    const description = `${data.name} is a nail salon located at ${data.address}.${ratingStr}`;
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/${data.slug}`;
  }, [data]);
  useEffect(() => {
    if (!data) return;
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'BeautySalon',
      name: data.name,
      url: `${window.location.origin}/${data.slug}`,
      image: [data.imageUrl, ...(data.gallery || [])],
      description: data.description || data.about,
      telephone: data.phone,
      address: { '@type': 'PostalAddress', streetAddress: data.address, addressLocality: data.city, addressRegion: data.state },
      ...(data.rating && data.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: data.rating, reviewCount: data.reviewCount } } : {}),
      makesOffer: data.services?.map((service) => ({ '@type': 'Offer', name: service.name, price: service.price, priceCurrency: 'USD' })),
    };
    let script = document.head.querySelector<HTMLScriptElement>('script[data-certxa-schema]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.certxaSchema = 'true';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData);
    return () => script?.remove();
  }, [data]);
  if (isLoading) return <ProfileSkeleton />;
  if (isError || !data) return <div className="mx-auto max-w-[900px] px-5 py-28"><ErrorState onRetry={() => refetch()} label="We could not find that salon. It may have moved, or the address may be slightly different." /></div>;
  const salon = data as SalonProfile;
  const isClaimed = !!salon.bookingUrl;
  const sendInquiry = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = new FormData(e.currentTarget); inquiry.mutate({ slug, data: { name: String(form.get('name')), email: String(form.get('email')), message: String(form.get('message')) } }, { onSuccess: () => setInquirySent(true) }); };
  return <div className="page-in"><div className="mx-auto max-w-[1320px] px-5 pt-7 lg:px-10"><Link href="/search" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground" data-testid="link-profile-back">← All salons</Link><div className="mt-7 grid gap-2 md:grid-cols-[1.35fr_.65fr]"><div className="relative h-[330px] overflow-hidden rounded-[3px] md:h-[540px]"><ImageBlock salon={salon} className="h-full w-full" /><div className="absolute bottom-6 left-6 right-6 z-10 text-primary-foreground"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">{salon.category} · {salon.neighborhood || salon.city}</p><h1 className="mt-3 max-w-2xl font-display text-6xl leading-[.88] tracking-[-.045em] sm:text-8xl" data-testid="text-salon-name">{salon.name}</h1>{isClaimed && <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-primary"><BadgeCheck size={14} /> Listed on Certxa</span>}</div></div><div className="grid h-[330px] grid-cols-2 gap-2 md:h-[540px] md:grid-cols-1">{(salon.gallery?.length ? salon.gallery.slice(0, 2) : [null, null]).map((image, i) => <div key={i} className="relative overflow-hidden rounded-[3px]" style={{ background: fallbackImages[(salon.id + i + 1) % fallbackImages.length] }}>{image && <img src={image} alt={`${salon.name} detail ${i + 1}`} className="h-full w-full object-cover" />}</div>)}</div></div><div className="grid gap-10 border-b border-border py-8 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-4 text-sm">{salon.rating > 0 && <span className="flex items-center gap-1 font-semibold text-primary"><Star size={15} fill="currentColor" /> {salon.rating.toFixed(1)} <span className="font-normal text-muted-foreground">({salon.reviewCount} reviews)</span></span>}{(salon.priceLevel || salon.distance) && <span className="text-muted-foreground">{[salon.priceLevel, salon.distance].filter(Boolean).join(' · ')}</span>}{salon.isOpen && <span className="rounded-full bg-[#d8eadc] px-3 py-1 text-xs font-semibold text-[#2d6843]">Open now</span>}</div><p className="mt-4 max-w-2xl text-lg leading-7 text-muted-foreground" data-testid="text-salon-description">{salon.description || salon.about}</p></div><div className="flex gap-3"><button onClick={() => toggle(salon.slug)} className={`flex h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold ${saved.includes(salon.slug) ? 'border-accent bg-accent/15' : 'border-border'}`} data-testid="button-profile-save"><Heart size={16} fill={saved.includes(salon.slug) ? 'currentColor' : 'none'} /> {saved.includes(salon.slug) ? 'Saved' : 'Save'}</button>{isClaimed ? <a href={salon.bookingUrl} className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground" data-testid="button-profile-book">Book a visit <ArrowRight size={16} /></a> : <button onClick={() => setInquiryOpen(true)} className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground" data-testid="button-profile-inquire-primary">Ask a question <ArrowUpRight size={16} /></button>}</div></div></div><main className="mx-auto grid max-w-[1320px] gap-16 px-5 py-14 lg:grid-cols-[1fr_350px] lg:px-10"><div>{salon.services?.length ? <section><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Services</p><h2 className="mt-3 font-display text-5xl text-primary">The good stuff</h2><div className="mt-7 divide-y divide-border border-y border-border">{salon.services.map((service) => <div key={service.id} className="flex items-center justify-between gap-4 py-5" data-testid={`row-service-${service.id}`}><div><h3 className="font-semibold text-primary">{service.name}</h3><p className="mt-1 text-xs text-muted-foreground">{service.durationMinutes} minutes {service.category ? `· ${service.category}` : ''}</p></div><span className="font-mono text-sm text-primary">${service.price}</span></div>)}</div></section> : null}<section className="mt-16 grid gap-7 border-t border-border pt-12 md:grid-cols-[.7fr_1fr]"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">About the place</p><div><p className="text-lg leading-8 text-primary">{salon.about || salon.description || 'A local salon in the Certxa directory.'}</p>{salon.highlights?.length ? <div className="mt-7 flex flex-wrap gap-2">{salon.highlights.map((highlight) => <span key={highlight} className="rounded-full bg-secondary px-3 py-1.5 text-xs text-primary">{highlight}</span>)}</div> : null}</div></section></div><aside className="h-fit rounded-[3px] bg-secondary p-7"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Visit</p><div className="mt-6 grid gap-5 text-sm"><div className="flex gap-3"><MapPin size={17} className="shrink-0 text-accent" /><span>{salon.address}<br />{salon.city}, {salon.state}</span></div>{salon.hours?.length ? <div className="flex gap-3"><Clock3 size={17} className="shrink-0 text-accent" /><div>{salon.hours.map((hour) => <div key={hour.day} className="flex justify-between gap-8"><span>{hour.day}</span><span className="text-muted-foreground">{hour.open}–{hour.close}</span></div>)}</div></div> : null}{salon.phone && <a href={`tel:${salon.phone}`} className="flex gap-3 text-primary" data-testid="link-salon-phone"><MessageCircle size={17} /> {salon.phone}</a>}</div><button onClick={() => setInquiryOpen(true)} className="mt-8 flex w-full items-center justify-center gap-2 border-t border-border pt-6 text-sm font-semibold text-primary" data-testid="button-inquire">Have a question? <ArrowUpRight size={15} /></button></aside></main>{inquiryOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-primary/40 p-5" role="dialog" data-testid="dialog-inquiry"><div className="w-full max-w-[520px] rounded-[3px] bg-background p-7 shadow-2xl sm:p-10">{inquirySent ? <div className="py-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent text-primary"><Check /></div><h2 className="mt-6 font-display text-4xl text-primary">Message sent.</h2><p className="mt-3 text-sm text-muted-foreground">The salon will get back to you soon.</p><button onClick={() => { setInquiryOpen(false); setInquirySent(false); }} className="mt-7 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground" data-testid="button-close-inquiry-success">Done</button></div> : <><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Ask {salon.name}</p><h2 className="mt-3 font-display text-4xl text-primary">Start a conversation.</h2></div><button onClick={() => setInquiryOpen(false)} aria-label="Close inquiry" data-testid="button-close-inquiry"><X /></button></div><form onSubmit={sendInquiry} className="mt-8 grid gap-4"><input required name="name" placeholder="Your name" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-inquiry-name" /><input required type="email" name="email" placeholder="Email address" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-inquiry-email" /><textarea required name="message" placeholder="What would you like to know?" rows={4} className="resize-none border-b border-border bg-transparent px-1 py-3 text-sm outline-none" data-testid="input-inquiry-message" /><button disabled={inquiry.isPending} className="mt-3 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground" data-testid="button-send-inquiry">{inquiry.isPending ? 'Sending…' : 'Send message'}</button></form></>}</div></div>}</div>;
}

function ProfileSkeleton() {
  return <div className="mx-auto max-w-[1320px] px-5 py-12 lg:px-10" data-testid="state-profile-loading"><div className="skeleton h-5 w-28 rounded" /><div className="mt-8 grid gap-2 md:grid-cols-[1.35fr_.65fr]"><div className="skeleton h-[540px] rounded-[3px]" /><div className="skeleton hidden h-[540px] rounded-[3px] md:block" /></div></div>;
}

function SavedPage() {
  const { saved, toggle } = useSavedSalons();
  const params = useMemo(() => ({ limit: 50 }), []);
  const { data, isLoading } = useListSalons(params, { query: { queryKey: getListSalonsQueryKey(params) } });
  const salons = data?.filter((salon) => saved.includes(salon.slug)) || [];
  return <div className="page-in mx-auto max-w-[1320px] px-5 py-14 lg:px-10 lg:py-20"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Your shortlist</p><h1 className="mt-4 font-display text-7xl tracking-[-.05em] text-primary">Saved for later.</h1><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">A little collection of places you might want to make time for.</p><div className="mt-12">{isLoading ? <SalonSkeletons /> : salons.length ? <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{salons.map((salon) => <SalonCard key={salon.id} salon={salon} saved toggle={toggle} />)}</div> : <EmptyState title="Nothing saved yet." copy="When a salon feels like your kind of place, tap the heart and it will live here." />}</div></div>;
}

function ForBusinessPage() {
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(false);
  const inquiry = useCreateBusinessInquiry();
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setSendError(false); const form = new FormData(e.currentTarget); inquiry.mutate({ name: String(form.get('name')), email: String(form.get('email')), message: String(form.get('message')) }, { onSuccess: () => setSent(true), onError: () => setSendError(true) }); };
  return <div className="page-in"><section className="relative overflow-hidden bg-primary text-primary-foreground"><div className="absolute right-[-8%] top-[-25%] h-[580px] w-[580px] rounded-full border-[80px] border-accent/20" /><div className="relative mx-auto max-w-[1320px] px-5 py-24 lg:px-10 lg:py-32"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-accent">For independent salon owners</p><h1 className="mt-7 max-w-4xl font-display text-[clamp(4rem,9vw,8.3rem)] leading-[.83] tracking-[-.06em]">Your work<br /><em>deserves a guide.</em></h1><p className="mt-9 max-w-lg text-lg leading-7 text-primary-foreground/70">Certxa puts thoughtful local businesses in front of people who care where they book.</p></div></section><main className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10"><div className="grid gap-10 border-b border-border pb-20 md:grid-cols-3"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Why Certxa</p><h2 className="mt-4 font-display text-5xl leading-[.92] text-primary">Stay independent. Get found.</h2></div><div className="grid gap-8 text-sm leading-6 text-muted-foreground md:col-span-2 md:grid-cols-3"><div><Store size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">A proper presence</h3><p className="mt-2">A beautiful public profile that reflects how your business actually feels.</p></div><div><Search size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">Local discovery</h3><p className="mt-2">Show up for the services and neighborhoods your best clients are searching.</p></div><div><CalendarDays size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">Better-fit bookings</h3><p className="mt-2">Receive clear requests from people already aligned with your point of view.</p></div></div></div><section className="grid gap-12 py-20 lg:grid-cols-[1fr_440px]"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Come say hello</p><h2 className="mt-5 font-display text-6xl leading-[.88] text-primary">Let's put your<br /><em>place on the map.</em></h2><p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">Tell us a little about your salon. We'll be in touch with the next step, no pitch deck required.</p></div>{sent ? <div className="flex flex-col justify-center rounded-[3px] bg-secondary p-9" data-testid="status-inquiry-success"><Check size={24} className="text-accent" /><h3 className="mt-5 font-display text-4xl text-primary">We'll be in touch.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Thanks for raising your hand. A real person from Certxa will follow up soon.</p></div> : <form onSubmit={submit} className="grid gap-4 rounded-[3px] border border-border bg-card p-7"><input required name="name" placeholder="Your name" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-business-name" /><input required type="email" name="email" placeholder="Email address" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-business-email" /><textarea required name="message" placeholder="Tell us about your salon" rows={5} className="resize-none border-b border-border bg-transparent px-1 py-3 text-sm outline-none" data-testid="input-business-message" /><button disabled={inquiry.isPending} className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground" data-testid="button-business-submit">{inquiry.isPending ? 'Sending…' : 'Start the conversation'}</button>{sendError && <p className="text-xs text-destructive" data-testid="status-business-error">We could not send that just now. Please email hello@certxa.com instead.</p>}</form>}</section></main></div>;
}

// ── Listings: state + city hub pages (Vagaro-style /listings/{city}--{state}) ──
// Not present in the original prototype — added so the ~47k scraped salon
// pages have a real topical hub structure for crawl discovery, matching the
// directory work already done this session.

function parseListingsParam(param: string): { citySlug: string; stateSlug: string } | { stateSlug: string } {
  const sepIndex = param.lastIndexOf('--');
  if (sepIndex === -1) return { stateSlug: param };
  return { citySlug: param.slice(0, sepIndex), stateSlug: param.slice(sepIndex + 2) };
}

function ListingsPage() {
  const { param = '' } = useParams<{ param: string }>();
  const parsed = parseListingsParam(param);
  return 'citySlug' in parsed ? <CityListingsView citySlug={parsed.citySlug} stateSlug={parsed.stateSlug} /> : <StateListingsView stateSlug={parsed.stateSlug} />;
}

function StateListingsView({ stateSlug }: { stateSlug: string }) {
  const { data, isLoading, isError, refetch } = useGetStateListing(stateSlug, { query: { queryKey: getStateListingQueryKey(stateSlug) } });
  if (isLoading) return <div className="mx-auto max-w-[1200px] px-5 py-20"><SalonSkeletons count={6} /></div>;
  if (isError || !data) return <div className="mx-auto max-w-[900px] px-5 py-28"><ErrorState onRetry={() => refetch()} label="We could not find that state." /></div>;
  return <div className="page-in mx-auto max-w-[1200px] px-5 py-14 lg:px-10 lg:py-20"><Link href="/" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">← All states</Link><h1 className="mt-4 font-display text-6xl tracking-[-.045em] text-primary">Nail salons in {data.name}</h1><p className="mt-3 text-sm text-muted-foreground">{data.count.toLocaleString()} salons across {data.cities.length} cities.</p><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{data.cities.map((city) => <Link key={city.slug} href={`/listings/${city.slug}--${stateSlug}`} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-4 py-3 text-sm transition hover:border-primary" data-testid={`link-city-${city.slug}`}><span className="font-semibold text-primary">{city.name}</span><span className="text-xs text-muted-foreground">{city.count.toLocaleString()}</span></Link>)}</div></div>;
}

function CityListingsView({ citySlug, stateSlug }: { citySlug: string; stateSlug: string }) {
  const { data, isLoading, isError, refetch } = useGetCityListing(citySlug, stateSlug, { query: { queryKey: getCityListingQueryKey(citySlug, stateSlug) } });
  if (isLoading) return <div className="mx-auto max-w-[1200px] px-5 py-20"><SalonSkeletons count={6} /></div>;
  if (isError || !data) return <div className="mx-auto max-w-[900px] px-5 py-28"><ErrorState onRetry={() => refetch()} label="We could not find that city." /></div>;
  return <div className="page-in mx-auto max-w-[1200px] px-5 py-14 lg:px-10 lg:py-20"><Link href={`/listings/${stateSlug}`} className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">← {data.stateName}</Link><h1 className="mt-4 font-display text-6xl tracking-[-.045em] text-primary">Nail salons in {data.cityName}</h1><p className="mt-3 text-sm text-muted-foreground">{data.salons.length.toLocaleString()} salons.</p><div className="mt-10 grid gap-3">{data.salons.map((salon) => <Link key={salon.id} href={`/${salon.slug}`} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-5 py-4 transition hover:border-primary" data-testid={`link-listing-salon-${salon.id}`}><div><p className="font-semibold text-primary">{salon.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{salon.description}</p></div>{salon.rating > 0 && <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary"><Star size={13} fill="currentColor" className="text-accent" /> {salon.rating.toFixed(1)}</span>}</Link>)}</div></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/search" component={SearchPage} /><Route path="/saved" component={SavedPage} /><Route path="/for-business" component={ForBusinessPage} /><Route path="/listings/:param" component={ListingsPage} /><Route path="/:slug" component={ProfilePage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export interface AppProps {
  queryClient: QueryClient;
  ssrPath?: string;
  ssrSearch?: string;
  ssrContext?: SsrContext;
}

export default function App({ queryClient, ssrPath, ssrSearch, ssrContext }: AppProps) {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter ssrPath={ssrPath} ssrSearch={ssrSearch} ssrContext={ssrContext}><SeoManager /><div className="site-grain min-h-[100dvh]"><Header /><Router /><Footer /></div></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
