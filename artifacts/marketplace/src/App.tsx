import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import 'leaflet/dist/leaflet.css';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
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
  getListDealsQueryKey,
  getGetDealQueryKey,
  useListDeals,
  useGetDeal,
  useCheckoutDeal,
  useRequestWalletLink,
  useGetMyVouchers,
  getMyVouchersQueryKey,
} from '@/lib/api';
import type { Salon, SalonProfile, MarketplaceDeal, MarketplaceDealDetail, WalletVoucher } from '@/lib/api';
import { toSlug, stateNameFor } from '@/lib/states';
import { getCleanSeoKeywordsForPage } from '@/lib/seo-keywords';
import { QRCodeCanvas } from 'qrcode.react';
import { ArrowRight, ArrowUpDown, ArrowUpRight, BadgeCheck, Bookmark, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, ExternalLink, Heart, LocateFixed, MapPin, Menu, MessageCircle, Minus, Navigation, Phone, Plus, Search, ShieldCheck, Sparkles, Star, Store, Tag, UserRound, Wallet, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import type { SsrContext } from 'wouter';

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

function useSavedDeals() {
  const [saved, setSaved] = useState<number[]>([]);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem('certxa-saved-deals') || '[]')); } catch { setSaved([]); }
  }, []);
  const toggle = (id: number) => setSaved((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem('certxa-saved-deals', JSON.stringify(next));
    return next;
  });
  return { saved, toggle };
}

function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-wordmark font-bold tracking-[-.02em] ${className}`}>Certxa<span className="text-accent">.</span></span>;
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [, navigate] = useLocation();
  const { saved: savedSalons } = useSavedSalons();
  const { saved: savedDeals } = useSavedDeals();
  const savedCount = savedSalons.length + savedDeals.length;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setMenuOpen(false);
    navigate(searchValue.trim() ? `/search?search=${encodeURIComponent(searchValue.trim())}` : '/search');
  };

  const searchField = (
    <form onSubmit={submitSearch} role="search" className="flex h-11 flex-1 items-center rounded-full border border-border bg-white px-4 focus-within:border-primary" data-testid="search-box">
      <Search size={15} className="shrink-0 text-muted-foreground" />
      <input type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Search nail salons near you" aria-label="Search nail salons" className="h-full w-full bg-transparent px-3 text-sm outline-none" data-testid="input-search" />
    </form>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[#f7f3ed]" data-testid="header-site">
      <div className="mx-auto flex h-[68px] max-w-[1320px] items-center gap-5 px-5 lg:px-10">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2 focus-ring" data-testid="link-logo"><Wordmark className="text-[32px] leading-none text-foreground" /></Link>
        <div className="hidden max-w-md flex-1 md:block">{searchField}</div>
        <nav className="ml-auto hidden items-center gap-5 text-[15px] font-bold md:flex" data-testid="nav-primary">
          <Link href="/deals" className="text-muted-foreground transition hover:text-primary focus-ring" data-testid="link-deals">Deals</Link>
          <Link href="/saved" className="relative flex items-center text-muted-foreground transition hover:text-primary focus-ring" aria-label="Saved" data-testid="link-saved"><Heart size={19} strokeWidth={1.6} />{savedCount > 0 && <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-accent text-[10px] font-bold text-primary">{savedCount}</span>}</Link>
          <Link href="/wallet" className="flex items-center gap-1.5 text-muted-foreground transition hover:text-primary focus-ring" data-testid="link-wallet"><Wallet size={18} strokeWidth={1.6} /> My vouchers</Link>
          <Link href="/for-business" className="rounded-[3px] bg-primary px-4 py-2.5 text-primary-foreground transition hover:bg-primary/90 focus-ring" data-testid="link-business">For salons</Link>
        </nav>
        <button onClick={() => setMenuOpen(!menuOpen)} className="ml-auto rounded-full p-2 text-primary md:hidden" aria-label="Toggle menu" data-testid="button-mobile-menu">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {menuOpen && <div className="border-t border-border bg-background px-5 py-5 md:hidden" data-testid="menu-mobile"><div className="grid gap-5"><div className="px-1">{searchField}</div><div className="grid gap-3 text-lg"><Link href="/deals" onClick={() => setMenuOpen(false)} data-testid="link-mobile-deals">Deals</Link><Link href="/wallet" onClick={() => setMenuOpen(false)} data-testid="link-mobile-wallet">My vouchers</Link><Link href="/saved" onClick={() => setMenuOpen(false)} data-testid="link-mobile-saved">Saved{savedCount > 0 ? ` (${savedCount})` : ''}</Link><Link href="/for-business" onClick={() => setMenuOpen(false)} data-testid="link-mobile-business">For salon owners</Link></div></div></div>}
    </header>
  );
}

function Footer() {
  return <footer className="mt-24 bg-primary text-primary-foreground" data-testid="footer-site">
    <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:px-10">
      <div>
        <Wordmark className="text-5xl leading-none" />
        <p className="mt-4 max-w-xs text-sm leading-6 text-primary-foreground/65">Find and book independent salons and spas, powered by Certxa.</p>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">Explore</p>
        <div className="mt-4 grid gap-3 text-sm">
          <Link href="/search" className="hover:text-accent" data-testid="footer-link-search">Find a salon</Link>
          <Link href="/deals" className="hover:text-accent" data-testid="footer-link-deals">Today's deals</Link>
          <Link href="/saved" className="hover:text-accent" data-testid="footer-link-saved">Your saved list</Link>
          <a href="/custom-website-builder" className="hover:text-accent" data-testid="footer-link-custom-website-builder">Custom website builder</a>
          <a href="/launchsite" className="hover:text-accent" data-testid="footer-link-launchsite">Launchsite templates</a>
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">For owners</p>
        <div className="mt-4 grid gap-3 text-sm">
          <Link href="/for-business" className="hover:text-accent" data-testid="footer-link-business">List your salon</Link>
          <a href="/overview" className="hover:text-accent" data-testid="footer-link-software">Certxa software for your salon</a>
          <a href="/solo-professionals" className="hover:text-accent" data-testid="footer-link-solo-professionals">For solo professionals</a>
          <a href="/booth-renters" className="hover:text-accent" data-testid="footer-link-booth-renters">For booth renters</a>
          <a href="mailto:hello@certxa.com" className="hover:text-accent" data-testid="footer-link-contact">Say hello</a>
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">Get started</p>
        <div className="mt-4 grid gap-3 text-sm">
          <a href="/auth?mode=register&plan=professional" className="hover:text-accent" data-testid="footer-link-register-professional">Start professional plan</a>
          <a href="/auth?mode=register&plan=solo" className="hover:text-accent" data-testid="footer-link-register-solo">Start solo plan</a>
          <a href="/dashboard" className="hover:text-accent" data-testid="footer-link-dashboard">Owner dashboard</a>
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/50">Spotlight pages</p>
        <div className="mt-4 grid gap-3 text-sm">
          <a href="/deals/2" className="hover:text-accent" data-testid="footer-link-deal-2">Featured deal #2</a>
          <a href="/deals/8" className="hover:text-accent" data-testid="footer-link-deal-8">Featured deal #8</a>
          <a href="/t-and-t-nail-salon-spa-ashburn-amendola-terrace-156-ashburn-xGHOJW" className="hover:text-accent" data-testid="footer-link-spotlight-salon">T &amp; T Nail Salon Spa (Ashburn)</a>
        </div>
      </div>
    </div>

    <div className="mx-auto flex max-w-[1320px] justify-between border-t border-primary-foreground/15 px-5 py-5 font-mono text-[10px] uppercase tracking-[.15em] text-primary-foreground/45 lg:px-10">
      <span>© 2026 Certxa</span>
      <span>Made for good hair days</span>
    </div>
  </footer>;
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
      ? 'Nail salon deals near you — Certxa'
      : isSearch
        ? 'Find nail salons near you — Certxa'
        : isBusiness
          ? 'List your salon on Certxa'
          : isListings
            ? 'Nail salons — Certxa'
            : 'Certxa — Independent beauty, found locally';
    const description = isHome
      ? 'Find nail salon deals, local nail studios, and nearby spa services curated by Certxa.'
      : isSearch
        ? 'Search nail salons, nail spas, and local beauty services by city, neighborhood, and service type.'
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
  return <div className={`relative overflow-hidden ${className}`} style={{ background: fallbackImages[(salon.id || 0) % fallbackImages.length] }} data-testid={`image-salon-${salon.slug || salon.id || 'unknown'}`}>{(salon as Salon).imageUrl && <img src={(salon as Salon).imageUrl} alt={`${salon.name || 'Salon'} interior`} decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />}</div>;
}

function SalonCard({ salon, saved, toggle }: { salon: Salon; saved: boolean; toggle: (slug: string) => void }) {
  return <article className="group relative" data-testid={`card-salon-${salon.id}`}><Link href={`/${salon.slug}`} className="block focus-ring" data-testid={`link-salon-${salon.id}`}><div className="relative aspect-[1.18/1] overflow-hidden rounded-[3px]"><ImageBlock salon={salon} className="h-full w-full" />{salon.featured && <span className="absolute left-4 top-4 z-10 rounded-full bg-background/90 px-3 py-1 font-mono text-[9px] uppercase tracking-[.16em] text-primary">Certxa pick</span>}</div><div className="pt-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-[19px] font-semibold tracking-[-.025em] text-primary">{salon.name}</h3><p className="mt-1 text-sm text-muted-foreground">{salon.category} · {salon.neighborhood || salon.city}</p></div><span className="flex items-center gap-1 pt-1 text-sm text-primary"><Star size={13} fill="currentColor" /> {salon.rating?.toFixed(1)}</span></div><div className="mt-3 flex flex-wrap gap-2">{salon.tags?.slice(0, 2).map((tag) => <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">{tag}</span>)}</div></div></Link><button onClick={() => toggle(salon.slug)} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-primary transition hover:scale-105" aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-${salon.id}`}><Heart size={16} fill={saved ? 'currentColor' : 'none'} className={saved ? 'text-accent' : ''} /></button></article>;
}

function ErrorState({ onRetry, label = 'We could not load this just now.' }: { onRetry?: () => void; label?: string }) {
  return <div className="rounded-[3px] border border-border bg-card px-6 py-12 text-center" data-testid="state-error"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/20 text-primary"><Sparkles size={19} /></div><h3 className="mt-4 font-display text-3xl text-primary">A little pause.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{label}</p>{onRetry && <button onClick={onRetry} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="button-retry">Try again</button>}</div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="rounded-[3px] border border-dashed border-border bg-card px-6 py-16 text-center" data-testid="state-empty"><div className="mx-auto h-1 w-12 bg-accent" /><h3 className="mt-5 font-display text-3xl text-primary">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p></div>;
}

function KeywordCluster({ page, intro, limit = 16 }: { page: 'home' | 'search' | 'deals' | 'listings' | 'business'; intro: string; limit?: number }) {
  const keywords = useMemo(() => getCleanSeoKeywordsForPage(page, limit), [page, limit]);
  if (!keywords.length) return null;
  return <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground" data-testid={`seo-keywords-${page}`}><span className="font-semibold text-primary">{intro}</span> {keywords.join(', ')}.</p>;
}

function FeaturedMarketplaceCard({ salon, saved, toggle }: { salon: Salon; saved: boolean; toggle: (slug: string) => void }) {
  return <article className="group relative" data-testid={`card-featured-${salon.id}`}><Link href={`/${salon.slug}`} className="block focus-ring"><div className="relative aspect-[1.4/1] overflow-hidden rounded-[7px] border border-border bg-secondary"><ImageBlock salon={salon} className="h-full w-full" /><span className="absolute bottom-3 left-3 rounded-[3px] bg-background/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-primary">Certxa pick</span></div><div className="mt-2 flex items-start justify-between gap-3"><div><h3 className="text-[14px] font-bold text-primary">{salon.name}</h3><p className="mt-0.5 text-[12px] text-muted-foreground">{salon.city}, {salon.state} · {salon.distance}</p></div><span className="flex items-center gap-1 text-[12px] font-semibold text-primary"><Star size={12} fill="currentColor" className="text-accent" /> {salon.rating.toFixed(1)}</span></div></Link><button onClick={() => toggle(salon.slug)} className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-background/95 text-primary transition hover:scale-105" aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-featured-${salon.id}`}><Heart size={14} fill={saved ? 'currentColor' : 'none'} className={saved ? 'text-primary' : ''} /></button></article>;
}

function SalonSkeletons({ count = 3 }: { count?: number }) {
  return <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" data-testid="state-loading">{Array.from({ length: count }).map((_, i) => <div key={i}><div className="skeleton aspect-[1.18/1] rounded-[3px]" /><div className="skeleton mt-4 h-5 w-2/3 rounded" /><div className="skeleton mt-2 h-4 w-1/2 rounded" /></div>)}</div>;
}

function BusinessAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLLabelElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);

  const params = useMemo(() => ({ search: debounced, limit: 6 }), [debounced]);
  const enabled = debounced.length >= 2;
  const { data, isFetching } = useListSalons(params, { query: { queryKey: getListSalonsQueryKey(params), enabled } });
  const results = enabled ? (data || []) : [];

  useEffect(() => {
    setOpen(enabled);
    setActiveIndex(-1);
  }, [debounced]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const select = (salon: Salon) => {
    setOpen(false);
    onChange(salon.name);
    setLocation(`/${salon.slug}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); select(results[activeIndex]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return <label ref={wrapRef} className="relative flex h-12 items-center border-b border-border md:border-b-0 md:border-r">
    <Search size={16} className="ml-4 shrink-0 text-muted-foreground" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => { if (enabled) setOpen(true); }}
      onKeyDown={onKeyDown}
      placeholder="Business name or location"
      className="h-full w-full bg-transparent px-3 text-sm outline-none"
      data-testid="input-hero-business"
      autoComplete="off"
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
    />
    {open && (results.length > 0 || isFetching) && <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-[4px] border border-border bg-card text-left shadow-xl" role="listbox" data-testid="list-hero-business-suggestions">
      {isFetching && !results.length ? <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
        : results.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">No matches found.</div>
        : results.map((salon, i) => <button key={salon.id} type="button" role="option" aria-selected={i === activeIndex} onMouseDown={(e) => { e.preventDefault(); select(salon); }} onMouseEnter={() => setActiveIndex(i)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition ${i === activeIndex ? 'bg-secondary' : ''}`} data-testid={`option-hero-business-${salon.id}`}>
          <span className="min-w-0"><span className="font-semibold text-foreground">{salon.name}</span><span className="text-muted-foreground"> in {salon.city}, {salon.state}</span></span>
          {salon.rating > 0 && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary"><Star size={11} fill="currentColor" className="text-accent" /> {salon.rating.toFixed(1)}</span>}
        </button>)}
    </div>}
  </label>;
}

function money(n: number) { return `$${n.toFixed(2)}`; }

// A deal card's info block below the image — business name, title, real
// location+distance, real rating (from synced Google reviews, never
// fabricated when absent), and the price row in Groupon's own order:
// strikethrough list price, bold sale price, green discount-percent chip.
function DealCardBody({ deal }: { deal: MarketplaceDeal }) {
  return <>
    <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{deal.salon.name}</p>
    <h4 className="mt-0.5 line-clamp-2 font-display text-[15px] leading-tight text-foreground">{deal.title}</h4>
    <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-muted-foreground"><MapPin size={11} className="shrink-0" />{[deal.salon.city, deal.salon.state].filter(Boolean).join(', ')}{deal.distance ? ` · ${deal.distance}` : ''}</p>
    {deal.rating != null && <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-foreground"><Star size={11} fill="currentColor" className="text-accent" />{deal.rating.toFixed(1)}<span className="font-normal text-muted-foreground">({deal.reviewCount})</span></p>}
    <p className="mt-2 flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground line-through">{money(deal.listPrice)}</span>
      <span className="font-bold text-foreground">{money(deal.dealPrice)}</span>
      {deal.discountPercent > 0 && <span className="rounded-[3px] bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">-{deal.discountPercent}%</span>}
    </p>
  </>;
}

function DealGridCard({ deal }: { deal: MarketplaceDeal }) {
  const { saved, toggle } = useSavedDeals();
  const isSaved = saved.includes(deal.id);
  return <div className="group relative" data-testid={`card-deal-grid-${deal.id}`}>
    <Link href={`/deals/${deal.id}`} className="block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[6px] border border-border bg-secondary">
        {deal.heroImage
          ? <img src={deal.heroImage} alt={deal.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
          : <div className="h-full w-full" style={{ backgroundImage: fallbackImages[deal.id % fallbackImages.length] }} />}
        {deal.discountPercent > 0 && <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-primary shadow">{deal.discountPercent}% off</span>}
      </div>
      <DealCardBody deal={deal} />
    </Link>
    <button type="button" onClick={() => toggle(deal.id)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-background/95 text-primary transition hover:scale-105" aria-label={isSaved ? 'Remove from saved' : 'Save deal'} data-testid={`button-save-deal-grid-${deal.id}`}><Heart size={14} fill={isSaved ? 'currentColor' : 'none'} className={isSaved ? 'text-accent' : ''} /></button>
  </div>;
}

// ── Horizontal-scroll carousel (Groupon-style browsing) ─────────────────────

function ScrollCarousel({ eyebrow, title, seeAllHref, children }: { eyebrow?: string; title: string; seeAllHref?: string; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  return <section className="border-t border-border py-10">
    <div className="flex items-end justify-between gap-4">
      <div>{eyebrow && <p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">{eyebrow}</p>}<h2 className="mt-2 font-display text-3xl text-primary">{title}</h2></div>
      <div className="flex items-center gap-3">
        {seeAllHref && <Link href={seeAllHref} className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex" data-testid="link-carousel-see-all">See all <ArrowRight size={14} /></Link>}
        <div className="flex gap-1.5">
          <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left" className="grid h-9 w-9 place-items-center rounded-full border border-border text-primary transition hover:bg-secondary"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => scroll(1)} aria-label="Scroll right" className="grid h-9 w-9 place-items-center rounded-full border border-border text-primary transition hover:bg-secondary"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
    <div ref={scrollRef} className="mt-6 flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]" style={{ scrollSnapType: 'x mandatory' }}>{children}</div>
  </section>;
}

function DealCarouselCard({ deal }: { deal: MarketplaceDeal }) {
  const { saved, toggle } = useSavedDeals();
  const isSaved = saved.includes(deal.id);
  return <div className="w-[230px] shrink-0" style={{ scrollSnapAlign: 'start' }} data-testid={`card-deal-${deal.id}`}>
    <div className="relative aspect-[4/3] overflow-hidden rounded-[7px] border border-border bg-secondary">
      <Link href={`/deals/${deal.id}`} className="group block h-full w-full">
        {deal.heroImage
          ? <img src={deal.heroImage} alt={deal.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
          : <div className="h-full w-full" style={{ backgroundImage: fallbackImages[deal.id % fallbackImages.length] }} />}
      </Link>
      {deal.discountPercent > 0 && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-primary shadow" data-testid={`badge-discount-${deal.id}`}>{deal.discountPercent}% off</span>}
      <button type="button" onClick={() => toggle(deal.id)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/95 text-primary transition hover:scale-105" aria-label={isSaved ? 'Remove from saved' : 'Save deal'} data-testid={`button-save-deal-${deal.id}`}><Heart size={14} fill={isSaved ? 'currentColor' : 'none'} className={isSaved ? 'text-accent' : ''} /></button>
    </div>
    <Link href={`/deals/${deal.id}`} className="block"><DealCardBody deal={deal} /></Link>
  </div>;
}

function FeaturedDealsSection({ coords }: { coords: { lat: number; lng: number } | null }) {
  const params = useMemo(() => ({ limit: 12, lat: coords?.lat, lng: coords?.lng }), [coords?.lat, coords?.lng]);
  const { data, isLoading } = useListDeals(params, { query: { queryKey: getListDealsQueryKey(params) } });
  const deals = data || [];
  if (!isLoading && deals.length === 0) return null;
  return <ScrollCarousel eyebrow="Limited time" title="Today's deals" seeAllHref="/deals">
    {isLoading
      ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[230px] shrink-0"><div className="skeleton aspect-[4/3] rounded-[7px]" /><div className="skeleton mt-3 h-4 w-2/3 rounded" /><div className="skeleton mt-2 h-4 w-1/2 rounded" /></div>)
      : deals.map((deal) => <DealCarouselCard key={deal.id} deal={deal} />)}
  </ScrollCarousel>;
}

function Home() {
  const { data: geo } = useGetGeoCity({ query: { queryKey: getGeoCityQueryKey() } });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 6000 },
    );
  }, []);

  const featuredParams = useMemo(() => (geo ? { citySlug: geo.citySlug, stateSlug: geo.stateSlug } : {}), [geo]);
  const { data: featuredSalonsData, isLoading: featuredLoading, isError: featuredError, refetch: refetchFeatured } =
    useGetFeaturedSalons(featuredParams, { query: { queryKey: getGetFeaturedSalonsQueryKey(featuredParams) } });
  const featuredSalons = featuredSalonsData || [];
  const { saved: savedSalonSlugs, toggle: toggleSalon } = useSavedSalons();
  const cityLabel = geo ? `${geo.city}, ${geo.state}` : '';

  return (
    <div className="page-in bg-background">
      <section
        className="relative overflow-hidden bg-[#f7f3ed]"
        style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, rgba(240,195,107,.4), transparent 45%), radial-gradient(circle at 88% 10%, rgba(201,97,74,.25), transparent 50%), radial-gradient(circle at 60% 100%, rgba(77,122,108,.14), transparent 55%)' }}
        aria-label="Certxa nail salon deals"
      >
        <div className="relative mx-auto max-w-[1120px] px-5 py-16 lg:px-10 lg:py-20">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.24em] text-primary">Limited-time nail care deals</p>
          <h1 className="mt-5 max-w-2xl font-display text-[clamp(3rem,6vw,5.5rem)] leading-[.95] tracking-[-.02em] text-foreground">Nail salon deals near you</h1>
          <p className="mt-4 max-w-xl text-base leading-6 text-muted-foreground">Shop limited-time nail care prices from trusted salons{cityLabel ? ` in ${cityLabel}` : ' near you'}.</p>
          <KeywordCluster page="home" intro="Popular searches:" limit={20} />
        </div>
      </section>
      <FeaturedDealsSection coords={coords} />
      <section className="mx-auto max-w-[1320px] border-t border-border px-5 py-10 lg:px-10" aria-labelledby="featured-salons-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="featured-salons-heading" className="font-display text-3xl text-primary">Featured nail salons</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Meet the nail studios your neighbors are booking now.</p>
          </div>
          <Link href="/search" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex" data-testid="link-featured-see-all">See all <ArrowRight size={14} /></Link>
        </div>
        <div className="mt-7">
          {featuredLoading
            ? <SalonSkeletons count={5} />
            : featuredError
              ? <ErrorState onRetry={() => refetchFeatured()} />
              : featuredSalons.length
                ? <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">{featuredSalons.map((salon) => <FeaturedMarketplaceCard key={salon.id} salon={salon} saved={savedSalonSlugs.includes(salon.slug)} toggle={toggleSalon} />)}</div>
                : <EmptyState title="The list is taking shape." copy="Check back soon for new independent nail salons in your area." />}
        </div>
      </section>
    </div>
  );
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
  return <article className={`group relative border-b border-border/80 border-l-[3px] transition-colors ${selected ? 'border-l-accent bg-secondary/70' : 'border-l-transparent bg-background hover:bg-card'}`} data-testid={`card-search-result-${salon.id}`}>
    <Link href={`/${salon.slug}`} onClick={onSelect} className="block p-5 pr-16 focus-ring sm:p-6 sm:pr-16">
      <div className="flex gap-5">
        <div className="relative h-[118px] w-[118px] shrink-0 overflow-hidden rounded-[6px] sm:h-[138px] sm:w-[138px]">
          <ImageBlock salon={salon} className="h-full w-full" />
          {salon.featured && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[.08em] text-primary shadow-sm"><BadgeCheck size={11} className="text-accent" /> Pick</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold leading-[1.25] tracking-[-.02em] text-primary sm:text-[18px]">{salon.name}</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"><MapPin size={13} className="shrink-0 text-primary/65" />{salon.neighborhood || salon.city}<span aria-hidden="true">·</span>{resultDistance(salon)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            {salon.rating > 0 && <span className="flex items-center gap-1 font-bold text-primary"><Star size={13} fill="currentColor" className="text-accent" />{salon.rating.toFixed(1)} <span className="font-normal text-muted-foreground">{resultReviews(salon)}</span></span>}
            {salon.category && <span className="font-medium text-muted-foreground">{salon.category}</span>}
            {salon.priceLevel && <span className="rounded-[3px] bg-accent/25 px-2 py-0.5 font-mono text-[10px] text-primary">{salon.priceLevel}</span>}
          </div>
          <p className="mt-3 line-clamp-2 text-[13px] leading-[1.55] text-muted-foreground">{salon.description || 'A thoughtful local place with a point of view.'}</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{resultInitials(salon.name)}</span>
          </div>
        </div>
      </div>
    </Link>
    <button type="button" onClick={() => toggle(salon.slug)} className={`absolute right-4 top-5 z-10 grid h-10 w-10 place-items-center rounded-full border border-border bg-background/95 shadow-sm transition hover:scale-105 focus-ring ${saved ? 'text-accent' : 'text-muted-foreground'}`} aria-label={saved ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid={`button-save-search-${salon.id}`}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>
  </article>;
}

function salonCoordinates(salon: Salon): [number, number] | null {
  if (salon.latitude == null || salon.longitude == null) return null;
  const latitude = Number(salon.latitude);
  const longitude = Number(salon.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [latitude, longitude];
}

function SearchMap({ results, selectedId, setSelectedId, userCoords }: { results: Salon[]; selectedId: string | null; setSelectedId: (id: string) => void; userCoords?: { lat: number; lng: number } | null }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markersRef = useRef<Map<string, import('leaflet').Marker>>(new Map());
  const markerLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const selected = results.find((salon) => String(salon.id) === selectedId);
  const mappedResults = useMemo(() => results.flatMap((salon) => {
    const coordinates = salonCoordinates(salon);
    return coordinates ? [{ salon, coordinates }] : [];
  }), [results]);

  const makeMarkerIcon = (isSelected: boolean) => leafletRef.current!.divIcon({
    className: 'salon-marker-icon',
    html: `<span class="salon-map-pin${isSelected ? ' is-selected' : ''}"><span></span></span>`,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    tooltipAnchor: [0, -44],
  });

  const fitResults = () => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;
    if (mappedResults.length === 1) map.setView(mappedResults[0].coordinates, 14);
    else if (mappedResults.length > 1) map.fitBounds(leaflet.latLngBounds(mappedResults.map(({ coordinates }) => coordinates)), { padding: [52, 52], maxZoom: 14 });
    else if (userCoords) map.setView([userCoords.lat, userCoords.lng], 12);
    else map.setView([39.5, -98.35], 4);
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    void import('leaflet').then((module) => {
      if (cancelled || !mapElementRef.current) return;
      const leaflet = module;
      leafletRef.current = leaflet;
      const map = leaflet.map(mapElementRef.current, { zoomControl: false, minZoom: 3, maxZoom: 18 });
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      markerLayerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(mapElementRef.current);
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      markerLayerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const markerLayer = markerLayerRef.current;
    if (!mapReady || !leaflet || !markerLayer) return;
    markerLayer.clearLayers();
    markersRef.current.clear();
    mappedResults.forEach(({ salon, coordinates }) => {
      const id = String(salon.id);
      const marker = leaflet.marker(coordinates, {
        icon: makeMarkerIcon(id === selectedId),
        keyboard: true,
        title: salon.name,
        alt: `${salon.name} map marker`,
      });
      const tooltip = document.createElement('span');
      tooltip.textContent = salon.name;
      marker.bindTooltip(tooltip, { direction: 'top', opacity: .96 });
      marker.on('click', () => setSelectedId(id));
      marker.addTo(markerLayer);
      markersRef.current.set(id, marker);
    });
    fitResults();
  }, [mapReady, mappedResults]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current) return;
    markersRef.current.forEach((marker, id) => {
      marker.setIcon(makeMarkerIcon(id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    });
  }, [mapReady, selectedId]);

  return <section className="relative h-full min-h-0 w-full flex-1 overflow-hidden overscroll-none border-l border-border bg-[#e8e2d5]" aria-label="Map of nearby salons" data-testid="panel-search-map">
    <div ref={mapElementRef} className="absolute inset-0 z-0" data-testid="search-map-canvas" />
    <div className="absolute right-5 top-5 z-[1000] flex flex-col overflow-hidden rounded-[4px] border border-card/80 bg-card/95 shadow-md backdrop-blur-sm">
      <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in map" className="p-2.5 text-primary transition hover:bg-secondary" data-testid="button-search-map-zoom-in"><Plus size={16} /></button>
      <div className="h-px bg-border" />
      <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out map" className="p-2.5 text-primary transition hover:bg-secondary" data-testid="button-search-map-zoom-out"><Minus size={16} /></button>
    </div>
    <button type="button" onClick={fitResults} aria-label="Center map on results" className="absolute bottom-5 right-5 z-[1000] rounded-[4px] border border-card/80 bg-card/95 p-3 text-primary shadow-md backdrop-blur-sm transition hover:bg-card" data-testid="button-search-map-center"><LocateFixed size={17} /></button>
    <div className="absolute bottom-5 left-5 z-[1000] hidden items-center gap-2 rounded-[4px] border border-card/80 bg-card/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground shadow-sm backdrop-blur-sm sm:flex"><span className="h-2 w-2 rounded-full bg-accent" /> {mappedResults.length} {mappedResults.length === 1 ? 'place' : 'places'} mapped</div>
    {!mappedResults.length && <div className="pointer-events-none absolute left-1/2 top-5 z-[1000] -translate-x-1/2 rounded-[4px] border border-border bg-card/95 px-4 py-2 text-center text-xs font-medium text-muted-foreground shadow-md">Map locations are not available for these results.</div>}
    {selected && salonCoordinates(selected) && <div className="absolute bottom-5 left-1/2 z-[1000] hidden w-[270px] -translate-x-1/2 rounded-[4px] border border-border bg-card p-4 shadow-lg sm:block" data-testid={`map-selected-${selected.id}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-bold text-primary">{selected.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{selected.neighborhood || selected.city} · {resultDistance(selected)}</p></div><span className="flex items-center gap-1 text-xs font-bold text-primary"><Star size={12} fill="currentColor" className="text-accent" /> {selected.rating?.toFixed(1)}</span></div>
      <Link href={`/${selected.slug}`} className="mt-3 flex w-full items-center justify-center gap-1 rounded-[3px] bg-secondary py-2 text-[11px] font-bold text-primary transition hover:bg-accent/30" data-testid={`link-map-details-${selected.id}`}>View details <Navigation size={12} /></Link>
    </div>}
  </section>;
}

function SearchLoading() {
  return <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(360px,440px)_1fr]" data-testid="state-search-loading"><div className="overflow-hidden border-r border-border p-5"><div className="skeleton h-5 w-44 rounded" /><div className="skeleton mt-3 h-3 w-24 rounded" />{Array.from({ length: 4 }).map((_, index) => <div key={index} className="mt-5 flex gap-4 border-b border-border pb-5"><div className="skeleton h-28 w-28 shrink-0 rounded-[4px]" /><div className="flex-1"><div className="skeleton h-4 w-4/5 rounded" /><div className="skeleton mt-3 h-3 w-1/2 rounded" /><div className="skeleton mt-4 h-8 w-full rounded" /></div></div>)}</div><div className="skeleton hidden rounded-none md:block" /></div>;
}

function SearchPage() {
  const [, setLocation] = useLocation();
  const queryString = useSearch();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  const initialParams = useMemo(() => new URLSearchParams(queryString), []);
  const [search, setSearch] = useState(() => initialParams.get('search') || '');
  const [service, setService] = useState(() => initialParams.get('service') || '');
  const [sort, setSort] = useState<SearchSort>(() => safeSearchSort(initialParams.get('sort')));
  const [radius, setRadius] = useState(() => {
    const paramRadius = initialParams.get('radius');
    return paramRadius ? Number(paramRadius) : 5;
  });
  const updateRadius = (newRadius: number) => {
    setRadius(newRadius);
    syncUrl(search, service, sort);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { data: geo } = useGetGeoCity({ query: { queryKey: getGeoCityQueryKey() } });
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 6000 },
    );
  }, []);
  useEffect(() => {
    const nextParams = new URLSearchParams(queryString);
    const nextSearch = nextParams.get('search') || '';
    const nextService = nextParams.get('service') || '';
    const safeSort = safeSearchSort(nextParams.get('sort'));
    setSearch(nextSearch);
    setService(nextService);
    setSort(safeSort);
  }, [queryString]);
  const searchedLocation = search.includes(',') ? search.trim() : '';
  const geoLocation = geo ? `${geo.city}, ${geo.state}` : '';
  const activeLocation = searchedLocation || geoLocation;
  const params = useMemo(() => ({
    search: searchedLocation ? undefined : search || undefined,
    location: activeLocation || undefined,
    lat: coords?.lat,
    lng: coords?.lng,
    service: service || undefined,
    sort,
    radius,
    limit: 50,
  }), [activeLocation, coords?.lat, coords?.lng, search, searchedLocation, service, sort, radius]);
  const { data, isLoading, isError, refetch } = useListSalons(params, { query: { queryKey: getListSalonsQueryKey(params) } });
  const { saved, toggle } = useSavedSalons();
  const results = data || [];
  const activeId = selectedId && results.some((salon) => String(salon.id) === selectedId) ? selectedId : (results[0] ? String(results[0].id) : null);
  const syncUrl = (nextSearch: string, nextService: string, nextSort: SearchSort) => {
    const next = new URLSearchParams();
    if (nextSearch.trim()) next.set('search', nextSearch.trim());
    if (nextService) next.set('service', nextService);
    if (nextSort !== 'recommended') next.set('sort', nextSort);
    // Always include radius=5 for service-based searches to show nearby results
    next.set('radius', String(radius));
    const query = next.toString();
    setLocation(query ? `/search?${query}` : '/search');
  };
  const chooseSort = (nextSort: SearchSort) => { setSort(nextSort); setSelectedId(null); syncUrl(search, service, nextSort); };
  const resultHeading = searchedLocation
    ? `Nail salons in ${searchedLocation}`
    : search
      ? `Nail salons matching "${search}"`
      : activeLocation
        ? `Nail salons near ${activeLocation}`
        : 'Nail salons near you';
  return <div className="page-in fixed inset-x-0 bottom-0 top-[68px] z-30 overflow-hidden bg-background">
    {/* Always rendered, independent of isLoading — the visible heading below
        is swapped out for a loading skeleton, and since /search has no SSR
        data prefetch (see entry-server.tsx), isLoading is always true in the
        server-rendered HTML a crawler sees. Without this, the page shipped
        no H1 at all server-side (a real Semrush "missing h1" finding). */}
    <h1 className="sr-only">{resultHeading}</h1>
    <div className="px-6 pt-3 md:px-8"><KeywordCluster page="search" intro="Trending local searches:" limit={14} /></div>
    <main className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {isLoading ? <SearchLoading /> : isError ? <div className="min-h-0 flex-1 overflow-hidden px-5 py-8 lg:px-8"><ErrorState onRetry={() => refetch()} label="We could not load nearby places just now." /></div> : <div className="flex min-h-0 flex-1 overflow-hidden flex-col md:flex-row">
        <section className={`${mobileMapOpen ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col overflow-hidden bg-background md:w-[500px] md:shrink-0 xl:w-[540px]`} aria-label="Search results">
          <div className="flex shrink-0 items-center justify-between gap-5 border-b border-border bg-card/60 px-6 py-5"><div className="min-w-0"><p aria-hidden="true" className="truncate text-[18px] font-bold tracking-[-.025em] text-primary">{resultHeading}</p><p className="mt-1.5 font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">{results.length} {results.length === 1 ? 'place' : 'places'} to explore</p></div><label className="relative shrink-0"><span className="sr-only">Sort results</span><select value={sort} onChange={(event) => chooseSort(event.target.value as SearchSort)} className="h-10 appearance-none rounded-[4px] border border-border bg-background py-0 pl-3 pr-9 text-[12px] font-bold text-primary outline-none focus:border-primary" data-testid="select-sort-results"><option value="recommended">Recommended</option><option value="rating">Top rated</option><option value="distance">Nearest first</option></select><ArrowUpDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground" /></label></div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" data-testid="list-search-results">{results.length ? results.map((salon) => <SearchResultCard key={salon.id} salon={salon} selected={String(salon.id) === activeId} saved={saved.includes(salon.slug)} toggle={toggle} onSelect={() => setSelectedId(String(salon.id))} />) : <div className="flex min-h-[390px] flex-col items-center justify-center px-8 text-center"><span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary"><Sparkles size={22} /></span><h2 className="font-display text-3xl text-primary">A quiet corner.</h2><p className="mt-2 max-w-[250px] text-sm leading-6 text-muted-foreground">Nothing matched that search. Try another neighborhood, service, or a wider search.</p><button type="button" onClick={() => { setSearch(''); setService(''); setSort('recommended'); setSelectedId(null); syncUrl('', '', 'recommended'); }} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground" data-testid="button-clear-search-filters">Clear filters</button></div>}</div>
        </section>
        <div className={`${mobileMapOpen ? 'flex' : 'hidden'} h-full min-h-0 min-w-0 flex-1 overflow-hidden overscroll-none md:flex`}><SearchMap results={results} selectedId={activeId} setSelectedId={setSelectedId} userCoords={coords} /></div>
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
  return <div className="page-in"><div className="mx-auto max-w-[1320px] px-5 pt-7 lg:px-10"><Link href="/search" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground" data-testid="link-profile-back">← All salons</Link><div className="mt-7 grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-start"><div className="relative h-[380px] overflow-hidden rounded-2xl md:h-[520px]"><ImageBlock salon={salon} className="h-full w-full" />{isClaimed && <span className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-primary/95 px-3 py-1.5 text-xs font-bold uppercase tracking-[.05em] text-primary-foreground backdrop-blur-sm"><ShieldCheck size={13} /> Certxa Verified</span>}</div><div className="relative pt-1 md:pt-4"><button onClick={() => toggle(salon.slug)} className={`absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-lg border ${saved.includes(salon.slug) ? 'border-accent bg-accent/15 text-primary' : 'border-border text-muted-foreground'}`} aria-label={saved.includes(salon.slug) ? `Remove ${salon.name} from saved` : `Save ${salon.name}`} data-testid="button-profile-save"><Bookmark size={17} fill={saved.includes(salon.slug) ? 'currentColor' : 'none'} /></button><p className="max-w-[80%] font-mono text-xs font-semibold uppercase tracking-[.15em] text-primary">{[salon.neighborhood, salon.city, salon.category].filter(Boolean).join(' · ')}</p><h1 className="mt-4 font-display text-5xl leading-[1.03] text-foreground sm:text-6xl" data-testid="text-salon-name">{salon.name}</h1>{salon.rating > 0 &&<div className="mt-5 flex items-center gap-2"><Star size={17} fill="currentColor" className="text-primary" /> <span className="text-base font-bold text-foreground">{salon.rating.toFixed(1)}</span> <span className="text-sm text-muted-foreground">({salon.reviewCount})</span></div>}<div className="mt-6 flex flex-wrap gap-3">{isClaimed && <a href={salon.bookingUrl} className="flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background" data-testid="button-profile-book">Book Appointment <ArrowRight size={16} /></a>}{salon.phone && <a href={`tel:${salon.phone}`} className={isClaimed ? 'flex h-12 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold text-foreground' : 'flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background'} data-testid="button-profile-call"><Phone size={16} /> Call {salon.name}</a>}{salon.website && <a href={salon.website} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold text-foreground" data-testid="button-profile-website">Visit website <ExternalLink size={15} /></a>}{!isClaimed && !salon.phone && !salon.website && <button onClick={() => setInquiryOpen(true)} className="flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background" data-testid="button-profile-inquire-primary">Ask a question <ArrowUpRight size={16} /></button>}</div>{isClaimed && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 size={15} className="text-primary" /> A place we'd recommend to a friend.</p>}</div></div></div><main className="mx-auto grid max-w-[1320px] gap-16 px-5 py-14 lg:grid-cols-[1fr_350px] lg:px-10"><div><section className="border-t border-border pt-12"><p className="font-mono text-xs font-semibold uppercase tracking-[.15em] text-primary">Why go</p><h2 className="mt-3 font-editorial text-4xl text-foreground">The short version</h2><p className="mt-4 max-w-2xl text-lg leading-7 text-muted-foreground">{salon.about || salon.description || 'A local salon in the Certxa directory.'}</p>{salon.about && <p className="mt-2 text-xs text-muted-foreground/70">Summary generated from public listing data.</p>}{salon.highlights?.length ? <div className="mt-6 flex flex-wrap gap-2">{salon.highlights.map((highlight) => <span key={highlight} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"><Check size={12} className="text-primary" /> {highlight}</span>)}</div> : null}</section>{salon.services?.length ? <section className="mt-16 border-t border-border pt-12"><p className="font-mono text-xs font-semibold uppercase tracking-[.15em] text-primary">Services</p><h2 className="mt-3 font-editorial text-4xl text-foreground">What they do</h2><div className="mt-7 border-t border-border">{salon.services.map((service, i) => { const rowContent = <><span className="flex items-center gap-4"><span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</span><span className="text-base text-foreground">{service.name}{service.durationMinutes ? ` — ${service.durationMinutes} min` : ''}</span></span><ArrowRight size={16} className="shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></>; return isClaimed ? <a key={service.id} href={salon.bookingUrl} className="group flex items-center justify-between gap-4 border-b border-border py-5" data-testid={`row-service-${service.id}`}>{rowContent}</a> : <button key={service.id} type="button" onClick={() => setInquiryOpen(true)} className="group flex w-full items-center justify-between gap-4 border-b border-border py-5 text-left" data-testid={`row-service-${service.id}`}>{rowContent}</button>; })}</div></section> : null}{salon.reviews?.length ? <section className="mt-16 border-t border-border pt-12"><p className="font-mono text-xs font-semibold uppercase tracking-[.15em] text-primary">Reviews</p><h2 className="mt-3 font-editorial text-4xl text-foreground">What people say</h2><div className="mt-7 grid gap-6 sm:grid-cols-2">{salon.reviews.map((review, i) => <div key={i} className="rounded-[3px] border border-border p-5" data-testid={`card-review-${i}`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-foreground">{review.author}</span>{review.rating != null && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary"><Star size={12} fill="currentColor" className="text-accent" /> {review.rating}</span>}</div>{(review.serviceName || review.staffName) && <p className="mt-1 text-xs text-muted-foreground">{[review.serviceName, review.staffName ? `with ${review.staffName}` : null].filter(Boolean).join(' · ')}</p>}{review.text && <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.text}</p>}</div>)}</div></section> : null}</div><aside className="h-fit rounded-[3px] bg-secondary p-7"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Visit</p><div className="mt-6 grid gap-5 text-sm"><div className="flex gap-3"><MapPin size={17} className="shrink-0 text-accent" /><span>{salon.address}<br />{salon.city}, {salon.state}</span></div>{salon.hours?.length ? <div className="flex gap-3"><Clock3 size={17} className="shrink-0 text-accent" /><div>{salon.hours.map((hour) => <div key={hour.day} className="flex justify-between gap-8"><span>{hour.day}</span><span className="text-muted-foreground">{hour.open}–{hour.close}</span></div>)}</div></div> : null}{salon.phone && <a href={`tel:${salon.phone}`} className="flex gap-3 text-primary" data-testid="link-salon-phone"><MessageCircle size={17} /> {salon.phone}</a>}</div><button onClick={() => setInquiryOpen(true)} className="mt-8 flex w-full items-center justify-center gap-2 border-t border-border pt-6 text-sm font-semibold text-primary" data-testid="button-inquire">Have a question? <ArrowUpRight size={15} /></button></aside></main>{salon.nearby?.length ? <section className="mx-auto max-w-[1320px] border-t border-border px-5 py-14 lg:px-10"><div className="flex items-center justify-between gap-4"><h2 className="font-display text-3xl text-primary">Nearby salons{salon.city ? ` in ${salon.city}` : ''}</h2>{salon.city && <Link href={`/listings/${toSlug(salon.city)}--${toSlug(stateNameFor(salon.state || ''))}`} className="flex items-center gap-1 text-sm font-semibold text-primary" data-testid="link-nearby-see-all">See all <ArrowRight size={14} /></Link>}</div><div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-6">{salon.nearby.map((n) => <FeaturedMarketplaceCard key={n.id} salon={n} saved={saved.includes(n.slug)} toggle={toggle} />)}</div></section> : null}{inquiryOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-primary/40 p-5" role="dialog" data-testid="dialog-inquiry"><div className="w-full max-w-[520px] rounded-[3px] bg-background p-7 shadow-2xl sm:p-10">{inquirySent ? <div className="py-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent text-primary"><Check /></div><h2 className="mt-6 font-display text-4xl text-primary">Message sent.</h2><p className="mt-3 text-sm text-muted-foreground">The salon will get back to you soon.</p><button onClick={() => { setInquiryOpen(false); setInquirySent(false); }} className="mt-7 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground" data-testid="button-close-inquiry-success">Done</button></div> : <><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Ask {salon.name}</p><h2 className="mt-3 font-display text-4xl text-primary">Start a conversation.</h2></div><button onClick={() => setInquiryOpen(false)} aria-label="Close inquiry" data-testid="button-close-inquiry"><X /></button></div><form onSubmit={sendInquiry} className="mt-8 grid gap-4"><input required name="name" placeholder="Your name" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-inquiry-name" /><input required type="email" name="email" placeholder="Email address" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-inquiry-email" /><textarea required name="message" placeholder="What would you like to know?" rows={4} className="resize-none border-b border-border bg-transparent px-1 py-3 text-sm outline-none" data-testid="input-inquiry-message" /><button disabled={inquiry.isPending} className="mt-3 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground" data-testid="button-send-inquiry">{inquiry.isPending ? 'Sending…' : 'Send message'}</button></form></>}</div></div>}</div>;
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

function DealsPage() {
  useEffect(() => {
    const title = 'Nail salon deals and offers — Certxa';
    const description = 'Limited-time nail salon deals, pedicure offers, and manicure savings from independent local salons.';
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
  }, []);
  const params = useMemo(() => ({ limit: 48 }), []);
  const { data, isLoading, isError, refetch } = useListDeals(params, { query: { queryKey: getListDealsQueryKey(params) } });
  const deals = data || [];
  return <div className="page-in mx-auto max-w-[1320px] px-5 py-14 lg:px-10 lg:py-20"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Limited time</p><h1 className="mt-4 font-display text-7xl tracking-[-.05em] text-primary">Nail salon deals and offers.</h1><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Real offers from independent salons, priced by the business — not marked up, not fabricated.</p><KeywordCluster page="deals" intro="Deal-focused searches:" limit={18} /><div className="mt-12">{isLoading ? <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4"><div className="skeleton aspect-[4/3] rounded-[6px]" /><div className="skeleton aspect-[4/3] rounded-[6px]" /><div className="skeleton hidden aspect-[4/3] rounded-[6px] md:block" /><div className="skeleton hidden aspect-[4/3] rounded-[6px] md:block" /></div> : isError ? <ErrorState onRetry={() => refetch()} label="We could not load deals just now." /> : deals.length ? <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">{deals.map((deal) => <DealGridCard key={deal.id} deal={deal} />)}</div> : <EmptyState title="No deals right now." copy="Check back soon — independent salons post new limited-time offers regularly." />}</div></div>;
}

let stripePromiseCache: { key: string; promise: Promise<Stripe | null> } | null = null;
function getStripePromise(publishableKey: string) {
  if (stripePromiseCache?.key === publishableKey) return stripePromiseCache.promise;
  const promise = loadStripe(publishableKey);
  stripePromiseCache = { key: publishableKey, promise };
  return promise;
}

const stripeAppearance = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: 'hsl(9 63% 58%)',
    colorBackground: 'hsl(35 42% 98%)',
    colorText: 'hsl(337 27% 20%)',
    colorDanger: 'hsl(4 65% 51%)',
    colorTextSecondary: 'hsl(337 15% 45%)',
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid hsl(31 24% 85%)', boxShadow: 'none' },
    '.Input:focus': { border: '1px solid hsl(9 63% 58%)', boxShadow: '0 0 0 1px hsl(9 63% 58%)' },
    '.Label': { color: 'hsl(337 27% 20%)', fontWeight: '600', fontSize: '13px' },
  },
};

function DealPaymentForm({ deal, quantity, onSuccess }: { deal: MarketplaceDealDetail; quantity: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${window.location.pathname}?checkout=success` },
      redirect: 'if_required',
    });
    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try again.');
      setSubmitting(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onSuccess();
    } else {
      setSubmitting(false);
    }
  };
  return <form onSubmit={submit} className="mt-4 grid gap-3" data-testid="form-deal-payment">
    <PaymentElement />
    <button type="submit" disabled={!stripe || submitting} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60" data-testid="button-confirm-payment">
      {submitting ? 'Processing…' : <>Pay {money(deal.dealPrice * quantity)} <ArrowRight size={16} /></>}
    </button>
    {error && <p className="text-xs text-destructive">{error}</p>}
  </form>;
}

function DealCheckoutPanel({ deal }: { deal: MarketplaceDealDetail }) {
  const checkout = useCheckoutDeal();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const soldOut = deal.availability === 'sold-out';
  const ended = deal.availability === 'expired' || deal.availability === 'archived';
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const phoneDigits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (phoneDigits.length !== 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    checkout.mutate({ id: deal.id, data: { customerEmail: email.trim(), customerName: name.trim() || undefined, customerPhone: phoneDigits, quantity } }, {
      onSuccess: (res) => {
        if (!res.publishableKey) { setError('Payments are not configured for this deal right now.'); return; }
        setSession({ clientSecret: res.clientSecret, publishableKey: res.publishableKey });
      },
      onError: () => setError('We could not start checkout just now. Please try again.'),
    });
  };
  if (soldOut) return <div className="mt-8 rounded-[6px] bg-secondary p-5 text-sm"><p className="font-semibold text-foreground">This deal is sold out.</p></div>;
  if (ended) return <div className="mt-8 rounded-[6px] bg-secondary p-5 text-sm"><p className="font-semibold text-foreground">This deal has ended.</p></div>;
  if (success) return <div className="mt-8 flex items-center gap-2.5 rounded-[6px] bg-accent/20 px-5 py-4 text-sm font-semibold text-primary" data-testid="status-checkout-success"><Check size={16} /> You're in! Check your email for your voucher code.</div>;
  if (session) {
    return <div className="mt-8 rounded-[6px] border border-border bg-card p-5" data-testid="panel-deal-payment">
      <p className="text-sm font-semibold text-foreground">{money(deal.dealPrice * quantity)} total for {quantity} {quantity === 1 ? 'voucher' : 'vouchers'}</p>
      <Elements stripe={getStripePromise(session.publishableKey)} options={{ clientSecret: session.clientSecret, appearance: stripeAppearance } as StripeElementsOptions}>
        <DealPaymentForm deal={deal} quantity={quantity} onSuccess={() => setSuccess(true)} />
      </Elements>
      <p className="mt-3 text-center text-xs text-muted-foreground">You'll pay Certxa securely via Stripe. Book with the salon after purchase — your voucher is redeemed when your appointment starts.</p>
    </div>;
  }
  return <form onSubmit={submit} className="mt-8 rounded-[6px] border border-border bg-card p-5" data-testid="form-deal-checkout">
    <p className="text-sm font-semibold text-foreground">{deal.spotsLeft} of {deal.capacity} left</p>
    <div className="mt-4 grid gap-3">
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-11 rounded-[4px] border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="input-checkout-email" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="h-11 rounded-[4px] border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="input-checkout-name" />
      <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile phone number" className="h-11 rounded-[4px] border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="input-checkout-phone" />
      <p className="-mt-1.5 text-xs text-muted-foreground">A mobile number that can receive SMS — this is how support can look up your purchase if you call in.</p>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Quantity
          <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-[4px] border border-border bg-background px-2 py-1.5 text-sm outline-none" data-testid="select-checkout-quantity">
            {Array.from({ length: Math.min(4, deal.spotsLeft) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-sm font-bold text-primary">{money(deal.dealPrice * quantity)} total</span>
      </div>
      <button type="submit" disabled={checkout.isPending} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60" data-testid="button-get-deal">
        {checkout.isPending ? 'Starting checkout…' : <>Continue to payment <ArrowRight size={16} /></>}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-center text-xs text-muted-foreground">You'll pay Certxa securely via Stripe. Book with the salon after purchase — your voucher is redeemed when your appointment starts.</p>
    </div>
  </form>;
}

function DealDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useGetDeal(id, { query: { queryKey: getGetDealQueryKey(id) } });
  const queryString = useSearch();
  const checkoutStatus = useMemo(() => new URLSearchParams(queryString).get('checkout'), [queryString]);
  useEffect(() => {
    if (!data) return;
    const title = `${data.title} — ${data.salon.name} | Certxa`;
    const description = data.description || `${data.title} at ${data.salon.name}.`;
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
  }, [data]);
  if (isLoading) return <div className="mx-auto max-w-[1200px] px-5 py-20"><div className="grid gap-10 md:grid-cols-[1.1fr_1fr]"><div className="skeleton aspect-[4/3] rounded-[7px]" /><div className="skeleton h-[420px] rounded-[7px]" /></div></div>;
  if (isError || !data) return <div className="mx-auto max-w-[900px] px-5 py-28"><ErrorState onRetry={() => refetch()} label="We could not find that deal. It may have ended." /></div>;
  return <div className="page-in mx-auto max-w-[1200px] px-5 pt-7 pb-20 lg:px-10"><Link href="/deals" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground" data-testid="link-deal-back">← All deals</Link>{checkoutStatus === 'success' && <div className="mt-6 flex items-center gap-2.5 rounded-[6px] bg-accent/20 px-5 py-4 text-sm font-semibold text-primary" data-testid="status-checkout-success"><Check size={16} /> You're in! Check your email for your voucher code.</div>}{checkoutStatus === 'cancelled' && <div className="mt-6 rounded-[6px] bg-secondary px-5 py-4 text-sm text-muted-foreground" data-testid="status-checkout-cancelled">Checkout was cancelled — no charge was made.</div>}<div className="mt-7 grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-start"><div className="relative aspect-[4/3] overflow-hidden rounded-2xl">{data.heroImage ? <img src={data.heroImage} alt={data.title} className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ backgroundImage: fallbackImages[data.id % fallbackImages.length] }} />}{data.discountPercent > 0 && <span className="absolute left-4 top-4 rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary shadow" data-testid="badge-deal-discount">{data.discountPercent}% off</span>}</div><div><p className="font-mono text-xs font-semibold uppercase tracking-[.15em] text-primary">{data.salon.name}{data.salon.city ? ` · ${data.salon.city}, ${data.salon.state}` : ''}</p><h1 className="mt-4 font-display text-5xl leading-[1.03] text-foreground sm:text-6xl" data-testid="text-deal-title">{data.title}</h1>{data.description && <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">{data.description}</p>}<div className="mt-7 flex items-end gap-3"><span className="font-display text-4xl text-primary">{money(data.dealPrice)}</span><span className="pb-1 text-lg text-muted-foreground line-through">{money(data.listPrice)}</span></div>{data.includes.length > 0 && <div className="mt-7 border-t border-border pt-6"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">What's included</p><ul className="mt-4 grid gap-2.5">{data.includes.map((item, i) => <li key={i} className="flex items-center gap-2.5 text-sm text-foreground"><Check size={14} className="text-primary" /> {item.name}{item.durationMinutes ? <span className="text-muted-foreground"> — {item.durationMinutes} min</span> : null}</li>)}</ul></div>}<div className="mt-6 space-y-2.5 border-t border-border pt-6 text-sm text-muted-foreground"><p className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 flex-shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Expires:</span> {data.expiryDays} days after purchase</span></p><p className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-primary" /><span><span className="font-semibold text-foreground">Cancellation policy:</span> {data.cancellationPolicy}</span></p></div><DealCheckoutPanel deal={data} /></div></div></div>;
}

const voucherStatusLabel: Record<WalletVoucher['status'], string> = {
  pending_booking: 'Not booked yet',
  booked: 'Booked',
  redeemed: 'Redeemed',
  expired: 'Expired',
  refunded: 'Refunded',
};

function VoucherCard({ voucher }: { voucher: WalletVoucher }) {
  const [showCode, setShowCode] = useState(false);
  return <div className="rounded-[6px] border border-border bg-card p-5" data-testid={`card-voucher-${voucher.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">{voucher.salon.name}{voucher.salon.city ? ` · ${voucher.salon.city}` : ''}</p>
        <h3 className="mt-1 font-display text-xl text-primary">{voucher.deal.title}</h3>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${voucher.status === 'redeemed' ? 'bg-accent/25 text-primary' : voucher.status === 'expired' || voucher.status === 'refunded' ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{voucherStatusLabel[voucher.status]}</span>
    </div>
    <button type="button" onClick={() => setShowCode((v) => !v)} className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary" data-testid={`button-toggle-code-${voucher.id}`}>
      {showCode ? 'Hide code & QR' : 'Show code & QR'} <ChevronDown size={14} className={showCode ? 'rotate-180 transition' : 'transition'} />
    </button>
    {showCode && <div className="mt-4 flex items-center gap-5 rounded-[4px] bg-secondary p-4">
      <QRCodeCanvas value={voucher.code} size={88} />
      <div>
        <p className="font-mono text-lg font-bold tracking-wide text-primary" data-testid={`text-voucher-code-${voucher.id}`}>{voucher.code}</p>
        <p className="mt-1 text-xs text-muted-foreground">Show this to the salon when your appointment starts.</p>
      </div>
    </div>}
    <p className="mt-3 text-xs text-muted-foreground">Expires {new Date(voucher.expiresAt).toLocaleDateString()}</p>
  </div>;
}

function WalletPage() {
  const queryString = useSearch();
  const token = useMemo(() => new URLSearchParams(queryString).get('token') || '', [queryString]);
  useEffect(() => {
    document.title = 'My vouchers — Certxa';
    setMeta('description', 'View your purchased Certxa deal vouchers.');
  }, []);
  const { data: vouchers, isLoading, isError } = useGetMyVouchers(token, { query: { queryKey: getMyVouchersQueryKey(token) } });
  const requestLink = useRequestWalletLink();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    requestLink.mutate(email.trim(), { onSuccess: () => setSent(true) });
  };

  if (!token || isError) {
    return <div className="page-in mx-auto max-w-[520px] px-5 py-20 lg:py-28"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Your vouchers</p><h1 className="mt-4 font-display text-5xl tracking-[-.04em] text-primary">My vouchers.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{isError ? "That link has expired. Enter your email and we'll send a fresh one." : "Enter the email you used to buy a deal, and we'll email you a link to view your vouchers."}</p>{sent ? <div className="mt-8 rounded-[6px] bg-secondary p-5 text-sm text-foreground" data-testid="status-wallet-link-sent"><Check size={16} className="mb-2 text-primary" /> Check your email for a link to your vouchers.</div> : <form onSubmit={submit} className="mt-8 grid gap-3" data-testid="form-wallet-request"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-12 rounded-[4px] border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="input-wallet-email" /><button type="submit" disabled={requestLink.isPending} className="h-12 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60" data-testid="button-wallet-request">{requestLink.isPending ? 'Sending…' : 'Email me my vouchers'}</button></form>}</div>;
  }

  return <div className="page-in mx-auto max-w-[720px] px-5 py-14 lg:py-20"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Your vouchers</p><h1 className="mt-4 font-display text-5xl tracking-[-.04em] text-primary">My vouchers.</h1>{isLoading ? <div className="mt-10 grid gap-4"><div className="skeleton h-32 rounded-[6px]" /><div className="skeleton h-32 rounded-[6px]" /></div> : vouchers?.length ? <div className="mt-10 grid gap-4">{vouchers.map((v) => <VoucherCard key={v.id} voucher={v} />)}</div> : <div className="mt-10"><EmptyState title="No vouchers yet." copy="When you buy a deal, it will show up here." /></div>}</div>;
}

function ForBusinessPage() {
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(false);
  const inquiry = useCreateBusinessInquiry();
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setSendError(false); const form = new FormData(e.currentTarget); inquiry.mutate({ name: String(form.get('name')), email: String(form.get('email')), message: String(form.get('message')) }, { onSuccess: () => setSent(true), onError: () => setSendError(true) }); };
  return <div className="page-in"><section className="relative overflow-hidden bg-primary text-primary-foreground"><div className="absolute right-[-8%] top-[-25%] h-[580px] w-[580px] rounded-full border-[80px] border-accent/20" /><div className="relative mx-auto max-w-[1320px] px-5 py-24 lg:px-10 lg:py-32"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-accent">For independent salon owners</p><h1 className="mt-7 max-w-4xl font-display text-[clamp(4rem,9vw,8.3rem)] leading-[.83] tracking-[-.06em]">Salon management software<br /><em>for local growth.</em></h1><p className="mt-9 max-w-lg text-lg leading-7 text-primary-foreground/70">Certxa puts thoughtful local businesses in front of people who care where they book.</p><KeywordCluster page="business" intro="Owner-focused discovery terms:" limit={14} /></div></section><main className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10"><div className="grid gap-10 border-b border-border pb-20 md:grid-cols-3"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Why Certxa</p><h2 className="mt-4 font-display text-5xl leading-[.92] text-primary">Stay independent. Get found.</h2></div><div className="grid gap-8 text-sm leading-6 text-muted-foreground md:col-span-2 md:grid-cols-3"><div><Store size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">A proper presence</h3><p className="mt-2">A beautiful public profile that reflects how your business actually feels.</p></div><div><Search size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">Local discovery</h3><p className="mt-2">Show up for the services and neighborhoods your best clients are searching.</p></div><div><CalendarDays size={20} className="text-accent" /><h3 className="mt-5 font-semibold text-primary">Better-fit bookings</h3><p className="mt-2">Receive clear requests from people already aligned with your point of view.</p></div></div></div><section className="grid gap-12 py-20 lg:grid-cols-[1fr_440px]"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Come say hello</p><h2 className="mt-5 font-display text-6xl leading-[.88] text-primary">Let's put your<br /><em>place on the map.</em></h2><p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">Tell us a little about your salon. We'll be in touch with the next step, no pitch deck required.</p></div>{sent ? <div className="flex flex-col justify-center rounded-[3px] bg-secondary p-9" data-testid="status-inquiry-success"><Check size={24} className="text-accent" /><h3 className="mt-5 font-display text-4xl text-primary">We'll be in touch.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Thanks for raising your hand. A real person from Certxa will follow up soon.</p></div> : <form onSubmit={submit} className="grid gap-4 rounded-[3px] border border-border bg-card p-7"><input required name="name" placeholder="Your name" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-business-name" /><input required type="email" name="email" placeholder="Email address" className="h-12 border-b border-border bg-transparent px-1 text-sm outline-none" data-testid="input-business-email" /><textarea required name="message" placeholder="Tell us about your salon" rows={5} className="resize-none border-b border-border bg-transparent px-1 py-3 text-sm outline-none" data-testid="input-business-message" /><button disabled={inquiry.isPending} className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground" data-testid="button-business-submit">{inquiry.isPending ? 'Sending…' : 'Start the conversation'}</button>{sendError && <p className="text-xs text-destructive" data-testid="status-business-error">We could not send that just now. Please email hello@certxa.com instead.</p>}</form>}</section></main></div>;
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
  return <div className="page-in mx-auto max-w-[1200px] px-5 py-14 lg:px-10 lg:py-20"><Link href="/" className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">← All states</Link><h1 className="mt-4 font-display text-6xl tracking-[-.045em] text-primary">Nail salons in {data.name}</h1><p className="mt-3 text-sm text-muted-foreground">{data.count.toLocaleString()} {data.count === 1 ? 'salon' : 'salons'} across {data.cities.length} {data.cities.length === 1 ? 'city' : 'cities'}.</p><KeywordCluster page="listings" intro="Popular local searches:" limit={16} /><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{data.cities.map((city) => <Link key={city.slug} href={`/listings/${city.slug}--${stateSlug}`} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-4 py-3 text-sm transition hover:border-primary" data-testid={`link-city-${city.slug}`}><span className="font-semibold text-primary">{city.name}</span><span className="text-xs text-muted-foreground">{city.count.toLocaleString()}</span></Link>)}</div></div>;
}

function CityListingsView({ citySlug, stateSlug }: { citySlug: string; stateSlug: string }) {
  const { data, isLoading, isError, refetch } = useGetCityListing(citySlug, stateSlug, { query: { queryKey: getCityListingQueryKey(citySlug, stateSlug) } });
  if (isLoading) return <div className="mx-auto max-w-[1200px] px-5 py-20"><SalonSkeletons count={6} /></div>;
  if (isError || !data) return <div className="mx-auto max-w-[900px] px-5 py-28"><ErrorState onRetry={() => refetch()} label="We could not find that city." /></div>;
  return <div className="page-in mx-auto max-w-[1200px] px-5 py-14 lg:px-10 lg:py-20"><Link href={`/listings/${stateSlug}`} className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">← {data.stateName}</Link><h1 className="mt-4 font-display text-6xl tracking-[-.045em] text-primary">Nail salons in {data.cityName}</h1><p className="mt-3 text-sm text-muted-foreground">{data.salons.length.toLocaleString()} {data.salons.length === 1 ? 'salon' : 'salons'}.</p><KeywordCluster page="listings" intro="Popular local searches:" limit={14} /><div className="mt-10 grid gap-3">{data.salons.map((salon) => <Link key={salon.id} href={`/${salon.slug}`} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-5 py-4 transition hover:border-primary" data-testid={`link-listing-salon-${salon.id}`}><div><p className="font-semibold text-primary">{salon.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{salon.description}</p></div>{salon.rating > 0 && <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary"><Star size={13} fill="currentColor" className="text-accent" /> {salon.rating.toFixed(1)}</span>}</Link>)}</div></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/search" component={SearchPage} /><Route path="/saved" component={SavedPage} /><Route path="/for-business" component={ForBusinessPage} /><Route path="/listings/:param" component={ListingsPage} /><Route path="/deals" component={DealsPage} /><Route path="/deals/:id" component={DealDetailPage} /><Route path="/wallet" component={WalletPage} /><Route path="/:slug" component={ProfilePage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
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
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter ssrPath={ssrPath} ssrSearch={ssrSearch} ssrContext={ssrContext}><SeoManager /><AppShell /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

function AppShell() {
  const [location] = useLocation();
  const isSearchPage = location.split('?')[0] === '/search';
  return <div className="site-grain min-h-[100dvh]"><Header /><Router />{!isSearchPage && <Footer />}</div>;
}
