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
        const isVerified = !!salon.bookingUrl;
        const ratingStr = salon.rating > 0 ? ` Rated ${salon.rating}/5 from ${salon.reviewCount} reviews.` : '';
        headTags = baseHead(
          `${salon.name} - ${salon.address} | Nail Salon`,
          `${salon.name} is a nail salon located at ${salon.address}.${ratingStr}`,
          canonical,
          isVerified ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow',
        );
        const jsonLd: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@type': 'BeautySalon',
          name: salon.name,
          url: canonical,
          image: [salon.imageUrl, ...(salon.gallery || [])],
          description: salon.description || salon.about,
          ...(salon.phone ? { telephone: salon.phone } : {}),
          address: {
            '@type': 'PostalAddress',
            streetAddress: salon.address,
            addressLocality: salon.city,
            addressRegion: salon.state,
          },
          ...(salon.rating > 0 && salon.reviewCount > 0
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: salon.rating, reviewCount: salon.reviewCount } }
            : {}),
          ...(salon.services?.length
            ? { makesOffer: salon.services.map((s) => ({ '@type': 'Offer', name: s.name, price: s.price, priceCurrency: 'USD' })) }
            : {}),
        };
        headTags += jsonLdScript(jsonLd);
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
