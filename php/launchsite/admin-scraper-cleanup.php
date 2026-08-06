<?php
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'POST required']);
    exit;
}

// max_age in seconds — default 24h, minimum 1h
$max_age = max(3600, (int) ($_POST['max_age'] ?? 86400));

$tmp_base = __DIR__ . '/scraped-tmp';

if (!is_dir($tmp_base)) {
    echo json_encode(['success' => true, 'deleted' => 0, 'kept' => 0, 'freed_bytes' => 0, 'freed_kb' => 0]);
    exit;
}

$deleted     = 0;
$kept        = 0;
$freed_bytes = 0;
$sessions    = [];

foreach (scandir($tmp_base) as $entry) {
    if ($entry === '.' || $entry === '..' || str_starts_with($entry, '.')) continue;
    $path = $tmp_base . '/' . $entry;
    if (!is_dir($path)) continue;

    // Determine age: prefer meta.json scraped_at, fall back to dir mtime
    $age      = time() - (int) filemtime($path);
    $meta_file = $path . '/meta.json';
    if (file_exists($meta_file)) {
        $meta = @json_decode(file_get_contents($meta_file), true);
        if (!empty($meta['scraped_at'])) {
            $ts = strtotime($meta['scraped_at']);
            if ($ts) $age = time() - $ts;
        }
    }

    $sessions[] = ['uuid' => $entry, 'age' => $age, 'path' => $path];
}

// ── Process each session ──────────────────────────────────────────────────────

function sc_cleanup_measure_dir(string $path): int {
    $bytes = 0;
    if (!is_dir($path)) return 0;
    try {
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iter as $item) {
            if ($item->isFile()) $bytes += $item->getSize();
        }
    } catch (Exception $e) {}
    return $bytes;
}

function sc_cleanup_delete_dir(string $path): void {
    if (!is_dir($path)) return;
    try {
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iter as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
    } catch (Exception $e) {}
    @rmdir($path);
}

foreach ($sessions as $s) {
    if ($s['age'] >= $max_age) {
        $freed_bytes += sc_cleanup_measure_dir($s['path']);
        sc_cleanup_delete_dir($s['path']);
        $deleted++;
    } else {
        $kept++;
    }
}

// Write last-run timestamp
@file_put_contents($tmp_base . '/.last-cleanup', date('c'));

echo json_encode([
    'success'     => true,
    'deleted'     => $deleted,
    'kept'        => $kept,
    'freed_bytes' => $freed_bytes,
    'freed_kb'    => (int) round($freed_bytes / 1024),
    'ran_at'      => date('c'),
    'max_age_h'   => round($max_age / 3600, 1),
]);
