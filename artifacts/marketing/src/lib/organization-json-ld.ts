import sameAsConfig from '../config/same-as.json';

export function getSameAsUrls(): string[] {
  const urls: unknown[] = Array.isArray(sameAsConfig.urls) ? (sameAsConfig.urls as unknown[]) : [];
  return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export function buildOrganizationNode(params: {
  siteUrl: string;
  name: string;
  logo?: string;
  businessType?: string;
}): Record<string, unknown> {
  const businessType = params.businessType ?? 'Organization';
  const node: Record<string, unknown> = {
    '@type': businessType,
    '@id': `${params.siteUrl}/#organization`,
    name: params.name,
    url: `${params.siteUrl}/`,
  };

  if (params.logo) {
    node.logo = params.logo;
  }

  const sameAs = getSameAsUrls();
  if (sameAs.length > 0) {
    node.sameAs = sameAs;
  }

  return node;
}

// Keep in step with the Organization node in php/includes/header.php: both
// halves of the site share one @id and must describe the same company.
function certxaOrganizationDetails(siteUrl: string): Record<string, unknown> {
  return {
    description:
      'Certxa is all-in-one salon and nail studio management software with online booking, point of sale, payments, staff management, payroll, and an AI receptionist.',
    foundingDate: '2026-02-01',
    founder: { '@id': `${siteUrl}/#founder-tom-tham` },
    address: {
      '@type': 'PostalAddress',
      streetAddress: '2325 E Camelback Rd, Ste 400',
      addressLocality: 'Phoenix',
      addressRegion: 'AZ',
      postalCode: '85016',
      addressCountry: 'US',
    },
    logo: { '@type': 'ImageObject', url: `${siteUrl}/assets/images/logo.png`, width: 512, height: 512 },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@certxa.com',
      telephone: '+1-800-278-4392',
      hoursAvailable: 'Mo-Su 10:00-21:00',
      availableLanguage: 'English',
    },
  };
}

export function buildHomepageSameAsJsonLdDocument(params: {
  siteUrl: string;
  organizationName: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    ...buildOrganizationNode({
      siteUrl: params.siteUrl,
      name: params.organizationName,
    }),
    ...certxaOrganizationDetails(params.siteUrl),
  };
}

export function buildHomepageJsonLd(params: {
  siteUrl: string;
  organizationName: string;
  logo?: string;
  businessType?: string;
  datePublished: string;
  dateModified: string;
}): Record<string, unknown> {
  const websiteId = `${params.siteUrl}/#website`;
  const webpageId = `${params.siteUrl}/#webpage`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: params.organizationName,
        url: `${params.siteUrl}/`,
      },
      buildOrganizationNode({
        siteUrl: params.siteUrl,
        name: params.organizationName,
        logo: params.logo,
        businessType: params.businessType,
      }),
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url: `${params.siteUrl}/`,
        isPartOf: { '@id': websiteId },
        about: { '@id': `${params.siteUrl}/#organization` },
        datePublished: params.datePublished,
        dateModified: params.dateModified,
      },
    ],
  };
}
