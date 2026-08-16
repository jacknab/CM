<?php
/**
 * Dynamic blog sitemap — served at /blog/sitemap.xml
 * Lists all published blog posts for Google Search Console.
 */
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";

require_once __DIR__ . '/../api/db.php';

$posts = [];
try {
    $pdo  = launchit_db_connect();
    $stmt = $pdo->query(
        "SELECT slug, published_at, updated_at
         FROM blog_posts
         WHERE status = 'published'
         ORDER BY published_at DESC NULLS LAST"
    );
    $posts = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    // Graceful degradation — serve empty sitemap
}

// Ensure blog sitemap is served as XML (not HTML)
header('Content-Type: application/xml; charset=utf-8');

// Add explicit XML declaration and proper content type
if (empty($posts)) {
    // Serve minimal valid sitemap when no posts exist
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">' . "\n";
    echo '  <url>' . "\n";
    echo '    <loc>https://certxa.com/blog</loc>' . "\n";
    echo '    <changefreq>daily</changefreq>' . "\n";
    echo '    <priority>0.90</priority>' . "\n";
    echo '  </url>' . "\n";
    echo '</urlset>';
    exit;
}

echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">' . "\n";

// Blog index page
echo '  <url>' . "\n";
echo '    <loc>https://certxa.com/blog</loc>' . "\n";
echo '    <changefreq>daily</changefreq>' . "\n";
echo '    <priority>0.90</priority>' . "\n";
echo '  </url>' . "\n";

foreach ($posts as $p) {
    $lastmod = $p['updated_at'] ?? $p['published_at'];
    $date    = $lastmod ? date('Y-m-d', strtotime($lastmod)) : date('Y-m-d');
    $loc     = 'https://certxa.com/blog/' . htmlspecialchars($p['slug'], ENT_XML1);
    echo "  <url>\n";
    echo "    <loc>{$loc}</loc>\n";
    echo "    <lastmod>{$date}</lastmod>\n";
    echo "    <changefreq>monthly</changefreq>\n";
    echo "    <priority>0.75</priority>\n";
    echo "  </url>\n";
}

echo '</urlset>';
