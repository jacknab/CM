<?php
// ── Site-wide defaults ─────────────────────────────────
defined('BRAND_NAME')    or define('BRAND_NAME',   'Certxa');
defined('SITE_URL')      or define('SITE_URL',      'https://certxa.com');
defined('PAGE_LANG')     or define('PAGE_LANG',      'en');
defined('PAGE_TITLE')    or define('PAGE_TITLE',    'Certxa — Nail Salon Software | Online Booking, Kiosk Check-In & POS');
defined('PAGE_DESC')     or define('PAGE_DESC',     'Certxa is all-in-one nail salon software for nail technicians and studio owners. Online booking, self-service walk-in kiosk, client management, POS, waitlist & AI receptionist. Free ' . TRIAL_DAYS . '-day trial.');
defined('PAGE_KEYWORDS') or define('PAGE_KEYWORDS', 'nail salon software, nail salon booking software, nail studio management software, nail salon scheduling app, nail salon POS system, nail technician software, gel nail salon software, acrylic nail salon software, nail salon check-in kiosk');
defined('PAGE_OG_IMAGE') or define('PAGE_OG_IMAGE', SITE_URL . '/assets/images/og-image.jpg');

// Canonical: prefer explicit constant, fall back to current path (no .php extension)
if (!defined('PAGE_CANONICAL')) {
  $path = strtok($_SERVER['REQUEST_URI'] ?? '/overview', '?');
  // normalise /index.php and bare / to /overview
  if ($path === '/' || $path === '/index.php') $path = '/overview';
  // strip .php extension and /default suffix for clean canonical URLs
  $path = preg_replace('/\.php$/', '', $path);
  $path = preg_replace('#/default$#', '', $path);
  if ($path === '') $path = '/overview';
  define('PAGE_CANONICAL', SITE_URL . $path);
}

// Open Graph type — pages can override to 'article'
defined('PAGE_OG_TYPE') or define('PAGE_OG_TYPE', 'website');

// Article-specific Open Graph meta — only used when PAGE_OG_TYPE = 'article'
defined('PAGE_ARTICLE_AUTHOR')    or define('PAGE_ARTICLE_AUTHOR',    '');
defined('PAGE_ARTICLE_PUBLISHED') or define('PAGE_ARTICLE_PUBLISHED', '');
defined('PAGE_ARTICLE_MODIFIED')  or define('PAGE_ARTICLE_MODIFIED',  '');
defined('PAGE_ARTICLE_SECTION')   or define('PAGE_ARTICLE_SECTION',   '');
defined('PAGE_OG_IMAGE_ALT')      or define('PAGE_OG_IMAGE_ALT',      '');

// Breadcrumb: array of ['name'=>'...','url'=>'...']
defined('PAGE_BREADCRUMBS') or define('PAGE_BREADCRUMBS', json_encode([
  ['name' => 'Home', 'url' => SITE_URL . '/']
]));

// JSON-LD: page can define PAGE_SCHEMA as a JSON string
// Base schemas always injected on every page
$_base_schema = [
  [
    '@type'     => 'WebSite',
    '@id'       => SITE_URL . '/#website',
    'url'       => SITE_URL . '/',
    'name'      => BRAND_NAME,
    'description' => 'All-in-one nail salon management software for nail technicians and studio owners',
    'publisher' => ['@id' => SITE_URL . '/#organization'],
    'potentialAction' => [
      '@type'       => 'SearchAction',
      'target'      => ['@type' => 'EntryPoint', 'urlTemplate' => SITE_URL . '/search?q={search_term_string}'],
      'query-input' => 'required name=search_term_string',
    ],
  ],
  [
    '@type' => 'Organization',
    '@id'   => SITE_URL . '/#organization',
    'name'  => BRAND_NAME,
    'url'   => SITE_URL,
    'description' => 'Certxa is all-in-one salon and nail studio management software with online booking, point of sale, payments, staff management, payroll, and an AI receptionist.',
    'foundingDate' => '2026-02-01',
    'founder' => ['@id' => SITE_URL . '/#founder-tom-tham'],
    'address' => [
      '@type'           => 'PostalAddress',
      'addressLocality' => 'Phoenix',
      'addressRegion'   => 'AZ',
      'addressCountry'  => 'US',
    ],
    'logo'  => [
      '@type'  => 'ImageObject',
      'url'    => SITE_URL . '/assets/images/logo.png',
      'width'  => 512,
      'height' => 512,
    ],
    // No sameAs entries — Facebook, Instagram, LinkedIn, and Twitter/X
    // profiles don't exist yet. Add real URLs here once each is created;
    // asserting profiles that don't exist is worse than omitting sameAs.
    'contactPoint' => [
      '@type'            => 'ContactPoint',
      'contactType'      => 'customer support',
      'email'            => 'support@certxa.com',
      'telephone'        => '+1-800-278-4392',
      'hoursAvailable'   => 'Mo-Fr 09:00-18:00',
      'availableLanguage'=> 'English',
    ],
    'knowsAbout' => [
      'Salon management software',
      'Nail salon software',
      'Online appointment booking',
      'Salon point of sale (POS)',
      'Staff and payroll management',
      'AI receptionist for salons',
    ],
  ],
  [
    '@type'    => 'Person',
    '@id'      => SITE_URL . '/#founder-tom-tham',
    'name'     => 'Tom Tham',
    'jobTitle' => 'Founder',
    'worksFor' => ['@id' => SITE_URL . '/#organization'],
    'knowsAbout' => ['Nail salon management', 'Salon software', 'Vietnamese-owned nail salon industry'],
  ],
  // Canonical product entity — injected site-wide under a single @id so AI
  // models and Google's entity resolution see one "Certxa" product, not a
  // different fragment per page. Individual pages should NOT define their
  // own competing SoftwareApplication node; if a page needs to reference
  // the product, use ['@id' => SITE_URL . '/#software'] in an 'about' field.
  [
    '@type'                   => 'SoftwareApplication',
    '@id'                     => SITE_URL . '/#software',
    'name'                    => BRAND_NAME,
    'applicationCategory'     => 'BusinessApplication',
    'applicationSubCategory'  => 'SalonManagementSoftware',
    'operatingSystem'         => 'Web, iOS, Android',
    'url'                     => SITE_URL,
    'description'             => 'Certxa is the all-in-one nail salon software built for nail technicians and studio owners. Features include 24/7 online booking, self-service walk-in check-in kiosk, multi-tech calendar management, client nail records with product notes, automated SMS and email reminders, a POS system, waitlist management, Autumn AI receptionist, Google Reviews integration, and a branded website builder.',
    'softwareVersion'         => '2.0',
    // `billingIncrement` is not a valid Offer property (it belongs on
    // UnitPriceSpecification, and expects a Number, not an ISO-8601 duration
    // string) — every Offer below now expresses monthly billing correctly via
    // priceSpecification/billingDuration instead. price/lowPrice/highPrice/
    // offerCount are real ints so they serialize as JSON numbers, not strings.
    'offers' => [
      '@type'      => 'AggregateOffer',
      'priceCurrency' => 'USD',
      'lowPrice'   => 9,
      'highPrice'  => 49,
      'offerCount' => 3,
      'offers' => [
        ['@type' => 'Offer', 'name' => 'Solo Plan',         'price' => 9,  'priceCurrency' => 'USD', 'priceSpecification' => ['@type' => 'UnitPriceSpecification', 'price' => 9,  'priceCurrency' => 'USD', 'billingDuration' => ['@type' => 'QuantitativeValue', 'value' => 1, 'unitCode' => 'MON']], 'url' => SITE_URL . '/pricing'],
        ['@type' => 'Offer', 'name' => 'Professional Plan', 'price' => 22, 'priceCurrency' => 'USD', 'priceSpecification' => ['@type' => 'UnitPriceSpecification', 'price' => 22, 'priceCurrency' => 'USD', 'billingDuration' => ['@type' => 'QuantitativeValue', 'value' => 1, 'unitCode' => 'MON']], 'url' => SITE_URL . '/pricing'],
        ['@type' => 'Offer', 'name' => 'Elite Plan',        'price' => 49, 'priceCurrency' => 'USD', 'priceSpecification' => ['@type' => 'UnitPriceSpecification', 'price' => 49, 'priceCurrency' => 'USD', 'billingDuration' => ['@type' => 'QuantitativeValue', 'value' => 1, 'unitCode' => 'MON']], 'url' => SITE_URL . '/pricing'],
      ],
    ],
    'featureList' => [
      '24/7 online booking with real-time availability',
      'Multi-staff calendar management with day view',
      'Automated SMS and email appointment reminders',
      'Client management CRM with full appointment history',
      'Integrated card payment processing',
      'Salon point of sale (POS) system with card reader',
      'Gift cards and membership management',
      'Google Reviews automation',
      'Google Business Profile booking link sync',
      'Custom branded website builder',
      'Business analytics and reporting dashboard',
      'No-show deposit protection',
    ],
    'publisher' => ['@id' => SITE_URL . '/#organization'],
  ],
];

// Build breadcrumb schema
$_breadcrumbs = json_decode(PAGE_BREADCRUMBS, true);
if (count($_breadcrumbs) > 1) {
  $_bc_items = [];
  foreach ($_breadcrumbs as $i => $bc) {
    $_bc_items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $bc['name'], 'item' => $bc['url']];
  }
  $_base_schema[] = ['@type' => 'BreadcrumbList', 'itemListElement' => $_bc_items];
}

// Merge page-specific schema
$_page_schema = defined('PAGE_SCHEMA') ? json_decode(PAGE_SCHEMA, true) : [];
if (!empty($_page_schema)) {
  if (isset($_page_schema['@type'])) {
    // single object
    $_base_schema[] = $_page_schema;
  } else {
    // array of objects
    foreach ($_page_schema as $s) $_base_schema[] = $s;
  }
}

$_schema_output = json_encode(['@context' => 'https://schema.org', '@graph' => $_base_schema],
  JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars(PAGE_LANG) ?>" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- ── Favicon ────────────────────────────────── -->
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.svg" sizes="any">
  <meta name="theme-color" content="#3B0764">

  <!-- ── Primary meta ───────────────────────────── -->
  <title><?= htmlspecialchars(PAGE_TITLE) ?></title>
  <meta name="description" content="<?= htmlspecialchars(PAGE_DESC) ?>">
  <meta name="keywords"    content="<?= htmlspecialchars(PAGE_KEYWORDS) ?>">
  <meta name="author"      content="<?= BRAND_NAME ?>">
  <meta name="robots"      content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <link rel="canonical"    href="<?= htmlspecialchars(PAGE_CANONICAL) ?>">
<?php
  // ── hreflang alternates ──────────────────────
  // A page declares PAGE_ALTERNATES as a JSON array of
  //   [ ['hreflang' => 'en', 'href' => 'https://…'], … ]
  // Include an 'x-default' entry. Every URL in the set should point back at the
  // same set (reciprocal) or Google ignores it.
  if (defined('PAGE_ALTERNATES')) {
    foreach ((json_decode(PAGE_ALTERNATES, true) ?: []) as $_alt) {
      if (!empty($_alt['hreflang']) && !empty($_alt['href'])) {
        echo '  <link rel="alternate" hreflang="' . htmlspecialchars($_alt['hreflang'])
           . '" href="' . htmlspecialchars($_alt['href']) . '">' . "\n";
      }
    }
  }
?>
  <!-- ── Open Graph ────────────────────────────── -->
  <meta property="og:type"        content="<?= PAGE_OG_TYPE ?>">
  <meta property="og:site_name"   content="<?= BRAND_NAME ?>">
  <meta property="og:title"       content="<?= htmlspecialchars(PAGE_TITLE) ?>">
  <meta property="og:description" content="<?= htmlspecialchars(PAGE_DESC) ?>">
  <meta property="og:url"         content="<?= htmlspecialchars(PAGE_CANONICAL) ?>">
  <meta property="og:image"       content="<?= htmlspecialchars(PAGE_OG_IMAGE) ?>">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height"content="630">
  <?php if (PAGE_OG_IMAGE_ALT): ?><meta property="og:image:alt" content="<?= htmlspecialchars(PAGE_OG_IMAGE_ALT) ?>"><?php endif; ?>
  <meta property="og:locale"      content="en_US">
  <?php if (PAGE_OG_TYPE === 'article'): ?>
  <?php if (PAGE_ARTICLE_PUBLISHED): ?><meta property="article:published_time" content="<?= htmlspecialchars(PAGE_ARTICLE_PUBLISHED) ?>"><?php endif; ?>
  <?php if (PAGE_ARTICLE_MODIFIED):  ?><meta property="article:modified_time"  content="<?= htmlspecialchars(PAGE_ARTICLE_MODIFIED) ?>"><?php endif; ?>
  <?php if (PAGE_ARTICLE_AUTHOR):    ?><meta property="article:author"          content="<?= htmlspecialchars(PAGE_ARTICLE_AUTHOR) ?>"><?php endif; ?>
  <?php if (PAGE_ARTICLE_SECTION):   ?><meta property="article:section"         content="<?= htmlspecialchars(PAGE_ARTICLE_SECTION) ?>"><?php endif; ?>
  <?php endif; ?>

  <!-- ── Twitter Card ──────────────────────────── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@certxa">
  <meta name="twitter:title"       content="<?= htmlspecialchars(PAGE_TITLE) ?>">
  <meta name="twitter:description" content="<?= htmlspecialchars(PAGE_DESC) ?>">
  <meta name="twitter:image"       content="<?= htmlspecialchars(PAGE_OG_IMAGE) ?>">

  <!-- ── Sitemap hint ──────────────────────────── -->
  <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml">

  <!-- ── Preconnect / fonts ────────────────────── -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..700,50..100,0..1;1,9..144,300..700,50..100,0..1&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <!-- ── Stylesheet ────────────────────────────── -->
  <link rel="stylesheet" href="/assets/css/style.css?v=<?= filemtime($_SERVER['DOCUMENT_ROOT'].'/assets/css/style.css') ?>">

  <!-- ── JSON-LD Structured Data ───────────────── -->
  <script type="application/ld+json"><?= $_schema_output ?></script>
</head>
<body>
<a href="#main-content" class="skip-to-content">Skip to main content</a>
