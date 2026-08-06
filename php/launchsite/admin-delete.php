<?php
session_start();
require_once __DIR__ . '/config.php';


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));
$errors = [];

if (!$template_id) {
    $errors[] = 'No template ID provided.';
} elseif (!isset($all_templates[$template_id])) {
    $errors[] = "Template ID <code>" . htmlspecialchars($template_id) . "</code> not found in the catalog.";
}

$template     = $errors ? [] : $all_templates[$template_id];
$type         = $template['type'] ?? 'php';
$name         = $template['name'] ?? $template_id;

$workspace_root  = dirname(__DIR__);
$artifacts_dir   = $workspace_root . '/artifacts';
$built_dir       = __DIR__ . '/templates/' . $template_id;
$source_dir      = $artifacts_dir . '/template-' . $template_id;
$thumb_file      = __DIR__ . '/assets/img/thumbs/' . $template_id . '.jpg';

if ($errors) {
    // Show error page
    ?><!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Delete Error — Launchit Admin</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head><body class="admin-body">
<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin-catalog.php">
        <div class="admin-header__logo">🚀</div> Launchit Admin
    </a>
</header>
<div class="install-result">
    <div class="result-box result-box--error">
        <div class="result-box__title">Could not delete template</div>
        <ul style="margin-top:8px;padding-left:20px;color:rgba(255,255,255,0.6);font-size:0.875rem;line-height:1.9;">
            <?php foreach ($errors as $e): ?><li><?php echo $e; ?></li><?php endforeach; ?>
        </ul>
    </div>
    <div class="result-actions">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--ghost">← Back to Admin</a>
    </div>
</div></body></html><?php
    exit;
}

// ── Remove entry from database ────────────────────────────────────────────────
launchit_delete_template($template_id);

$deleted  = [];
$skipped  = [];

// ── Delete built React site ───────────────────────────────────────────────────
if ($type === 'react' && is_dir($built_dir)) {
    exec('rm -rf ' . escapeshellarg($built_dir), $out, $code);
    if ($code === 0) $deleted[] = 'Built site files (<code>launchsite-php/templates/' . $template_id . '/</code>)';
    else             $skipped[] = 'Built site directory (rm failed)';
}

// ── Delete artifact source ────────────────────────────────────────────────────
if ($type === 'react' && is_dir($source_dir)) {
    exec('rm -rf ' . escapeshellarg($source_dir), $out, $code);
    if ($code === 0) $deleted[] = 'Source files (<code>artifacts/template-' . $template_id . '/</code>)';
    else             $skipped[] = 'Source directory (rm failed)';
}

// ── Delete thumbnail ──────────────────────────────────────────────────────────
if (file_exists($thumb_file)) {
    if (unlink($thumb_file)) $deleted[] = 'Thumbnail image';
    else                     $skipped[] = 'Thumbnail (unlink failed)';
}

$deleted[] = 'Catalog entry from database';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Template Deleted — Launchit Admin</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head>
<body class="admin-body">
<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin-catalog.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
        <span class="admin-header__tag">Certxa</span>
    </a>
</header>

<div class="install-result">
    <div class="admin-page-title" style="margin-bottom:6px;">Template Deleted</div>
    <div class="admin-page-sub" style="margin-bottom:24px;">
        <code><?php echo htmlspecialchars($template_id); ?></code> — <?php echo htmlspecialchars($name); ?>
    </div>

    <div class="result-box result-box--success">
        <div class="result-box__title" style="margin-bottom:14px;">🗑️ Deletion complete</div>
        <p style="color:rgba(255,255,255,0.5);font-size:0.8rem;margin-bottom:12px;">The following were removed:</p>
        <ul class="result-steps">
            <?php foreach ($deleted as $item): ?>
            <li class="result-step">
                <span class="result-step__icon">✅</span>
                <span><?php echo $item; ?></span>
            </li>
            <?php endforeach; ?>
            <?php foreach ($skipped as $item): ?>
            <li class="result-step">
                <span class="result-step__icon">⚠️</span>
                <span><?php echo htmlspecialchars($item); ?></span>
            </li>
            <?php endforeach; ?>
        </ul>
    </div>

    <div class="result-actions" style="margin-top:24px;">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--primary">← Back to Admin</a>
    </div>
</div>
</body>
</html>
