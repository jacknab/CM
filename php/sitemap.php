<?php
/**
 * Dynamic sitemap — served at /sitemap.xml (index) and /sitemap-pages.xml (pages).
 *
 * Replaces the previously hand-maintained static files. <lastmod> for each
 * marketing page is derived from the mtime of its template so the dates stay
 * honest without anyone having to remember to edit XML on every content change.
 */

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$root  = rtrim($_SERVER['DOCUMENT_ROOT'] ?: dirname(__DIR__) . '/php', '/');
$today = date('Y-m-d');

/** mtime of the page template for a given URL path, YYYY-MM-DD, or today. */
function page_lastmod(string $path, string $root, string $today): string {
    $slug = trim($path, '/');
    if ($slug === '') $slug = 'overview'; // homepage renders php/overview/default.php
    foreach (["$root/$slug/default.php", "$root/$slug/index.php", "$root/$slug.php"] as $f) {
        if (is_file($f)) {
            $t = @filemtime($f);
            if ($t) return date('Y-m-d', $t);
        }
    }
    return $today;
}

// Curated marketing URL list (path => priority). Order = priority order.
$PAGES = [
    '/'                          => '1.0',
    '/pricing'                   => '0.95',
    '/nail-salon-software'       => '0.93',
    '/autumn'                    => '0.93',
    '/online-booking'            => '0.90',
    '/payments'                  => '0.90',
    '/revenue-intelligence'      => '0.88',
    '/checkin-kiosk'             => '0.87',
    '/launchsite'               => '0.87',
    '/custom-website-builder'    => '0.86',
    '/client-management'         => '0.86',
    '/payment-processing'        => '0.85',
    '/certxa-vs-glossgenius'     => '0.85',
    '/certxa-vs-vagaro'          => '0.85',
    '/certxa-vs-fresha'          => '0.85',
    '/certxa-vs-gocheckin'       => '0.85',
    '/client-notifications'      => '0.84',
    '/get-more-reviews'          => '0.84',
    '/vietnamese-salon-software' => '0.84',
    '/google-business-profile'   => '0.83',
    '/client-reviews'            => '0.83',
    '/salonos'                   => '0.82',
    '/solo-professionals'        => '0.82',
    '/booth-renters'             => '0.81',
    '/case-studies'              => '0.80',
    '/data-transfer'             => '0.79',
    '/contact'                   => '0.76',
    '/about'                     => '0.75',
    '/google-data-policy'        => '0.62',
    '/privacy'                   => '0.60',
    '/terms'                     => '0.60',
];

$which = $_GET['sitemap_kind'] ?? 'index';

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";

if ($which === 'pages') {
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($PAGES as $path => $priority) {
        $loc  = htmlspecialchars('https://certxa.com' . ($path === '/' ? '/' : $path), ENT_XML1, 'UTF-8');
        $lm   = page_lastmod($path, $root, $today);
        $freq = ($path === '/' || $path === '/pricing') ? 'weekly' : 'monthly';
        echo "  <url><loc>{$loc}</loc><lastmod>{$lm}</lastmod><changefreq>{$freq}</changefreq><priority>{$priority}</priority></url>\n";
    }
    echo '</urlset>';
    exit;
}

// Sitemap index
echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
echo "  <sitemap><loc>https://certxa.com/sitemap-pages.xml</loc><lastmod>{$today}</lastmod></sitemap>\n";
echo "  <sitemap><loc>https://certxa.com/blog/sitemap.xml</loc><lastmod>{$today}</lastmod></sitemap>\n";
echo "  <sitemap><loc>https://certxa.com/salon/sitemap.xml</loc><lastmod>{$today}</lastmod></sitemap>\n";
echo '</sitemapindex>';
