<?php
/**
 * admin-media-delete.php
 * POST: slug + file
 * Returns JSON { ok } or { ok, error }
 */
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'POST required.']);
    exit;
}

$slug        = preg_replace('/[^a-z_]/', '', $_POST['slug'] ?? '');
$filename    = preg_replace('/[^a-zA-Z0-9\-_.]/', '', $_POST['file'] ?? '');
$valid_slugs = ['hair_salon', 'barber_shop', 'nail_salon'];

if (!in_array($slug, $valid_slugs) || !$filename) {
    echo json_encode(['ok' => false, 'error' => 'Invalid parameters.']);
    exit;
}

$base_dir = realpath(__DIR__ . '/media');
$path     = __DIR__ . '/media/' . $slug . '/hero_images/' . $filename;
$real     = realpath($path);

// Path traversal guard
if (!$real || !$base_dir || !str_starts_with($real, $base_dir)) {
    echo json_encode(['ok' => false, 'error' => 'Invalid path.']);
    exit;
}

if (!file_exists($real)) {
    echo json_encode(['ok' => false, 'error' => 'File not found.']);
    exit;
}

if (@unlink($real)) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['ok' => false, 'error' => 'Could not delete file.']);
}
exit;
