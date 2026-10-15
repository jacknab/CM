import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement } from 'react';

import { buildHomepageSameAsJsonLdDocument } from '@/lib/organization-json-ld';
import { useJsonLdSiteUrl } from '@/lib/json-ld-site-url-context';
import { siteMeta } from '@/lib/site-meta';

/**
 * Injects the Organization JSON-LD on every page (each page's WebPage node
 * points at #organization), with sameAs from src/config/same-as.json.
 */
export default function HomepageSameAsJsonLd(): ReactElement | null {
  const siteUrl: string = useJsonLdSiteUrl();

  if (!siteUrl) {
    return null;
  }

  const jsonLd: Record<string, unknown> = buildHomepageSameAsJsonLdDocument({
    siteUrl,
    organizationName: siteMeta.name.trim() || new globalThis.URL(siteUrl).hostname,
  });

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
    </Helmet>
  );
}
