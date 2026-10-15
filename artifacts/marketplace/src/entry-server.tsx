import { renderToString } from 'react-dom/server';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { SsrContext } from 'wouter';

import App from './App';
import {
  setApiBaseUrl,
  getFeaturedSalons, getGetFeaturedSalonsQueryKey,
  getSalonBySlug, getGetSalonBySlugQueryKey,
  getStateListing, getStateListingQueryKey,
  getCityListing, getCityListingQueryKey,
  getGeoCityQueryKey,
  listDeals, getListDealsQueryKey,
  getDeal, getGetDealQueryKey,
  getDirectoryStates, getDirectoryStatesQueryKey,
  type SalonProfile, type GeoCity, type MarketplaceDealDetail,
} from '@/lib/api';
import { cityHead, citySummary, directoryAboutHead, directoryRootHead, salonHead, stateHead, type DirectoryHead } from '@/lib/directoryHead';

export interface RenderResult {
  html: string;
  headTags: string;
  statusCode: number;
  redirectTo?: string;
  dehydratedState: unknown;
}

const SITE_NAME = 'Certxa';

// getSalonBySlug() rejects with a plain Error("API 404: <json body>") on a
// 404 — when the API found a cleaned-up-slug redirect (see
// scripts/regenerate-promo-slugs.ts), that JSON body carries a `redirectTo`
// field. Parsed from the error message rather than a richer return type so
// the success path (every other caller of getSalonBySlug) stays untouched.
function parseRedirectSlug(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  try {
    const body = JSON.parse(err.message.replace(/^API \d+:\s*/, ''));
    return typeof body?.redirectTo === 'string' ? body.redirectTo : null;
  } catch {
    return null;
  }
}


/** "9:00 AM" -> "09:00" (24-hour, for schema.org openingHoursSpecification). Returns null if unparseable/closed. */
function to24Hour(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'AM' && h === 12) h = 0;
  else if (ampm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
}

// Derives a schema.org priceRange ("$".."$$$$") from a salon's own real,
// priced service list (the average price of what they actually charge) —
// never a flat constant, so it's always backed by real data.
function priceRangeFromServices(services: { price: number }[]): string | null {
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  if (!prices.length) return null;
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  if (avg < 25) return '$';
  if (avg < 50) return '$$';
  if (avg < 100) return '$$$';
  return '$$$$';
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function baseHead(title: string, description: string, canonical: string, robots = 'index, follow'): string {
  return `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">`;
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/**
 * Per-request server render. Prefetches real data (via the same plain fetch
 * functions the client hooks wrap) for the three SEO-critical page types —
 * home, listings, salon profile — and computes real <head> tags/JSON-LD from
 * that data synchronously, before renderToString ever runs. /search, /saved,
 * /for-business still render a real shell (via wouter's SSR path) without a
 * data prefetch — they're not pages that need to rank or be cited.
 */
export async function render(url: string, apiOrigin: string, publicOrigin: string, geo: GeoCity | null = null): Promise<RenderResult> {
  setApiBaseUrl(apiOrigin);
  const queryClient = new QueryClient();
  const [rawPathname, search = ''] = url.split('?');
  const pathname = rawPathname === '' ? '/' : rawPathname;
  const canonicalPath = pathname === '/' ? '/' : pathname;
  const canonical = `${publicOrigin}${canonicalPath}`;
  let headTags = '';
  let statusCode = 200;
  let redirectTo: string | undefined;

  try {
    if (pathname === '/') {
      queryClient.setQueryData(getGeoCityQueryKey(), geo);
      const featuredParams = geo ? { citySlug: geo.citySlug, stateSlug: geo.stateSlug } : {};
      const featured = await getFeaturedSalons(featuredParams);
      queryClient.setQueryData(getGetFeaturedSalonsQueryKey(featuredParams), featured);
      headTags = baseHead(
        `Nail salon deals near you — ${SITE_NAME}`,
        geo
          ? `Limited-time nail care deals and independent nail salons in ${geo.city}, ${geo.state}, curated by Certxa.`
          : 'Shop limited-time nail care deals and discover independent nail salons near you, curated by Certxa.',
        canonical,
      );
      headTags += jsonLdScript([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          // Same @id + sameAs set as php/includes/header.php's Organization
          // node — the two halves of the site used to declare two
          // non-overlapping sameAs arrays with no shared @id, which meant
          // AI entity resolution saw two different "Certxa" organizations.
          // Reddit is deliberately omitted: the linked account has no
          // independently-verifiable activity.
          '@id': `${publicOrigin}/#organization`,
          name: SITE_NAME,
          url: publicOrigin,
          description: 'Certxa is a considered local guide to independent salons, studios, and beauty people worth knowing.',
          logo: {
            '@type': 'ImageObject',
            url: `${publicOrigin}/assets/images/logo.png`,
            width: 512,
            height: 512,
          },
          foundingDate: '2026-02-01',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '2325 E Camelback Rd, Ste 400',
            addressLocality: 'Phoenix',
            addressRegion: 'AZ',
            postalCode: '85016',
            addressCountry: 'US',
          },
          sameAs: [
            'https://x.com/certxa',
            'https://www.facebook.com/certxa',
            'https://www.instagram.com/certxa',
            'https://www.bbb.org/us/az/phoenix/profile/software-consultants/certxa-llc-1126-1000175065',
            'https://www.linkedin.com/company/certxa',
            'https://www.g2.com/products/certxa-booking-software',
            'https://www.capterra.com/p/10182349/Certxa-Booking-Software/',
            'https://www.producthunt.com/products/certxa',
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': `${publicOrigin}/#website`,
          name: SITE_NAME,
          url: publicOrigin,
          publisher: { '@id': `${publicOrigin}/#organization` },
          potentialAction: {
            '@type': 'SearchAction',
            target: `${publicOrigin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ]);
    } else if (pathname === '/salons' || pathname.startsWith('/salons/')) {
      // The directory (plans/salon-directory.md): /salons, /salons/about,
      // /salons/{state}, /salons/{state}/{city}, /salons/{state}/{city}/{salon}.
      const seg = pathname.split('/').filter(Boolean).slice(1).map((p) => decodeURIComponent(p));
      const crumbs = (items: Array<{ name: string; path?: string }>) => ({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Salons', path: '/salons' }, ...items].map((c, i) => ({
          '@type': 'ListItem', position: i + 1, name: c.name, ...(c.path ? { item: `${publicOrigin}${c.path}` } : {}),
        })),
      });
      const head = (h: DirectoryHead) => baseHead(h.title, h.description, canonical, h.robots);
      const notFound = () => {
        statusCode = 404;
        headTags = baseHead('Not in the directory | Certxa', 'That page is not in the Certxa salon directory.', canonical, 'noindex, follow');
      };
      try {
        if (seg.length === 0) {
          const states = await getDirectoryStates();
          queryClient.setQueryData(getDirectoryStatesQueryKey(), states);
          headTags = head(directoryRootHead(states)) + jsonLdScript([{
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Licensed nail salons by state',
            url: canonical,
            isPartOf: { '@id': `${publicOrigin}/#website` },
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: states.length,
              itemListElement: states.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${publicOrigin}${s.url}` })),
            },
          }]);
        } else if (seg.length === 1 && seg[0] === 'about') {
          headTags = head(directoryAboutHead()) + jsonLdScript([
            { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'How the Certxa salon directory works', url: canonical,
              isPartOf: { '@id': `${publicOrigin}/#website` }, publisher: { '@id': `${publicOrigin}/#organization` } },
            crumbs([{ name: 'How this directory works' }]),
          ]);
        } else if (seg.length === 1) {
          const state = await getStateListing(seg[0]);
          queryClient.setQueryData(getStateListingQueryKey(seg[0]), state);
          if (state.url !== pathname) { statusCode = 301; redirectTo = state.url; }
          headTags = head(stateHead(state)) + jsonLdScript([
            crumbs([{ name: state.name }]),
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Licensed nail salons in ${state.name}`,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: state.cities.length,
                itemListElement: state.cities.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, url: `${publicOrigin}${c.url}` })),
              },
            },
          ]);
        } else if (seg.length === 2) {
          const city = await getCityListing(seg[1], seg[0]);
          queryClient.setQueryData(getCityListingQueryKey(seg[1], seg[0]), city);
          if (city.url !== pathname) { statusCode = 301; redirectTo = city.url; }
          headTags = head(cityHead(city)) + jsonLdScript([
            crumbs([{ name: city.stateName, path: city.stateUrl }, { name: city.cityName }]),
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Nail salons in ${city.cityName}, ${city.stateName}`,
              description: citySummary(city),
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: city.salons.length,
                itemListElement: city.salons.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${publicOrigin}${s.url}` })),
              },
            },
          ]);
        } else if (seg.length === 3) {
          const slug = seg[2];
          const salon: SalonProfile = await getSalonBySlug(slug);
          queryClient.setQueryData(getGetSalonBySlugQueryKey(slug), salon);
          if (salon.url !== pathname) { statusCode = 301; redirectTo = salon.url; }
          const salonUrl = `${publicOrigin}${salon.url}`;
          const openingHours = (salon.hours || [])
            .map((h) => {
              const opens = to24Hour(h.open);
              const closes = to24Hour(h.close);
              if (!opens || !closes) return null;
              return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${h.day}`, opens, closes };
            })
            .filter((h): h is NonNullable<typeof h> => h !== null);
          const priceRange = salon.services?.length ? priceRangeFromServices(salon.services) : null;
          const jsonLd: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'NailSalon',
            '@id': `${salonUrl}#salon`,
            name: salon.name,
            url: salonUrl,
            description: salon.description,
            ...(salon.phone ? { telephone: salon.phone } : {}),
            address: {
              '@type': 'PostalAddress',
              ...(salon.street ? { streetAddress: salon.street } : {}),
              addressLocality: salon.city,
              addressRegion: salon.state,
              addressCountry: 'US',
            },
            ...(salon.latitude != null && salon.longitude != null
              ? { geo: { '@type': 'GeoCoordinates', latitude: salon.latitude, longitude: salon.longitude } }
              : {}),
            ...(openingHours.length ? { openingHoursSpecification: openingHours } : {}),
            // The state license shown on the page.
            ...(salon.license ? { hasCredential: {
              '@type': 'EducationalOccupationalCredential',
              credentialCategory: 'license',
              name: 'Salon establishment license',
              identifier: salon.license.number,
              ...(salon.license.expires ? { expires: salon.license.expires } : {}),
              recognizedBy: { '@type': 'GovernmentOrganization', name: salon.license.board },
            } } : {}),
            // Certxa's own reviews only, shown on the page (salonApi.ts), on a salon that books on Certxa.
            ...(salon.bookingUrl && salon.rating > 0 && salon.reviewCount > 0
              ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: salon.rating, reviewCount: salon.reviewCount } }
              : {}),
            ...(salon.services?.length
              ? { makesOffer: salon.services.map((sv) => ({ '@type': 'Offer', name: sv.name, price: sv.price, priceCurrency: 'USD' })) }
              : {}),
            ...(priceRange ? { priceRange } : {}),
          };
          const trail: Array<{ name: string; path?: string }> = [];
          if (salon.stateUrl) trail.push({ name: salon.state, path: salon.stateUrl });
          if (salon.cityUrl && salon.city) trail.push({ name: salon.city, path: salon.cityUrl });
          trail.push({ name: salon.name });
          headTags = head(salonHead(salon)) + jsonLdScript([jsonLd, crumbs(trail)]);
        } else {
          notFound();
        }
      } catch (err) {
        const redirectSlug = seg.length === 3 ? parseRedirectSlug(err) : null;
        if (redirectSlug) {
          statusCode = 301;
          redirectTo = `/${redirectSlug}`; // the /:slug fallback sends it on to its /salons page
        } else {
          notFound();
        }
      }
    } else if (pathname === '/deals') {
      const deals = await listDeals({ limit: 48 });
      queryClient.setQueryData(getListDealsQueryKey({ limit: 48 }), deals);
      headTags = baseHead(
        `Deals | ${SITE_NAME}`,
        'Limited-time deals from independent salons near you. Real offers from real businesses, no fine print surprises.',
        canonical,
      );
      if (deals.length) {
        headTags += jsonLdScript([{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Deals — ${SITE_NAME}`,
          numberOfItems: deals.length,
          itemListElement: deals.map((d, i) => ({
            '@type': 'ListItem', position: i + 1, name: d.title,
            url: `${publicOrigin}/deals/${d.id}`,
          })),
        }]);
      }
    } else if (pathname.startsWith('/deals/')) {
      const id = pathname.slice('/deals/'.length);
      try {
        const deal: MarketplaceDealDetail = await getDeal(id);
        queryClient.setQueryData(getGetDealQueryKey(id), deal);
        headTags = baseHead(
          `${deal.title} — ${deal.salon.name} | ${SITE_NAME}`,
          deal.description || `${deal.title} at ${deal.salon.name}.`,
          canonical,
        );
        headTags += jsonLdScript([
          {
            '@context': 'https://schema.org',
            '@type': 'Offer',
            name: deal.title,
            description: deal.description || undefined,
            price: deal.dealPrice,
            priceCurrency: 'USD',
            availability: deal.availability === 'active'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/SoldOut',
            url: canonical,
            // A LocalBusiness (BeautySalon) requires an address to validate —
            // name alone isn't enough. Real data only: address/phone are
            // omitted individually when the store hasn't set them, and the
            // whole address block is left out if there's nothing real to put
            // in it, rather than asserting an incomplete PostalAddress.
            seller: {
              '@type': 'BeautySalon',
              name: deal.salon.name,
              ...(deal.salon.address || deal.salon.city || deal.salon.state
                ? { address: {
                    '@type': 'PostalAddress',
                    ...(deal.salon.address ? { streetAddress: deal.salon.address } : {}),
                    ...(deal.salon.city ? { addressLocality: deal.salon.city } : {}),
                    ...(deal.salon.state ? { addressRegion: deal.salon.state } : {}),
                    addressCountry: 'US',
                  } }
                : {}),
              ...(deal.salon.phone ? { telephone: deal.salon.phone } : {}),
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
              { '@type': 'ListItem', position: 2, name: 'Deals', item: `${publicOrigin}/deals` },
              { '@type': 'ListItem', position: 3, name: deal.title },
            ],
          },
        ]);
      } catch {
        statusCode = 404;
        headTags = baseHead('Deal not found', 'That deal could not be found.', canonical, 'noindex, follow');
      }
    } else if (pathname === '/wallet') {
      // Personal, token-bearing page reached only via an emailed link —
      // real shell, no data prefetch, never indexed.
      headTags = baseHead('My vouchers | Certxa', 'View your purchased Certxa deal vouchers.', canonical, 'noindex, nofollow');
    } else if (pathname === '/saved') {
      // Personal shortlist backed by localStorage — a crawler always sees an
      // empty state here regardless of who's "visiting", same as /wallet.
      // Previously had no branch of its own, so it fell through to the
      // generic homepage-style fallback below, duplicating that title/
      // description against other unhandled routes.
      headTags = baseHead('Saved salons | Certxa', 'Your saved list of independent salons and spas.', canonical, 'noindex, nofollow');
    } else if (pathname === '/search') {
      headTags = baseHead(
        'Find a salon | Certxa',
        'Search and browse independent nail salons, spas, and beauty studios near you — filter by service, category, and availability.',
        canonical,
      );
    } else if (pathname === '/for-business') {
      headTags = baseHead(
        'List your salon on Certxa | For Salon Owners',
        'Certxa puts independent salons in front of local clients who care where they book. Get a real public profile, local discovery, and better-fit bookings.',
        canonical,
      );
    }
  } catch (err) {
    // Prefetch failure shouldn't take the whole page down — fall through to
    // a client-rendered shell for this request rather than a 500.
    console.error('[marketplace SSR] prefetch failed', err);
  }

  const ssrContext: SsrContext = {};
  const html = renderToString(
    <App
      queryClient={queryClient}
      ssrPath={pathname}
      ssrSearch={search ? `?${search}` : ''}
      ssrContext={ssrContext}
    />,
  );

  if (!headTags) {
    headTags = baseHead(
      `${SITE_NAME} — Independent beauty, found locally`,
      'Find and book independent salons and spas.',
      canonical,
    );
  }

  return {
    html,
    headTags,
    statusCode: ssrContext.statusCode ?? statusCode,
    redirectTo: ssrContext.redirectTo ?? redirectTo,
    dehydratedState: dehydrate(queryClient),
  };
}
