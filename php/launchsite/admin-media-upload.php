<?php
/**
 * admin-media-upload.php
 * POST: slug (nail_salon|hair_salon|barber_shop) + image (file)
 * Returns JSON { ok, file, url } or { ok, error }
 */
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'POST required.']);
    exit;
}

$slug        = preg_replace('/[^a-z_]/', '', $_POST['slug'] ?? '');
$valid_slugs = ['hair_salon', 'barber_shop', 'nail_salon'];

if (!in_array($slug, $valid_slugs)) {
    echo json_encode(['ok' => false, 'error' => 'Invalid category.']);
    exit;
}

$dir = __DIR__ . '/media/' . $slug . '/hero_images';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    echo json_encode(['ok' => false, 'error' => 'Cannot create directory.']);
    exit;
}

$file       = $_FILES['image'] ?? null;
$upload_err = $file['error'] ?? UPLOAD_ERR_NO_FILE;

if (!$file || $upload_err !== UPLOAD_ERR_OK) {
    $err_map = [
        UPLOAD_ERR_INI_SIZE   => 'File too large (server limit).',
        UPLOAD_ERR_FORM_SIZE  => 'File too large.',
        UPLOAD_ERR_PARTIAL    => 'Upload incomplete.',
        UPLOAD_ERR_NO_FILE    => 'No file uploaded.',
        UPLOAD_ERR_NO_TMP_DIR => 'Server temp directory missing.',
        UPLOAD_ERR_CANT_WRITE => 'Cannot write to disk.',
    ];
    echo json_encode(['ok' => false, 'error' => $err_map[$upload_err] ?? 'Upload failed.']);
    exit;
}

// Validate MIME type
$mime         = mime_content_type($file['tmp_name']);
$allowed_mime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

if (!isset($allowed_mime[$mime])) {
    echo json_encode(['ok' => false, 'error' => 'Only JPG, PNG, and WebP images are allowed.']);
    exit;
}

$ext           = $allowed_mime[$mime];
$raw_name      = pathinfo($file['name'], PATHINFO_FILENAME);
$clean_name    = preg_replace('/[^a-z0-9\-_]/', '-', strtolower($raw_name));
$clean_name    = trim(preg_replace('/-+/', '-', $clean_name), '-') ?: 'image';
$filename      = $clean_name . '.' . $ext;

// Avoid filename collisions
$i = 1;
$candidate = $filename;
while (file_exists($dir . '/' . $candidate)) {
    $candidate = $clean_name . '-' . $i . '.' . $ext;
    $i++;
}

if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $candidate)) {
    echo json_encode(['ok' => false, 'error' => 'Could not save file.']);
    exit;
}

$url = BASE_PATH . '/media/' . $slug . '/hero_images/' . rawurlencode($candidate);
echo json_encode(['ok' => true, 'file' => $candidate, 'url' => $url]);
exit;
