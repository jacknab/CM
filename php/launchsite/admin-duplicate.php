<?php
session_start();
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

// ── Validate inputs ───────────────────────────────────────────────────────────

$source_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['source_id'] ?? '')));
$new_id    = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['new_id']    ?? '')));
$new_name  = trim($_POST['new_name'] ?? '');

$errors = [];

if (!$source_id || !isset($all_templates[$source_id])) {
    $errors[] = 'Source template not found: ' . htmlspecialchars($source_id);
}
if (!$new_id) {
    $errors[] = 'New template ID is required.';
} elseif (!preg_match('/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/', $new_id) && strlen($new_id) > 1) {
    $errors[] = 'Template ID must contain only lowercase letters, numbers, and hyphens.';
} elseif (isset($all_templates[$new_id])) {
    $errors[] = 'A template with ID "' . htmlspecialchars($new_id) . '" already exists.';
}

if ($errors) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => implode(' ', $errors)];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$src      = $all_templates[$source_id];
$type     = $src['type'] ?? 'php';
$src_name = $src['name'] ?? $source_id;
if ($new_name === '') {
    $new_name = 'Copy of ' . $src_name;
}

$thumbs_dir   = __DIR__ . '/assets/img/thumbs';
$src_thumb    = $thumbs_dir . '/' . $source_id . '.jpg';
$new_thumb    = $thumbs_dir . '/' . $new_id    . '.jpg';
$templates_dir = __DIR__ . '/templates';
$src_built    = $templates_dir . '/' . $source_id;
$new_built    = $templates_dir . '/' . $new_id;

// ── Copy built React files (if react) ────────────────────────────────────────

$copied_files = false;
if ($type === 'react') {
    if (is_dir($src_built)) {
        exec('cp -r ' . escapeshellarg($src_built) . ' ' . escapeshellarg($new_built), $out, $code);
        if ($code !== 0) {
            $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Failed to copy built template files.'];
            header('Location: ' . BASE_PATH . '/admin-catalog.php');
            exit;
        }
        $copied_files = true;
    }
}

// ── Copy thumbnail ────────────────────────────────────────────────────────────

if (file_exists($src_thumb)) {
    copy($src_thumb, $new_thumb);
}

// ── Build new registry entry ──────────────────────────────────────────────────

$new_entry = $src;
$new_entry['id']       = $new_id;
$new_entry['name']     = $new_name;
$new_entry['url_slug'] = $new_id;
$new_entry['badge']    = 'new';

if ($type === 'react') {
    $new_entry['react_path'] = '/launchsite/templates/' . $new_id . '/';
}

// ── Save duplicated entry to database ────────────────────────────────────────

if (!launchit_insert_template($new_entry)) {
    $_SESSION['flash'] = [
        'type' => 'error',
        'msg'  => 'Database error — could not duplicate template. Please try again.',
    ];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Done ──────────────────────────────────────────────────────────────────────

$detail = $type === 'react'
    ? ($copied_files ? ' Built site files copied.' : ' (No built files found to copy.)')
    : ' PHP template files are shared with the original — update name, colors, and description as needed.';

$_SESSION['flash'] = [
    'type' => 'success',
    'msg'  => '"' . $new_name . '" (' . $new_id . ') duplicated from "' . $src_name . '".' . $detail,
];

header('Location: ' . BASE_PATH . '/admin-catalog.php');
exit;
