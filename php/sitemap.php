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

/**
 * When a page last changed, YYYY-MM-DD: the newest of the files that make it — the React marketing app's page
 * and content files for the pages it serves, otherwise the PHP template. Null when none is found, and the URL
 * then has no <lastmod> (a date that is always "today" tells search engines nothing).
 */
function page_lastmod(string $path, string $root, string $today): ?string {
    $slug = trim($path, '/');
    $mk   = dirname($root) . '/artifacts/marketing/src';
    $marketing = [
        ''                               => ["pages/index.tsx", "content/pages/home.json"],
        'vietnamese-nail-salon-software' => ["pages/vietnamese-nail-salon-software.tsx", "components/landing/VietnameseNailLanding.tsx"],
        'vi/phan-mem-tiem-nail'          => ["components/landing/VietnameseNailLanding.tsx"],
        'nail-salon-turn-system'         => ["pages/nail-salon-turn-system.tsx", "components/landing/TurnSystemGuide.tsx"],
        'vi/chia-tua-tiem-nail'          => ["components/landing/TurnSystemGuide.tsx"],
    ];
    if (isset($marketing[$slug])) $files = array_map(fn($f) => "$mk/$f", $marketing[$slug]);
    elseif (strpos($slug, 'compare/') === 0) $files = ["$mk/pages/compare/ComparisonLayout.tsx", "$mk/content/data/comparisons.json"];
    else $files = ["$mk/pages/$slug.tsx", "$mk/content/pages/$slug.json"];
    $newest = 0;
    foreach ($files as $f) if (is_file($f)) $newest = max($newest, (int) @filemtime($f));
    if (!$newest) {
        foreach (["$root/$slug/default.php", "$root/$slug/index.php", "$root/$slug.php"] as $f) {
            if (is_file($f)) { $newest = (int) @filemtime($f); break; }
        }
    }
    return $newest ? date('Y-m-d', $newest) : null;
}

/** Whether the Launchit template catalogue has any templates (an empty one is noindex, so not listed). */
function launchsite_has_templates(): bool {
    try {
        ob_start();
        require __DIR__ . '/launchsite/config.php';
        require __DIR__ . '/launchsite/includes/categories.php';
        ob_end_clean();
        return array_sum(array_column($active_categories ?? [], 'count')) > 0;
    } catch (Throwable $e) {
        if (ob_get_level()) ob_end_clean();
        return true;
    }
}

// Curated marketing URL list (path => priority). Order = priority order.
$PAGES = [
    '/'                          => '1.0',
    '/pricing'                   => '0.95',
    '/features'                  => '0.93',
    '/autumn'                    => '0.93',
    '/vietnamese-nail-salon-software' => '0.92',
    '/vi/phan-mem-tiem-nail'     => '0.90',
    '/nail-salon-turn-system'    => '0.90',
    '/vi/chia-tua-tiem-nail'     => '0.88',
    '/booking'                   => '0.90',
    '/launchsite'               => '0.87',
    '/products'                  => '0.86',
    '/compare/certxa-vs-glossgenius' => '0.85',
    '/compare/certxa-vs-vagaro'  => '0.85',
    '/compare/certxa-vs-fresha'  => '0.85',
    '/compare/certxa-vs-square'  => '0.85',
    '/data-transfer'             => '0.79',
    '/contact'                   => '0.76',
    '/about'                     => '0.75',
    '/changelog'                 => '0.65',
    '/roadmap'                   => '0.65',
    '/careers'                   => '0.50',
    '/google-data-policy'        => '0.62',
    '/privacy'                   => '0.60',
    '/terms'                     => '0.60',
    '/sms-terms'                 => '0.40',
];
if (!launchsite_has_templates()) unset($PAGES['/launchsite']);

$which = $_GET['sitemap_kind'] ?? 'index';

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";

if ($which === 'pages') {
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($PAGES as $path => $priority) {
        $loc  = htmlspecialchars('https://certxa.com' . ($path === '/' ? '/' : $path), ENT_XML1, 'UTF-8');
        $lm   = page_lastmod($path, $root, $today);
        $freq = ($path === '/' || $path === '/pricing') ? 'weekly' : 'monthly';
        $lmTag = $lm ? "<lastmod>{$lm}</lastmod>" : '';
        echo "  <url><loc>{$loc}</loc>{$lmTag}<changefreq>{$freq}</changefreq><priority>{$priority}</priority></url>\n";
    }
    echo '</urlset>';
    exit;
}

// Sitemap index
echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
echo "  <sitemap><loc>https://certxa.com/sitemap-pages.xml</loc><lastmod>{$today}</lastmod></sitemap>\n";
echo "  <sitemap><loc>https://certxa.com/blog/sitemap.xml</loc><lastmod>{$today}</lastmod></sitemap>\n";
// The salon directory lives at salons.certxa.com, which serves its own sitemap.xml (routes/salonDirectory.ts).
echo '</sitemapindex>';
