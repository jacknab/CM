<?php
// Load platform settings (defines TRIAL_DAYS constant) before any page is included.
// This must be first so every page file — including defines before require header.php — can use TRIAL_DAYS.
require_once __DIR__ . '/includes/settings.php';

/**
 * PHP built-in server router for certxa.com
 *
 * - /launchsite/* → served from php/launchsite/ (LaunchSite template catalog)
 *   Exception: /launchsite exactly (no trailing slash) → launchsite/default.php (marketing overview)
 * - /* everything else → served from php/ root (main certxa.com marketing site)
 *
 * Page structure: each page lives in its own directory as default.php
 *   e.g. /overview → overview/default.php
 *        /pricing  → pricing/default.php
 */

$mime_map = [
    'css'   => 'text/css; charset=utf-8',
    'js'    => 'application/javascript; charset=utf-8',
    'json'  => 'application/json',
    'png'   => 'image/png',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'gif'   => 'image/gif',
    'svg'   => 'image/svg+xml',
    'ico'   => 'image/x-icon',
    'woff'  => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf'   => 'font/ttf',
    'eot'   => 'application/vnd.ms-fontobject',
    'txt'   => 'text/plain',
    'html'  => 'text/html; charset=utf-8',
    'webp'  => 'image/webp',
    'mp4'   => 'video/mp4',
    'webm'  => 'video/webm',
    'xml'   => 'application/xml',
];

function serve_static(string $path, array $mime_map): void {
    $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $mime = $mime_map[$ext] ?? 'application/octet-stream';
    $size = filesize($path);

    // Video/audio files need range-request support so browsers can stream and seek.
    // Without 206 Partial Content, most browsers refuse to play the video at all.
    $is_media = in_array($ext, ['mp4', 'webm', 'ogg', 'mp3', 'wav'], true);

    header('Content-Type: ' . $mime);
    header('Accept-Ranges: bytes');
    header('Cache-Control: public, max-age=86400');

    // Handle Range request (byte-range streaming)
    $range = $_SERVER['HTTP_RANGE'] ?? '';
    if ($range && preg_match('/bytes=(\d*)-(\d*)/i', $range, $m)) {
        $start = $m[1] !== '' ? (int)$m[1] : 0;
        $end   = $m[2] !== '' ? (int)$m[2] : $size - 1;
        $end   = min($end, $size - 1);
        $length = $end - $start + 1;

        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
        header('Content-Length: ' . $length);

        $fp = fopen($path, 'rb');
        fseek($fp, $start);
        $remaining = $length;
        while ($remaining > 0 && !feof($fp)) {
            $chunk = fread($fp, min(65536, $remaining));
            echo $chunk;
            $remaining -= strlen($chunk);
        }
        fclose($fp);
        exit;
    }

    // Full file
    header('Content-Length: ' . $size);
    readfile($path);
    exit;
}

function require_page(string $path): void {
    require $path;
    exit;
}

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if ($uri === '') $uri = '/';

// ── Subdomain suspension guard (tenant websites) ─────────────────────────────
// If a tenant account is suspended/canceled/locked, always serve a maintenance
// page at the edge before any template/page rendering.
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$host = preg_replace('/:\\d+$/', '', $host ?? '');
if (preg_match('/^([a-z0-9-]+)\\.certxa\\.com$/', $host, $m)) {
    $sub = $m[1] ?? '';
    $reserved = ['www', 'certxa', 'manage', 'app', 'api'];

    if ($sub !== '' && !in_array($sub, $reserved, true)) {
        try {
            require_once __DIR__ . '/api/db.php';
            $pdo = launchit_db_connect();
            $stmt = $pdo->prepare('SELECT account_status FROM locations WHERE lower(booking_slug) = :slug LIMIT 1');
            $stmt->execute([':slug' => strtolower($sub)]);
            $row = $stmt->fetch();
            $status = strtolower(trim((string)($row['account_status'] ?? '')));

            if (in_array($status, ['suspended', 'canceled', 'cancelled', 'locked'], true)) {
                http_response_code(503);
                header('Content-Type: text/html; charset=utf-8');
                header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
                echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                   . '<title>Under Maintenance</title>'
                   . '<style>body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b1020;color:#fff;display:grid;place-items:center;min-height:100vh}main{max-width:560px;padding:24px;text-align:center}h1{margin:0 0 10px;font-size:2rem}p{margin:0;opacity:.85;line-height:1.6}</style>'
                   . '</head><body><main><h1>Under Maintenance</h1><p>This website is temporarily unavailable. Please check back soon.</p></main></body></html>';
                exit;
            }
        } catch (Throwable $e) {
            // Fail-open here to avoid taking down the marketing/site router if
            // DB connectivity has a transient issue.
        }
    }
}

// ── LaunchSite catalog (/launchsite/*) ────────────────────────────────────────
// Exception: bare /launchsite (no slash) → serve launchsite marketing overview page
if ($uri === '/launchsite') {
    require __DIR__ . '/launchsite/default.php';
    exit;
}

if (strpos($uri, '/launchsite/') === 0) {
    $launch_uri  = preg_replace('#^/launchsite/?#', '/', $uri);
    if ($launch_uri === '') $launch_uri = '/';

    $launch_root = __DIR__ . '/launchsite';
    $launch_file = $launch_root . $launch_uri;

    // Rewrite server vars so included scripts see the clean sub-path
    $_SERVER['REQUEST_URI'] = $launch_uri
        . (isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== ''
            ? '?' . $_SERVER['QUERY_STRING'] : '');
    $_SERVER['PHP_SELF']    = $launch_uri;
    $_SERVER['SCRIPT_NAME'] = $launch_uri;

    // React SPA directory → serve index.html
    if (is_dir($launch_file)) {
        $index = rtrim($launch_file, '/') . '/index.html';
        if (is_file($index)) {
            header('Content-Type: text/html; charset=utf-8');
            readfile($index);
            exit;
        }
        // Try default.php then index.php for sub-directories
        $base = rtrim($launch_file, '/');
        if (is_file($base . '/default.php')) { require_page($base . '/default.php'); }
        if (is_file($base . '/index.php'))   { require_page($base . '/index.php'); }
    }

    // Static file
    if (is_file($launch_file) && pathinfo($launch_file, PATHINFO_EXTENSION) !== 'php') {
        serve_static($launch_file, $GLOBALS['mime_map']);
    }

    // PHP page routing for launchsite sub-paths
    if ($launch_uri === '/') {
        require $launch_root . '/index.php';
    } elseif (is_file($launch_file) && pathinfo($launch_file, PATHINFO_EXTENSION) === 'php') {
        require $launch_file;
    } elseif (is_file($launch_file . '.php')) {
        require $launch_file . '.php';
    } elseif (is_dir($launch_file) && is_file(rtrim($launch_file,'/') . '/default.php')) {
        require rtrim($launch_file, '/') . '/default.php';
    } elseif (is_dir($launch_file) && is_file(rtrim($launch_file,'/') . '/index.php')) {
        require rtrim($launch_file, '/') . '/index.php';
    } else {
        http_response_code(404);
        echo '<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>';
    }
    exit;
}

// ── Main certxa.com site (everything else) ───────────────────────────────────
$file = __DIR__ . $uri;

// Also check php/public/ subdirectory as an alternate page root.
// e.g. /SalonOS/ → php/public/SalonOS/default.php
$public_root = __DIR__ . '/public';
$public_file = $public_root . $uri;

// Root → index.php
if ($uri === '/') {
    require __DIR__ . '/index.php';
    exit;
}

// ── 301 redirect: /overview → / ──────────────────────────────────────────────
// certxa.com/ is the canonical homepage. Any old links or Google index entries
// pointing to /overview are permanently redirected here so link equity and
// Google Business Profile verification both resolve to the root URL.
if ($uri === '/overview' || $uri === '/overview/') {
    header('Location: /', true, 301);
    exit;
}

// ── 301 redirect: old .php URLs → clean URLs ─────────────────────────────────
// e.g. /overview.php → /overview, /pricing.php → /pricing
// Preserves Google rankings on old URLs while consolidating to clean paths.
if (substr($uri, -4) === '.php') {
    $clean = substr($uri, 0, -4);
    // /index.php → / (root)
    if ($clean === '/index') $clean = '/';
    // Only redirect if the clean path actually exists as a directory/page
    // (avoids redirecting PHP internals like /router or /config)
    $is_real_page = ($clean === '/')
        || is_dir(__DIR__ . $clean)
        || is_file(__DIR__ . $clean . '/default.php');
    if ($is_real_page) {
        $qs = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== ''
            ? '?' . $_SERVER['QUERY_STRING'] : '';
        header('Location: ' . $clean . $qs, true, 301);
        exit;
    }
}

// Static file (non-PHP) — check main root first, then public/
if (is_file($file) && pathinfo($file, PATHINFO_EXTENSION) !== 'php') {
    serve_static($file, $mime_map);
}
if (is_file($public_file) && pathinfo($public_file, PATHINFO_EXTENSION) !== 'php') {
    serve_static($public_file, $mime_map);
}

// Directory → prefer default.php, fall back to index.php (main root)
if (is_dir($file)) {
    $base = rtrim($file, '/');
    if (is_file($base . '/default.php')) { require_page($base . '/default.php'); }
    if (is_file($base . '/index.php'))   { require_page($base . '/index.php'); }
}

// Directory → prefer default.php, fall back to index.php (public/ root)
if (is_dir($public_file)) {
    $base = rtrim($public_file, '/');
    if (is_file($base . '/default.php')) { require_page($base . '/default.php'); }
    if (is_file($base . '/index.php'))   { require_page($base . '/index.php'); }
}

// Strip trailing slash and retry as directory (main root)
$stripped = rtrim($file, '/');
if ($stripped !== $file && is_dir($stripped)) {
    if (is_file($stripped . '/default.php')) { require_page($stripped . '/default.php'); }
    if (is_file($stripped . '/index.php'))   { require_page($stripped . '/index.php'); }
}

// Strip trailing slash and retry as directory (public/ root)
$stripped_public = rtrim($public_file, '/');
if ($stripped_public !== $public_file && is_dir($stripped_public)) {
    if (is_file($stripped_public . '/default.php')) { require_page($stripped_public . '/default.php'); }
    if (is_file($stripped_public . '/index.php'))   { require_page($stripped_public . '/index.php'); }
}

// Slug → directory/default.php (main root)
if (is_file($file . '/default.php')) {
    require $file . '/default.php';
    exit;
}

// Slug → directory/default.php (public/ root)
if (is_file($public_file . '/default.php')) {
    require $public_file . '/default.php';
    exit;
}

// Last resort: serve a .php file directly (main root, only PHP internals)
if (is_file($file) && pathinfo($file, PATHINFO_EXTENSION) === 'php') {
    require $file;
    exit;
}

// Last resort: serve a .php file directly (public/ root)
if (is_file($public_file) && pathinfo($public_file, PATHINFO_EXTENSION) === 'php') {
    require $public_file;
    exit;
}

// ── Blog sitemap ─────────────────────────────────────────────────────────────
if ($uri === '/blog/sitemap.xml') {
    require __DIR__ . '/blog/sitemap.xml.php';
    exit;
}

// ── Blog article pages: /blog/:slug ──────────────────────────────────────────
if (preg_match('#^/blog/([a-z0-9][a-z0-9\-]*)$#i', $uri, $m)) {
    $_GET['blog_slug'] = $m[1];
    require __DIR__ . '/blog/article.php';
    exit;
}

http_response_code(404);
echo '<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>';
