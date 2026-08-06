<?php
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'POST required']);
    exit;
}

require_once __DIR__ . '/data/templates.php';

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));

if (!$template_id || !isset($all_templates[$template_id])) {
    echo json_encode(['success' => false, 'error' => 'Template not found']);
    exit;
}

$t = $all_templates[$template_id];
if (($t['type'] ?? '') !== 'scraped') {
    echo json_encode(['success' => false, 'error' => 'Template is not a scraped type']);
    exit;
}

$source_url = $t['source_url'] ?? '';
if (!$source_url) {
    echo json_encode(['success' => false, 'error' => 'No source URL recorded for this template']);
    exit;
}

$dest_dir = __DIR__ . '/templates/' . $template_id;
if (!is_dir($dest_dir)) {
    echo json_encode(['success' => false, 'error' => 'Template directory not found on disk']);
    exit;
}

// ── Scraper helpers (duplicated from admin-scraper.php for self-contained use) ─

set_time_limit(120);

$uuid         = bin2hex(random_bytes(8));
$tmp_base     = __DIR__ . '/scraped-tmp';
$tmp_dir      = $tmp_base . '/' . $uuid;
$asset_web    = BASE_PATH . '/scraped-tmp/' . $uuid . '/assets/';
$total_bytes  = 0;
$MAX_TOTAL    = 25 * 1024 * 1024;
$downloaded   = [];

foreach (['', '/assets', '/assets/css', '/assets/js', '/assets/img', '/assets/fonts'] as $sub) {
    @mkdir($tmp_dir . $sub, 0755, true);
}

function rs_curl(string $url, int $limit = 4194304): ?string {
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

function rs_resolve(string $base, string $href): ?string {
    $href = trim($href);
    if ($href === '' || str_starts_with($href, '#') ||
        str_starts_with($href, 'javascript:') || str_starts_with($href, 'data:') ||
        str_starts_with($href, 'mailto:') || str_starts_with($href, 'tel:') ||
        str_starts_with($href, 'blob:')) return null;
    if (preg_match('#^https?://#i', $href)) return $href;
    if (str_starts_with($href, '//')) return 'https:' . $href;
    $parts  = parse_url($base);
    $scheme = $parts['scheme'] ?? 'https';
    $host   = isset($parts['host']) ? ($parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '')) : '';
    $path   = $parts['path'] ?? '/';
    if (str_starts_with($href, '/')) return $host . $href;
    $dir      = rtrim(dirname($path), '/') . '/';
    $resolved = $host . $dir . $href;
    $resolved = preg_replace('#/[^/]*/\.\./#', '/', $resolved);
    $resolved = str_replace('/./', '/', $resolved);
    return $resolved;
}

function rs_safename(string $url, string $default = 'asset'): string {
    $path = parse_url($url, PHP_URL_PATH) ?? '';
    $path = preg_replace('/\?.*$/', '', $path);
    $base = basename($path);
    $base = preg_replace('/[^a-zA-Z0-9._\-]/', '_', $base);
    $base = trim($base, '_.');
    if (!$base) $base = $default . '_' . substr(md5($url), 0, 8);
    return substr($base, 0, 90);
}

function rs_ext(string $url): string {
    $path = parse_url($url, PHP_URL_PATH) ?? '';
    $path = preg_replace('/\?.*$/', '', $path);
    return strtolower(pathinfo($path, PATHINFO_EXTENSION));
}

function rs_download(string $url, string $sub, string $tmp, string $web): ?string {
    global $downloaded, $total_bytes, $MAX_TOTAL;
    $key = preg_replace('/\?.*/', '', $url);
    if (isset($downloaded[$key])) return $downloaded[$key];
    if ($total_bytes >= $MAX_TOTAL) return null;
    $ext      = rs_ext($url);
    $filename = rs_safename($url, 'asset');
    if ($ext && !str_ends_with(strtolower($filename), '.' . $ext))
        $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.' . $ext;
    $filename = ltrim($filename, '.');
    if (!$filename) $filename = 'asset_' . substr(md5($url), 0, 8) . ($ext ? '.' . $ext : '');
    $local_path = $tmp . '/assets/' . $sub . '/' . $filename;
    $local_web  = $web . $sub . '/' . $filename;
    if (!file_exists($local_path)) {
        $data = rs_curl($url, 3 * 1024 * 1024);
        if (!$data) return null;
        $total_bytes += strlen($data);
        file_put_contents($local_path, $data);
    }
    $downloaded[$key] = $local_web;
    return $local_web;
}

function rs_process_css(string $css, string $css_url, string $tmp, string $web): string {
    return preg_replace_callback(
        '/url\(\s*[\'"]?([^\'"\)\s]+)[\'"]?\s*\)/i',
        function ($m) use ($css_url, $tmp, $web) {
            $src = trim($m[1]);
            if (str_starts_with($src, 'data:')) return $m[0];
            $abs = rs_resolve($css_url, $src);
            if (!$abs) return $m[0];
            $ext = rs_ext($abs);
            $sub = in_array($ext, ['woff','woff2','ttf','eot','otf','svg']) ? 'fonts' : 'img';
            $lw  = rs_download($abs, $sub, $tmp, $web);
            return $lw ? "url('$lw')" : $m[0];
        },
        $css
    );
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

$html = rs_curl($source_url, 8 * 1024 * 1024);
if (!$html) {
    // Clean up temp
    foreach (['assets/fonts','assets/img','assets/js','assets/css','assets',''] as $s) {
        @rmdir($tmp_dir . '/' . $s);
    }
    echo json_encode([
        'success' => false,
        'error'   => 'Could not fetch ' . $source_url . '. The site may be down, blocking bots, or require authentication.',
    ]);
    exit;
}
$total_bytes += strlen($html);

// ── Parse & process ───────────────────────────────────────────────────────────

libxml_use_internal_errors(true);
$dom = new DOMDocument();
@$dom->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'), LIBXML_NOWARNING | LIBXML_NOERROR);
$xp = new DOMXPath($dom);

foreach ($xp->query('//base') as $node) $node->parentNode->removeChild($node);

foreach ($xp->query('//link[@href]') as $node) {
    $rel  = strtolower(trim($node->getAttribute('rel')));
    $href = trim($node->getAttribute('href'));
    if (!$href || str_starts_with($href, 'data:')) continue;
    if (str_contains($rel, 'stylesheet')) {
        $abs      = rs_resolve($source_url, $href);
        if (!$abs || $total_bytes >= $MAX_TOTAL) continue;
        $ext      = rs_ext($abs);
        $filename = rs_safename($abs, 'style');
        if ($ext !== 'css') $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.css';
        if (trim($filename, '.') === 'css') $filename = 'style_' . substr(md5($abs), 0, 8) . '.css';
        $lp = $tmp_dir . '/assets/css/' . $filename;
        $lw = $asset_web . 'css/' . $filename;
        if (!file_exists($lp)) {
            $css_data = rs_curl($abs, 4 * 1024 * 1024);
            if ($css_data) {
                $total_bytes += strlen($css_data);
                $css_data = rs_process_css($css_data, $abs, $tmp_dir, $asset_web);
                file_put_contents($lp, $css_data);
                $downloaded[preg_replace('/\?.*/', '', $abs)] = $lw;
            }
        }
        if (file_exists($lp)) $node->setAttribute('href', $lw);
    } elseif (str_contains($rel, 'icon') || str_contains($rel, 'apple-touch')) {
        $abs = rs_resolve($source_url, $href);
        if (!$abs) continue;
        $lw = rs_download($abs, 'img', $tmp_dir, $asset_web);
        if ($lw) $node->setAttribute('href', $lw);
    }
}

foreach ($xp->query('//style') as $sn) {
    $css = $sn->textContent;
    if (!$css) continue;
    $proc = rs_process_css($css, $source_url, $tmp_dir, $asset_web);
    while ($sn->firstChild) $sn->removeChild($sn->firstChild);
    $sn->appendChild($dom->createTextNode($proc));
}

foreach ($xp->query('//script[@src]') as $node) {
    $src = trim($node->getAttribute('src'));
    if (!$src || $total_bytes >= $MAX_TOTAL) continue;
    $abs = rs_resolve($source_url, $src);
    if (!$abs) continue;
    $ext = rs_ext($abs);
    $fn  = rs_safename($abs, 'script');
    if ($ext !== 'js') $fn = preg_replace('/\.[^.]+$/', '', $fn) . '.js';
    if (trim($fn, '.') === 'js') $fn = 'script_' . substr(md5($abs), 0, 8) . '.js';
    $lp = $tmp_dir . '/assets/js/' . $fn;
    $lw = $asset_web . 'js/' . $fn;
    if (!file_exists($lp)) {
        $js = rs_curl($abs, 4 * 1024 * 1024);
        if ($js) { $total_bytes += strlen($js); file_put_contents($lp, $js); }
    }
    if (file_exists($lp)) $node->setAttribute('src', $lw);
}

foreach ($xp->query('//img') as $node) {
    $src = trim($node->getAttribute('data-src') ?: $node->getAttribute('src') ?: '');
    if (!$src || str_starts_with($src, 'data:') || $total_bytes >= $MAX_TOTAL) continue;
    $abs = rs_resolve($source_url, $src);
    if (!$abs) continue;
    $lw = rs_download($abs, 'img', $tmp_dir, $asset_web);
    if ($lw) {
        $node->setAttribute('src', $lw);
        $node->removeAttribute('data-src');
        $node->removeAttribute('loading');
        $node->removeAttribute('srcset');
        $node->removeAttribute('data-srcset');
    }
}

foreach ($xp->query('//*[@style]') as $node) {
    $style = $node->getAttribute('style');
    if (!str_contains($style, 'url(')) continue;
    $node->setAttribute('style', rs_process_css($style, $source_url, $tmp_dir, $asset_web));
}

$head = $xp->query('//head')->item(0);
if ($head) {
    $base = $dom->createElement('base');
    $base->setAttribute('href', $source_url);
    $first = $head->firstChild;
    $first ? $head->insertBefore($base, $first) : $head->appendChild($base);
    $head->appendChild($dom->createComment(
        ' Re-scraped by Launchit Admin on ' . date('Y-m-d H:i') . ' from ' . $source_url . ' '
    ));
}

$final_html = $dom->saveHTML();
$final_html = preg_replace('/<\?xml[^>]+>\n?/i', '', $final_html);
file_put_contents($tmp_dir . '/index.html', $final_html);

$meta = [
    'uuid'        => $uuid,
    'source_url'  => $source_url,
    'title'       => $t['name'],
    'scraped_at'  => date('c'),
    'total_bytes' => $total_bytes,
    'asset_count' => count($downloaded),
    'rescrape'    => true,
];
file_put_contents($tmp_dir . '/meta.json', json_encode($meta, JSON_PRETTY_PRINT));

// ── Swap: replace old template files with new ones ────────────────────────────

// Delete old assets (but keep the directory itself)
$old_assets = $dest_dir . '/assets';
if (is_dir($old_assets)) {
    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($old_assets, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iter as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($old_assets);
}
@unlink($dest_dir . '/index.html');
@unlink($dest_dir . '/meta.json');

// Copy new files from tmp into template dir
function rs_copy_dir(string $src, string $dst): void {
    @mkdir($dst, 0755, true);
    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iter as $item) {
        $target = $dst . '/' . $iter->getSubPathname();
        $item->isDir() ? @mkdir($target, 0755, true) : copy($item->getPathname(), $target);
    }
}

rs_copy_dir($tmp_dir, $dest_dir);

// Clean up temp
$tmp_iter = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmp_dir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($tmp_iter as $f) {
    $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
}
@rmdir($tmp_dir);

echo json_encode([
    'success'     => true,
    'template_id' => $template_id,
    'source_url'  => $source_url,
    'total_bytes' => $total_bytes,
    'asset_count' => count($downloaded),
    'scraped_at'  => date('c'),
]);
