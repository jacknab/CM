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
  type SalonProfile, type GeoCity,
} from '@/lib/api';

export interface RenderResult {
  html: string;
  headTags: string;
  statusCode: number;
  redirectTo?: string;
  dehydratedState: unknown;
}

const SITE_NAME = 'Certxa';

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado",
  CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey",
  NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota",
  TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming", DC:"Washington DC",
};
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
  const [pathname, search = ''] = url.split('?');
  const canonical = `${publicOrigin}${pathname}`;
  let headTags = '';
  let statusCode = 200;

  try {
    if (pathname === '/') {
      queryClient.setQueryData(getGeoCityQueryKey(), geo);
      const featuredParams = geo ? { citySlug: geo.citySlug, stateSlug: geo.stateSlug } : {};
      const featured = await getFeaturedSalons(featuredParams);
      queryClient.setQueryData(getGetFeaturedSalonsQueryKey(featuredParams), featured);
      headTags = baseHead(
        geo ? `Nail salons in ${geo.city}, ${geo.state} — ${SITE_NAME}` : `${SITE_NAME} — Find your good place`,
        geo
          ? `Find and book independent nail salons in ${geo.city}, ${geo.state}, curated by Certxa.`
          : 'Certxa is a considered local guide to independent salons, studios, and beauty people worth knowing.',
        canonical,
      );
      headTags += jsonLdScript([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: SITE_NAME,
          url: publicOrigin,
          description: 'Certxa is a considered local guide to independent salons, studios, and beauty people worth knowing.',
          sameAs: [
            'https://www.linkedin.com/company/certxa',
            'https://www.reddit.com/user/Certxa-salon/',
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: publicOrigin,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${publicOrigin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ]);
    } else if (pathname.startsWith('/listings/')) {
      const param = decodeURIComponent(pathname.slice('/listings/'.length));
      const sep = param.lastIndexOf('--');
      if (sep === -1) {
        try {
          const state = await getStateListing(param);
          queryClient.setQueryData(getStateListingQueryKey(param), state);
          headTags = baseHead(
            `Nail salons in ${state.name} | ${SITE_NAME}`,
            `Find ${state.count.toLocaleString()} nail salons across ${state.name}. Browse by city and get in touch.`,
            canonical,
          );
          headTags += jsonLdScript([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
                { '@type': 'ListItem', position: 2, name: state.name },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Nail salons in ${state.name}`,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: state.cities.length,
                itemListElement: state.cities.map((c, i) => ({
                  '@type': 'ListItem', position: i + 1, name: c.name,
                  url: `${publicOrigin}/listings/${c.slug}--${state.slug}`,
                })),
              },
            },
          ]);
        } catch {
          statusCode = 404;
          headTags = baseHead('State not found', 'That state could not be found.', canonical, 'noindex, follow');
        }
      } else {
        const citySlug = param.slice(0, sep);
        const stateSlug = param.slice(sep + 2);
        try {
          const city = await getCityListing(citySlug, stateSlug);
          queryClient.setQueryData(getCityListingQueryKey(citySlug, stateSlug), city);
          headTags = baseHead(
            `Nail salons in ${city.cityName}, ${city.stateName} | ${SITE_NAME}`,
            `${city.salons.length.toLocaleString()} nail salons in ${city.cityName}, ${city.stateName}.`,
            canonical,
          );
          headTags += jsonLdScript([
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
                { '@type': 'ListItem', position: 2, name: city.stateName, item: `${publicOrigin}/listings/${city.stateSlug}` },
                { '@type': 'ListItem', position: 3, name: city.cityName },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `Nail salons in ${city.cityName}, ${city.stateName}`,
              url: canonical,
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: city.salons.length,
                itemListElement: city.salons.map((s, i) => ({
                  '@type': 'ListItem', position: i + 1, name: s.name,
                  url: `${publicOrigin}/${s.slug}`,
                })),
              },
            },
          ]);
        } catch {
          statusCode = 404;
          headTags = baseHead('City not found', 'That city could not be found.', canonical, 'noindex, follow');
        }
      }
    } else if (pathname !== '/search' && pathname !== '/saved' && pathname !== '/for-business' && pathname !== '/') {
      // Flat /:slug — individual salon profile page.
      const slug = pathname.slice(1);
      try {
        const salon: SalonProfile = await getSalonBySlug(slug);
        queryClient.setQueryData(getGetSalonBySlugQueryKey(slug), salon);
        const ratingStr = salon.rating > 0 ? ` Rated ${salon.rating}/5 from ${salon.reviewCount} reviews.` : '';
        // Every real salon record is indexable now — sitemap and page-level
        // robots directives both cover the full dataset, not just listings
        // claimed by a paying Certxa customer (see GEO-AUDIT-REPORT.md).
        headTags = baseHead(
          `${salon.name} - ${salon.address} | Nail Salon`,
          `${salon.name} is a nail salon located at ${salon.address}.${ratingStr}`,
          canonical,
          'index, follow, max-image-preview:large, max-snippet:-1',
        );
        const stateName = STATE_NAMES[salon.state] || salon.state;
        const openingHours = (salon.hours || [])
          .map((h) => {
            const opens = to24Hour(h.open);
            const closes = to24Hour(h.close);
            if (!opens || !closes) return null;
            return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${h.day}`, opens, closes };
          })
          .filter((h): h is NonNullable<typeof h> => h !== null);
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'BeautySalon',
          name: salon.name,
          url: canonical,
          image: [salon.imageUrl, ...(salon.gallery || [])],
          // Prefer the real, unique AI-written paragraph over the generic
          // "Nail salon in {city}, {state}." fallback — `salon.description`
          // is never empty, so `description || about` previously always
          // picked the generic string even when a real one existed.
          description: salon.about || salon.description,
          ...(salon.phone ? { telephone: salon.phone } : {}),
          address: {
            '@type': 'PostalAddress',
            streetAddress: salon.address,
            addressLocality: salon.city,
            addressRegion: salon.state,
            addressCountry: 'US',
          },
          ...(salon.latitude != null && salon.longitude != null
            ? { geo: { '@type': 'GeoCoordinates', latitude: salon.latitude, longitude: salon.longitude } }
            : {}),
          ...(openingHours.length ? { openingHoursSpecification: openingHours } : {}),
          ...(salon.rating > 0 && salon.reviewCount > 0
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: salon.rating, reviewCount: salon.reviewCount } }
            : {}),
          ...(salon.services?.length
            ? { makesOffer: salon.services.map((s) => ({ '@type': 'Offer', name: s.name, price: s.price, priceCurrency: 'USD' })) }
            : {}),
        };
        const breadcrumb = {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${publicOrigin}/` },
            { '@type': 'ListItem', position: 2, name: stateName, item: `${publicOrigin}/listings/${toSlug(stateName)}` },
            { '@type': 'ListItem', position: 3, name: salon.city, item: `${publicOrigin}/listings/${toSlug(salon.city)}--${toSlug(stateName)}` },
            { '@type': 'ListItem', position: 4, name: salon.name },
          ],
        };
        headTags += jsonLdScript([jsonLd, breadcrumb]);
      } catch {
        statusCode = 404;
        headTags = baseHead('Salon not found', 'That salon could not be found.', canonical, 'noindex, follow');
      }
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
    redirectTo: ssrContext.redirectTo,
    dehydratedState: dehydrate(queryClient),
  };
}
