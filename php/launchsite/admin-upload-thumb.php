<?php
session_start();
require_once __DIR__ . '/config.php';


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));

if (!$template_id || !isset($all_templates[$template_id])) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Template not found: ' . htmlspecialchars($template_id)];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$thumbs_dir = __DIR__ . '/assets/img/thumbs';

// ── Validate upload ───────────────────────────────────────────────────────────

$upload_err_map = [
    UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit.',
    UPLOAD_ERR_FORM_SIZE  => 'File too large.',
    UPLOAD_ERR_PARTIAL    => 'File only partially uploaded.',
    UPLOAD_ERR_NO_FILE    => 'No file uploaded.',
    UPLOAD_ERR_NO_TMP_DIR => 'Missing server temp folder.',
    UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
    UPLOAD_ERR_EXTENSION  => 'Upload blocked by server.',
];

$upload_code = $_FILES['thumbimage']['error'] ?? UPLOAD_ERR_NO_FILE;
if ($upload_code !== UPLOAD_ERR_OK) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => $upload_err_map[$upload_code] ?? "Upload error (code $upload_code)."];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$tmp   = $_FILES['thumbimage']['tmp_name'];
$mime  = mime_content_type($tmp);
$allowed = ['image/jpeg', 'image/png', 'image/webp'];

if (!in_array($mime, $allowed)) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Only JPG, PNG, and WebP images are accepted.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Load with GD ──────────────────────────────────────────────────────────────

if (!function_exists('imagecreatetruecolor')) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'GD library is not available on this server.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$src = match ($mime) {
    'image/jpeg' => @imagecreatefromjpeg($tmp),
    'image/png'  => @imagecreatefrompng($tmp),
    'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmp) : false,
    default      => false,
};

if (!$src) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Could not read the uploaded image. It may be corrupt.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Resize & centre-crop to 900×620 ──────────────────────────────────────────

$TW = 900; $TH = 620;
$sw = imagesx($src); $sh = imagesy($src);

// Scale so the image fills 900×620 (cover), then centre-crop
$scale = max($TW / $sw, $TH / $sh);
$nw    = (int)($sw * $scale);
$nh    = (int)($sh * $scale);
$ox    = (int)(($nw - $TW) / 2);
$oy    = (int)(($nh - $TH) / 2);

$scaled = imagecreatetruecolor($nw, $nh);

// Preserve alpha for PNG/WebP before resizing
imagealphablending($scaled, false);
imagesavealpha($scaled, true);
$trans = imagecolorallocatealpha($scaled, 0, 0, 0, 127);
imagefilledrectangle($scaled, 0, 0, $nw, $nh, $trans);

imagecopyresampled($scaled, $src, 0, 0, 0, 0, $nw, $nh, $sw, $sh);
imagedestroy($src);

$out = imagecreatetruecolor($TW, $TH);
imagecopy($out, $scaled, 0, 0, $ox, $oy, $TW, $TH);
imagedestroy($scaled);

// ── Save as JPEG ──────────────────────────────────────────────────────────────

$out_path = $thumbs_dir . '/' . $template_id . '.jpg';
$ok       = imagejpeg($out, $out_path, 92);
imagedestroy($out);

if ($ok) {
    $name = $all_templates[$template_id]['name'] ?? $template_id;
    $_SESSION['flash'] = [
        'type' => 'success',
        'msg'  => 'Catalog image updated for "' . $name . '" — resized to 900×620.',
    ];
} else {
    $_SESSION['flash'] = [
        'type' => 'error',
        'msg'  => 'Image was uploaded but could not be saved. Check folder permissions.',
    ];
}

header('Location: ' . BASE_PATH . '/admin-catalog.php');
exit;
