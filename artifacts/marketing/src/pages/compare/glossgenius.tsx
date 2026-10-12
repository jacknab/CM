import { Helmet } from '@dr.pogodin/react-helmet';
import { comparisons } from 'virtual:content';
import ComparisonLayout, { ComparisonData } from './ComparisonLayout';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/compare/certxa-vs-glossgenius`;
const OG_IMAGE = `${SITE}/og-image.png`;

const data = comparisons.find((c) => c.id === 'glossgenius')! as unknown as ComparisonData;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${PAGE_URL}#webpage`,
      name: data.metaTitle,
      url: PAGE_URL,
      description: data.metaDescription,
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE}/compare/` },
          { '@type': 'ListItem', position: 3, name: 'Certxa vs GlossGenius', item: PAGE_URL },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${PAGE_URL}#faq`,
      mainEntity: data.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    },
  ],
};

export default function CertxaVsGlossGeniusPage() {
  return (
    <>
      <Helmet>
        <title>{data.metaTitle}</title>
        <meta name="description" content={data.metaDescription} />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content={data.metaTitle} />
        <meta property="og:description" content={data.metaDescription} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={data.metaTitle} />
        <meta name="twitter:description" content={data.metaDescription} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>
      <h1 className="sr-only">{data.heroHeadline}</h1>
      <ComparisonLayout data={data} pageUrl={PAGE_URL} />
    </>
  );
}
