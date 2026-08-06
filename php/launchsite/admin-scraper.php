<?php
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$url = trim($_POST['url'] ?? '');

if (!$url) {
    echo json_encode(['success' => false, 'error' => 'URL is required']);
    exit;
}

if (!preg_match('#^https?://#i', $url)) {
    $url = 'https://' . $url;
}

if (!filter_var($url, FILTER_VALIDATE_URL)) {
    echo json_encode(['success' => false, 'error' => 'Invalid URL format. Please include https://']);
    exit;
}

$host = parse_url($url, PHP_URL_HOST);
if ($host) {
    $ip = @gethostbyname($host);
    if ($ip && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        echo json_encode(['success' => false, 'error' => 'URL resolves to a private or restricted address']);
        exit;
    }
}

$uuid    = bin2hex(random_bytes(8));
$tmpBase = __DIR__ . '/scraped-tmp';
$tmpDir  = $tmpBase . '/' . $uuid;

foreach (['', '/assets', '/assets/css', '/assets/js', '/assets/img', '/assets/fonts'] as $sub) {
    @mkdir($tmpDir . $sub, 0755, true);
}

$assetWebBase = BASE_PATH . '/scraped-tmp/' . $uuid . '/assets/';
$totalBytes   = 0;
$MAX_TOTAL    = 25 * 1024 * 1024;
$downloaded   = [];

function sc_curl(string $url, int $limit = 4194304): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_ENCODING       => '',
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER     => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Cache-Control: no-cache',
            'Upgrade-Insecure-Requests: 1',
        ],
    ]);
    $data = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($data !== false && $code >= 200 && $code < 400) {
        return substr($data, 0, $limit);
    }
    return null;
}

function sc_resolve(string $base, string $href): ?string {
    $href = trim($href);
    if ($href === '' || str_starts_with($href, '#') ||
        str_starts_with($href, 'javascript:') ||
        str_starts_with($href, 'data:') ||
        str_starts_with($href, 'mailto:') ||
        str_starts_with($href, 'tel:') ||
        str_starts_with($href, 'blob:')) {
        return null;
    }
    if (preg_match('#^https?://#i', $href)) return $href;
    if (str_starts_with($href, '//')) return 'https:' . $href;

    $parts  = parse_url($base);
    $scheme = $parts['scheme'] ?? 'https';
    $host   = isset($parts['host']) ? ($parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '')) : '';
    $path   = $parts['path'] ?? '/';

    if (str_starts_with($href, '/')) {
        return $host . $href;
    }

    $dir      = rtrim(dirname($path), '/') . '/';
    $resolved = $host . $dir . $href;
    $resolved = preg_replace('#/[^/]*/\.\./#', '/', $resolved);
    $resolved = str_replace('/./', '/', $resolved);
    return $resolved;
}

function sc_safename(string $url, string $default = 'asset'): string {
    $path = parse_url($url, PHP_URL_PATH) ?? '';
    $path = preg_replace('/\?.*$/', '', $path);
    $base = basename($path);
    $base = preg_replace('/[^a-zA-Z0-9._\-]/', '_', $base);
    $base = trim($base, '_.');
    if (!$base) $base = $default . '_' . substr(md5($url), 0, 8);
    return substr($base, 0, 90);
}

function sc_ext(string $url): string {
    $path = parse_url($url, PHP_URL_PATH) ?? '';
    $path = preg_replace('/\?.*$/', '', $path);
    return strtolower(pathinfo($path, PATHINFO_EXTENSION));
}

function sc_download(string $url, string $subDir, string $tmpDir, string $assetWebBase): ?string {
    global $downloaded, $totalBytes, $MAX_TOTAL;
    $url = strtok($url, '?') . (($q = parse_url($url, PHP_URL_QUERY)) ? '?' . $q : '');
    $cacheKey = preg_replace('/\?.*/', '', $url);
    if (isset($downloaded[$cacheKey])) return $downloaded[$cacheKey];
    if ($totalBytes >= $MAX_TOTAL) return null;

    $ext      = sc_ext($url);
    $filename = sc_safename($url, 'asset');
    if ($ext && !str_ends_with(strtolower($filename), '.' . $ext)) {
        $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.' . $ext;
    }
    $filename = ltrim($filename, '.');
    if (!$filename) $filename = 'asset_' . substr(md5($url), 0, 8) . ($ext ? '.' . $ext : '');

    $localPath = $tmpDir . '/assets/' . $subDir . '/' . $filename;
    $localWeb  = $assetWebBase . $subDir . '/' . $filename;

    if (!file_exists($localPath)) {
        $data = sc_curl($url, 3 * 1024 * 1024);
        if (!$data) return null;
        $totalBytes += strlen($data);
        file_put_contents($localPath, $data);
    }

    $downloaded[$cacheKey] = $localWeb;
    return $localWeb;
}

function sc_process_css(string $css, string $cssUrl, string $tmpDir, string $assetWebBase): string {
    return preg_replace_callback(
        '/url\(\s*[\'"]?([^\'"\)\s]+)[\'"]?\s*\)/i',
        function ($m) use ($cssUrl, $tmpDir, $assetWebBase) {
            $src = trim($m[1]);
            if (str_starts_with($src, 'data:')) return $m[0];
            $absUrl = sc_resolve($cssUrl, $src);
            if (!$absUrl) return $m[0];
            $ext = sc_ext($absUrl);
            $sub = in_array($ext, ['woff', 'woff2', 'ttf', 'eot', 'otf', 'svg']) ? 'fonts' : 'img';
            $localWeb = sc_download($absUrl, $sub, $tmpDir, $assetWebBase);
            return $localWeb ? "url('$localWeb')" : $m[0];
        },
        $css
    );
}

// ── Fetch main page ───────────────────────────────────────────────────────────

set_time_limit(120);
$html = sc_curl($url, 8 * 1024 * 1024);

if (!$html) {
    foreach (['assets/fonts', 'assets/img', 'assets/js', 'assets/css', 'assets', ''] as $sub) {
        @rmdir($tmpDir . '/' . $sub);
    }
    echo json_encode([
        'success' => false,
        'error'   => 'Could not fetch the page. The site may block automated requests, require login, use Cloudflare protection, or be temporarily unavailable. Try a different URL.',
    ]);
    exit;
}

$totalBytes += strlen($html);

// ── Parse HTML ────────────────────────────────────────────────────────────────

libxml_use_internal_errors(true);
$dom = new DOMDocument();
@$dom->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'), LIBXML_NOWARNING | LIBXML_NOERROR);
$xp = new DOMXPath($dom);

// Page title
$titleNode = $xp->query('//title')->item(0);
$rawTitle  = $titleNode ? trim($titleNode->textContent) : '';
if (!$rawTitle) $rawTitle = $host;
$pageTitle = mb_substr(preg_replace('/\s+/', ' ', $rawTitle), 0, 120);

// Remove existing base tags
foreach ($xp->query('//base') as $node) {
    $node->parentNode->removeChild($node);
}

// ── Download & rewrite <link> tags (CSS, icons) ───────────────────────────────

foreach ($xp->query('//link[@href]') as $node) {
    $rel  = strtolower(trim($node->getAttribute('rel')));
    $href = trim($node->getAttribute('href'));
    if (!$href || str_starts_with($href, 'data:')) continue;

    if (str_contains($rel, 'stylesheet')) {
        $absUrl  = sc_resolve($url, $href);
        if (!$absUrl || $totalBytes >= $MAX_TOTAL) continue;
        $ext      = sc_ext($absUrl);
        $filename = sc_safename($absUrl, 'style');
        if ($ext !== 'css') $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.css';
        if (trim($filename, '.') === 'css') $filename = 'style_' . substr(md5($absUrl), 0, 8) . '.css';
        $localPath = $tmpDir . '/assets/css/' . $filename;
        $localWeb  = $assetWebBase . 'css/' . $filename;
        if (!file_exists($localPath)) {
            $cssData = sc_curl($absUrl, 4 * 1024 * 1024);
            if ($cssData) {
                $totalBytes += strlen($cssData);
                $cssData = sc_process_css($cssData, $absUrl, $tmpDir, $assetWebBase);
                file_put_contents($localPath, $cssData);
                $downloaded[preg_replace('/\?.*/', '', $absUrl)] = $localWeb;
            }
        }
        if (file_exists($localPath)) $node->setAttribute('href', $localWeb);

    } elseif (str_contains($rel, 'icon') || str_contains($rel, 'apple-touch')) {
        $absUrl = sc_resolve($url, $href);
        if (!$absUrl) continue;
        $localWeb = sc_download($absUrl, 'img', $tmpDir, $assetWebBase);
        if ($localWeb) $node->setAttribute('href', $localWeb);
    }
}

// ── Process inline <style> blocks ─────────────────────────────────────────────

foreach ($xp->query('//style') as $styleNode) {
    $css = $styleNode->textContent;
    if (!$css) continue;
    $processed = sc_process_css($css, $url, $tmpDir, $assetWebBase);
    while ($styleNode->firstChild) $styleNode->removeChild($styleNode->firstChild);
    $styleNode->appendChild($dom->createTextNode($processed));
}

// ── Download & rewrite <script src> ──────────────────────────────────────────

foreach ($xp->query('//script[@src]') as $node) {
    $src = trim($node->getAttribute('src'));
    if (!$src || $totalBytes >= $MAX_TOTAL) continue;
    $absUrl = sc_resolve($url, $src);
    if (!$absUrl) continue;
    $ext      = sc_ext($absUrl);
    $filename = sc_safename($absUrl, 'script');
    if ($ext !== 'js') $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.js';
    if (trim($filename, '.') === 'js') $filename = 'script_' . substr(md5($absUrl), 0, 8) . '.js';
    $localPath = $tmpDir . '/assets/js/' . $filename;
    $localWeb  = $assetWebBase . 'js/' . $filename;
    if (!file_exists($localPath)) {
        $jsData = sc_curl($absUrl, 4 * 1024 * 1024);
        if ($jsData) {
            $totalBytes += strlen($jsData);
            file_put_contents($localPath, $jsData);
        }
    }
    if (file_exists($localPath)) $node->setAttribute('src', $localWeb);
}

// ── Download & rewrite <img> ──────────────────────────────────────────────────

foreach ($xp->query('//img') as $node) {
    // Handle data-src lazy loading
    $src = trim($node->getAttribute('data-src') ?: $node->getAttribute('src') ?: '');
    if (!$src || str_starts_with($src, 'data:') || $totalBytes >= $MAX_TOTAL) continue;
    $absUrl = sc_resolve($url, $src);
    if (!$absUrl) continue;
    $localWeb = sc_download($absUrl, 'img', $tmpDir, $assetWebBase);
    if ($localWeb) {
        $node->setAttribute('src', $localWeb);
        $node->removeAttribute('data-src');
        $node->removeAttribute('data-lazy-src');
        $node->removeAttribute('loading');
        $node->removeAttribute('srcset');
        $node->removeAttribute('data-srcset');
    }
}

// ── Handle style="background..." attributes ───────────────────────────────────

foreach ($xp->query('//*[@style]') as $node) {
    $style = $node->getAttribute('style');
    if (!str_contains($style, 'url(')) continue;
    $processed = sc_process_css($style, $url, $tmpDir, $assetWebBase);
    $node->setAttribute('style', $processed);
}

// ── Inject <base> tag so remaining external resources still load ───────────────

$head = $xp->query('//head')->item(0);
if (!$head) {
    $head = $dom->createElement('head');
    $htmlEl = $xp->query('//html')->item(0);
    if ($htmlEl && $htmlEl->firstChild) {
        $htmlEl->insertBefore($head, $htmlEl->firstChild);
    } elseif ($htmlEl) {
        $htmlEl->appendChild($head);
    }
}
if ($head) {
    $baseTag = $dom->createElement('base');
    $baseTag->setAttribute('href', $url);
    $firstChild = $head->firstChild;
    if ($firstChild) {
        $head->insertBefore($baseTag, $firstChild);
    } else {
        $head->appendChild($baseTag);
    }
    // Inject scraper watermark as a comment
    $head->appendChild($dom->createComment(' Scraped by Launchit Admin on ' . date('Y-m-d H:i') . ' from ' . $url . ' '));
}

// ── Save files ────────────────────────────────────────────────────────────────

$finalHtml = $dom->saveHTML();
$finalHtml = preg_replace('/<\?xml[^>]+>\n?/i', '', $finalHtml);
file_put_contents($tmpDir . '/index.html', $finalHtml);

$meta = [
    'uuid'        => $uuid,
    'source_url'  => $url,
    'title'       => $pageTitle,
    'scraped_at'  => date('c'),
    'total_bytes' => $totalBytes,
    'asset_count' => count($downloaded),
];
file_put_contents($tmpDir . '/meta.json', json_encode($meta, JSON_PRETTY_PRINT));

echo json_encode([
    'success'     => true,
    'uuid'        => $uuid,
    'title'       => $pageTitle,
    'preview_url' => BASE_PATH . '/scraped-tmp/' . $uuid . '/index.html',
    'source_url'  => $url,
    'total_bytes' => $totalBytes,
    'asset_count' => count($downloaded),
]);
