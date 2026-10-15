/**
 * The salon directory under /salons (plans/salon-directory.md): every state,
 * a state, a city, how the directory works, and the "Remove this listing"
 * form used on salon pages. Listings come from state license records; the
 * SSR entry renders the same pages with the same head (lib/directoryHead.ts).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'wouter';
import {
  getCityListingQueryKey,
  getDirectoryStatesQueryKey,
  getStateListingQueryKey,
  useGetCityListing,
  useGetDirectoryStates,
  useGetStateListing,
  useRequestRemoval,
  type Salon,
} from '@/lib/api';
import { cityHead, citySummary, directoryAboutHead, directoryRootHead, stateHead, type DirectoryHead } from '@/lib/directoryHead';

// ── Head (browser side; the SSR entry sends the same values) ────────────────

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function useDirectoryHead(head: DirectoryHead | null, path: string | undefined) {
  useEffect(() => {
    if (!head || !path) return;
    document.title = head.title;
    setMetaTag('name', 'description', head.description);
    setMetaTag('name', 'robots', head.robots);
    setMetaTag('property', 'og:title', head.title);
    setMetaTag('property', 'og:description', head.description);
    setMetaTag('name', 'twitter:title', head.title);
    setMetaTag('name', 'twitter:description', head.description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${path}`;
  }, [head?.title, head?.description, head?.robots, path]);
}

// ── Shared bits ──────────────────────────────────────────────────────────────

const page = 'page-in mx-auto max-w-[1200px] px-5 py-14 lg:px-10 lg:py-20';
const back = 'font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground';
const h1 = 'mt-4 font-display text-5xl tracking-[-.04em] text-primary sm:text-6xl';

function Loading() {
  return <div className="mx-auto max-w-[1200px] px-5 py-20" data-testid="state-directory-loading"><div className="skeleton h-10 w-2/3 rounded" /><div className="mt-6 skeleton h-5 w-1/2 rounded" /><div className="mt-10 grid gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-[3px]" />)}</div></div>;
}

function NotFoundState({ label }: { label: string }) {
  return <div className="mx-auto max-w-[900px] px-5 py-28 text-center"><p className="text-lg text-foreground">{label}</p><Link href="/salons" className="mt-6 inline-block text-sm font-semibold text-primary underline">See all states</Link></div>;
}

function LicenseNote({ license }: { license?: { board: string; verifyUrl: string } }) {
  if (!license) return null;
  return <p className="mt-3 text-sm text-muted-foreground">Licenses come from the {license.board}. <a href={license.verifyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Check a license with the state</a></p>;
}

function HowItWorksLink() {
  return <p className="mt-14 border-t border-border pt-6 text-sm text-muted-foreground">Listings come from state license records. <Link href="/salons/about" className="font-semibold text-primary underline">How this directory works</Link></p>;
}

function SalonRow({ salon }: { salon: Salon }) {
  return <Link href={salon.url} className="flex items-center justify-between gap-4 rounded-[3px] border border-border bg-card px-5 py-4 transition hover:border-primary" data-testid={`link-directory-salon-${salon.id}`}>
    <div>
      <p className="font-semibold text-primary">{salon.name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{[salon.street, salon.city].filter(Boolean).join(', ')}</p>
    </div>
    <span className="shrink-0 text-right text-xs text-muted-foreground">{salon.featured ? 'Books on Certxa' : salon.licensed ? 'Licensed' : ''}</span>
  </Link>;
}

// ── /salons ──────────────────────────────────────────────────────────────────

export function DirectoryHomePage() {
  const { data, isLoading } = useGetDirectoryStates({ query: { queryKey: getDirectoryStatesQueryKey() } });
  useDirectoryHead(data ? directoryRootHead(data) : null, '/salons');
  if (isLoading) return <Loading />;
  if (!data) return <NotFoundState label="The directory could not be loaded just now." />;
  const total = data.reduce((sum, s) => sum + s.count, 0);
  return <div className={page}>
    <h1 className={h1}>Licensed nail salons by state</h1>
    <p className="mt-4 max-w-3xl text-lg leading-7 text-muted-foreground">{total.toLocaleString()} nail salons with a current state license, in {data.length} {data.length === 1 ? 'state' : 'states'}. Salons that book on Certxa show their menu, prices and open times.</p>
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{data.map((s) => <Link key={s.code} href={s.url} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-4 py-3 text-sm transition hover:border-primary" data-testid={`link-state-${s.slug}`}><span className="font-semibold text-primary">{s.name}</span><span className="text-xs text-muted-foreground">{s.count.toLocaleString()}</span></Link>)}</div>
    <HowItWorksLink />
  </div>;
}

// ── /salons/about ────────────────────────────────────────────────────────────

export function DirectoryAboutPage() {
  useDirectoryHead(directoryAboutHead(), '/salons/about');
  const section = 'mt-10';
  const h2 = 'font-display text-3xl text-primary';
  const p = 'mt-3 max-w-3xl leading-7 text-muted-foreground';
  return <div className={page}>
    <Link href="/salons" className={back}>← All states</Link>
    <h1 className={h1}>How the Certxa salon directory works</h1>
    <section className={section}><h2 className={h2}>Where the listings come from</h2><p className={p}>Every salon in the directory holds a current establishment license from its state board: the Texas Department of Licensing and Regulation, the California Board of Barbering and Cosmetology, and the Florida Department of Business and Professional Regulation. We import their public license records and keep a salon only while its license is current. A salon counts as a nail salon when its name says so, when it holds a manicurist-establishment license, or when it matches a nail salon we already list at the same address.</p></section>
    <section className={section}><h2 className={h2}>What each listing shows</h2><p className={p}>Every listing shows the salon's name, address, phone number where the state publishes one, and its license number, status and expiry date, with a link to check the license with the state. Salons that run on Certxa also show their own service menu, prices, opening hours and online booking, all supplied by the salon itself. We don't copy ratings, reviews, hours or descriptions from other websites, and we don't write descriptions on a salon's behalf.</p></section>
    <section className={section}><h2 className={h2}>Reviews</h2><p className={p}>The only reviews in the directory are left by clients after a completed appointment booked through Certxa. A star rating appears once a salon has at least three of them.</p></section>
    <section className={section}><h2 className={h2}>How listings are kept up to date</h2><p className={p}>License records are re-imported regularly. When a state no longer lists a salon's license as current, the salon leaves the directory. Each listing shows when its license was last checked.</p></section>
    <section className={section}><h2 className={h2}>Removing a listing</h2><p className={p}>Anyone can ask for a listing to be removed with the "Remove this listing" link on the salon's page. It is hidden straight away. Questions go to <a href="mailto:support@certxa.com" className="font-semibold text-primary underline">support@certxa.com</a>.</p></section>
    <section className={section}><h2 className={h2}>Salon owners</h2><p className={p}>A salon that runs on Certxa gets a full page: live menu and prices, open times, online booking and verified client reviews. <Link href="/for-business" className="font-semibold text-primary underline">Learn about Certxa for salons</Link></p></section>
  </div>;
}

// ── /salons/:state ───────────────────────────────────────────────────────────

export function StateDirectoryPage() {
  const { state = '' } = useParams<{ state: string }>();
  const { data, isLoading } = useGetStateListing(state, { query: { queryKey: getStateListingQueryKey(state) } });
  useDirectoryHead(data ? stateHead(data) : null, data?.url);
  if (isLoading) return <Loading />;
  if (!data) return <NotFoundState label="We couldn't find that state in the directory." />;
  return <div className={page}>
    <Link href="/salons" className={back}>← All states</Link>
    <h1 className={h1}>Licensed nail salons in {data.name}</h1>
    <p className="mt-4 max-w-3xl text-lg leading-7 text-muted-foreground">{data.count.toLocaleString()} nail salons with a current license, in {data.cities.length.toLocaleString()} {data.name} {data.cities.length === 1 ? 'city' : 'cities'}.</p>
    <LicenseNote license={data.license} />
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{data.cities.map((city) => <Link key={city.slug} href={city.url} className="flex items-center justify-between rounded-[3px] border border-border bg-card px-4 py-3 text-sm transition hover:border-primary" data-testid={`link-city-${city.slug}`}><span className="font-semibold text-primary">{city.name}</span><span className="text-xs text-muted-foreground">{city.count.toLocaleString()}</span></Link>)}</div>
    <HowItWorksLink />
  </div>;
}

// ── /salons/:state/:city ─────────────────────────────────────────────────────

export function CityDirectoryPage() {
  const { state = '', city = '' } = useParams<{ state: string; city: string }>();
  const { data, isLoading } = useGetCityListing(city, state, { query: { queryKey: getCityListingQueryKey(city, state) } });
  useDirectoryHead(data ? cityHead(data) : null, data?.url);
  if (isLoading) return <Loading />;
  if (!data) return <NotFoundState label="We couldn't find that city in the directory." />;
  const booking = data.salons.filter((s) => s.featured);
  const others = data.salons.filter((s) => !s.featured);
  return <div className={page}>
    <Link href={data.stateUrl} className={back}>← {data.stateName}</Link>
    <h1 className={h1}>Nail salons in {data.cityName}, {data.stateName}</h1>
    <p className="mt-4 max-w-3xl text-lg leading-7 text-muted-foreground" data-testid="text-city-summary">{citySummary(data)}</p>
    <LicenseNote license={data.license} />
    {booking.length > 0 && <section className="mt-10"><h2 className="font-display text-3xl text-primary">Book online</h2><div className="mt-5 grid gap-3">{booking.map((s) => <SalonRow key={s.id} salon={s} />)}</div></section>}
    <section className="mt-10"><h2 className="font-display text-3xl text-primary">{booking.length ? 'More licensed salons' : 'Licensed salons'}</h2><div className="mt-5 grid gap-3">{others.map((s) => <SalonRow key={s.id} salon={s} />)}</div></section>
    <HowItWorksLink />
  </div>;
}

// ── "Remove this listing" (on a salon's page) ────────────────────────────────

export function RemoveListing({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const removal = useRequestRemoval();
  if (removal.isSuccess) {
    return <p className="mt-6 text-sm text-muted-foreground" data-testid="text-removal-done">This listing has been removed. If that was a mistake, email support@certxa.com.</p>;
  }
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-6 text-sm text-muted-foreground underline" data-testid="button-remove-listing">Remove this listing</button>;
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    removal.mutate({ slug, data: {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      relationship: String(form.get('relationship') || ''),
      reason: String(form.get('reason') || ''),
    } });
  };
  const input = 'mt-1 w-full rounded-[3px] border border-border bg-background px-3 py-2 text-sm';
  return <form onSubmit={submit} className="mt-6 max-w-lg rounded-[3px] border border-border p-5" data-testid="form-remove-listing">
    <p className="font-semibold text-foreground">Remove {name} from the directory</p>
    <p className="mt-1 text-sm text-muted-foreground">The listing is hidden as soon as you send this.</p>
    <label className="mt-4 block text-sm">Your name<input name="name" required minLength={2} className={input} /></label>
    <label className="mt-3 block text-sm">Email<input name="email" type="email" required className={input} /></label>
    <label className="mt-3 block text-sm">Your connection to the salon<select name="relationship" className={input} defaultValue="Owner"><option>Owner</option><option>Manager</option><option>Staff</option><option>Other</option></select></label>
    <label className="mt-3 block text-sm">Reason (optional)<textarea name="reason" rows={3} className={input} /></label>
    {removal.isError && <p className="mt-3 text-sm text-destructive">That didn't go through. Please check your details or email support@certxa.com.</p>}
    <div className="mt-4 flex gap-3"><button type="submit" disabled={removal.isPending} className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background">Remove listing</button><button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground underline">Cancel</button></div>
  </form>;
}
