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

$t          = $all_templates[$template_id];
$thumbs_dir = __DIR__ . '/assets/img/thumbs';
$type       = $t['type'] ?? 'php';

// ── GD helpers (shared) ───────────────────────────────────────────────────────

function hex2rgb_t(string $hex): array {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
}
function alloc_ct($img, string $hex, int $alpha = 0): int {
    [$r,$g,$b] = hex2rgb_t($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}
function rrect_t($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void {
    if ($r < 1) $r = 1;
    imagefilledrectangle($img, $x1+$r, $y1, $x2-$r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1+$r, $x2, $y2-$r, $color);
    imagefilledellipse($img, $x1+$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x1+$r, $y2-$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y2-$r, $r*2, $r*2, $color);
}

function generate_php_thumb(array $t, string $thumbs_dir): bool {
    if (!function_exists('imagecreatetruecolor')) return false;
    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!file_exists($fb)) return false;

    $id      = $t['id'];
    $name    = $t['name'];
    $accent  = $t['accent'] ?? '#7c3aed';
    $dark    = $t['dark']   ?? '#0a0b15';
    $light   = $t['light']  ?? '#12152a';
    $tagline = $t['hero_tagline'] ?? $name;

    $W = 900; $H = 620;
    $img = imagecreatetruecolor($W, $H);
    [$dr,$dg,$db] = hex2rgb_t($dark);
    [$lr,$lg,$lb] = hex2rgb_t($light);
    [$ar,$ag,$ab] = hex2rgb_t($accent);

    for ($y = 0; $y < $H; $y++) {
        $tt = $y/$H;
        $c  = imagecolorallocate($img,
            (int)($dr+($lr-$dr)*$tt*0.7),
            (int)($dg+($lg-$dg)*$tt*0.7),
            (int)($db+($lb-$db)*$tt*0.7));
        imagefilledrectangle($img, 0, $y, $W, $y, $c);
    }

    $white = imagecolorallocate($img, 255, 255, 255);
    $acc_c = imagecolorallocate($img, $ar, $ag, $ab);

    for ($rad = 280; $rad >= 20; $rad -= 22) {
        $alpha = (int)(120 - ($rad/280)*118);
        imagefilledellipse($img, (int)($W*0.5), 200, $rad*2, (int)($rad*1.2),
            imagecolorallocatealpha($img,$ar,$ag,$ab,$alpha));
    }
    imagefilledrectangle($img, 0, 0, $W, 52, imagecolorallocatealpha($img,$dr,$dg,$db,30));
    imagefilledrectangle($img, 0, 52, $W, 53, imagecolorallocatealpha($img,255,255,255,115));
    rrect_t($img, 26, 14, 186, 40, 6, alloc_ct($img,$accent,90));
    imagettftext($img, 10, 0, 35, 32, $white, $fb, $name);
    foreach ([240,295,348,398] as $lx)
        rrect_t($img,$lx,22,$lx+38,30,2,imagecolorallocatealpha($img,255,255,255,100));
    rrect_t($img, $W-110, 14, $W-26, 40, 13, $acc_c);
    imagettftext($img, 8, 0, $W-100, 31, $white, $fb, 'Book Now');

    $ey = 100;
    imagettftext($img, 9, 0, (int)(($W/2)-44), $ey+42,
        imagecolorallocatealpha($img,min(255,$ar+80),$ag,$ab,50), $fb, 'WELCOME TO');

    $words = explode(' ', $tagline ?: $name); $lines = []; $line = '';
    foreach ($words as $w) {
        $test = $line ? "$line $w" : $w;
        $box  = imagettfbbox(34, 0, $fb, $test);
        if (abs($box[2]-$box[0]) > 540 && $line) { $lines[] = $line; $line = $w; } else $line = $test;
    }
    if ($line) $lines[] = $line;
    $ty = $ey + 84;
    foreach (array_slice($lines, 0, 2) as $l) {
        $box = imagettfbbox(34, 0, $fb, $l);
        imagettftext($img, 34, 0, (int)(($W-abs($box[2]-$box[0]))/2), $ty, $white, $fb, $l);
        $ty += 46;
    }
    $ty += 28; $bx = (int)(($W-310)/2);
    rrect_t($img, $bx, $ty, $bx+160, $ty+38, 19, $acc_c);
    imagettftext($img, 10, 0, $bx+16, $ty+24, $white, $fb, 'Explore Services');
    rrect_t($img, $bx+176, $ty, $bx+310, $ty+38, 19, imagecolorallocatealpha($img,255,255,255,90));
    imagettftext($img, 10, 0, $bx+192, $ty+24, $white, $fb, 'Learn More');

    $sy  = 405; $wbg = imagecolorallocate($img, 250, 250, 252);
    imagefilledrectangle($img, 0, $sy, $W, $H, $wbg);
    $dk = imagecolorallocate($img, 20, 20, 35);
    $md = imagecolorallocate($img, 110, 120, 140);
    $ln = imagecolorallocate($img, 220, 224, 234);
    imagettftext($img, 9,  0, (int)($W/2)-30, $sy+24, $acc_c, $fb, 'OUR SERVICES');
    imagettftext($img, 18, 0, (int)($W/2)-55, $sy+50, $dk,    $fb, 'What We Offer');
    imagettftext($img, 10, 0, (int)($W/2)-90, $sy+68, $md,    $fr, 'Professional services tailored just for you');
    $cw = 236; $gap = 28; $cx0 = (int)(($W-(3*$cw+2*$gap))/2); $cy = $sy + 80;
    $labels = ['Premium Service', 'Expert Care', 'Top Results'];
    for ($ci = 0; $ci < 3; $ci++) {
        $cx = $cx0 + $ci*($cw+$gap);
        rrect_t($img,$cx+3,$cy+4,$cx+$cw+3,$cy+90,8,imagecolorallocatealpha($img,0,0,0,118));
        rrect_t($img,$cx,$cy,$cx+$cw,$cy+90,8,imagecolorallocate($img,255,255,255));
        rrect_t($img,$cx+14,$cy+12,$cx+44,$cy+42,6,alloc_ct($img,$accent,100));
        imagettftext($img,11,0,$cx+14,$cy+60,$dk,$fb,$labels[$ci]);
        rrect_t($img,$cx+14,$cy+66,$cx+$cw-20,$cy+70,2,$ln);
        rrect_t($img,$cx+14,$cy+76,$cx+$cw-50,$cy+80,2,$ln);
    }
    $ok = imagejpeg($img, $thumbs_dir . '/' . $id . '.jpg', 88);
    imagedestroy($img);
    return (bool)$ok;
}

// ── PHP templates: quick GD regen, redirect back ──────────────────────────────

if ($type !== 'react') {
    $ok = generate_php_thumb($t, $thumbs_dir);
    $_SESSION['flash'] = $ok
        ? ['type' => 'success', 'msg' => 'Thumbnail regenerated for "' . $t['name'] . '"']
        : ['type' => 'error',   'msg' => 'Could not regenerate thumbnail — GD library unavailable.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── React templates: real browser screenshot, stream progress ─────────────────

ob_implicit_flush(true);
@ob_end_flush();

function step_t(string $icon, string $msg): void {
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span><span>$msg</span></li>\n";
    @ob_flush(); flush();
}
function step_log_t(string $icon, string $msg, string $log): void {
    $safe = htmlspecialchars(trim($log));
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span>"
       . "<span>$msg<div class='log-block'>$safe</div></span></li>\n";
    @ob_flush(); flush();
}

$name_safe = htmlspecialchars($t['name']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Regen Thumbnail — <?php echo $name_safe; ?></title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head>
<body class="admin-body">
<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin-catalog.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
    </a>
</header>

<div class="install-result">
    <div class="admin-page-title" style="margin-bottom:6px;">Regenerating Thumbnail</div>
    <div class="admin-page-sub" style="margin-bottom:24px;">
        <strong><?php echo $name_safe; ?></strong>
        &nbsp;·&nbsp; <span class="tbl-badge tbl-badge--react">REACT</span>
        &nbsp;·&nbsp; Real browser screenshot
    </div>

    <div class="result-box result-box--success">
        <div class="result-box__title" style="margin-bottom:14px;">Progress</div>
        <ul class="result-steps" id="steps">
<?php

$workspace_root    = dirname(dirname(__DIR__));
$screenshot_script = $workspace_root . '/scripts/screenshot-template.mjs';

$node = trim(shell_exec('which node 2>/dev/null') ?: '');
if (!$node || !file_exists($node)) $node = '/home/runner/.nix-profile/bin/node';

$chromium_env = getenv('REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE') ?: '';
$env_prefix   = 'HOME=' . escapeshellarg(getenv('HOME') ?: '/home/runner')
              . ' PATH=' . escapeshellarg(getenv('PATH') ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin')
              . ($chromium_env ? ' REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=' . escapeshellarg($chromium_env) : '');

// Validate script exists
if (!file_exists($screenshot_script)) {
    step_t('❌', "Screenshot script not found at <code>scripts/screenshot-template.mjs</code>");
    echo "</ul></div><div class='result-actions' style='margin-top:24px;'>"
       . "<a href='" . BASE_PATH . "/admin-catalog.php' class='btn-admin btn-admin--ghost'>← Back to Admin</a>"
       . "</div></div></body></html>";
    exit;
}

// PHP server runs on port 8104
$react_path   = $t['react_path'] ?? ('/launchsite/templates/' . $template_id . '/');
$template_url = 'http://localhost:8104' . $react_path;

step_t('🌐', "Template URL: <code>" . htmlspecialchars($template_url) . "</code>");
step_t('🖥️', 'Launching headless browser at 1280×800 viewport…
    <span id="ss-tick" style="color:rgba(255,255,255,0.4);font-family:monospace;margin-left:6px;"></span>');

$tmp_jpg = $thumbs_dir . '/' . $template_id . '_tmp_' . time() . '.jpg';
$out_jpg = $thumbs_dir . '/' . $template_id . '.jpg';

$cmd = "$env_prefix " . escapeshellarg($node)
     . " " . escapeshellarg($screenshot_script)
     . " --id=" . escapeshellarg($template_id)
     . " --out=" . escapeshellarg($tmp_jpg)
     . " --port=8104"
     . " 2>&1";

$desc    = [['pipe','r'], ['pipe','w'], ['pipe','w']];
$proc    = proc_open($cmd, $desc, $pipes);
$output  = ''; $tick = 0; $last = time();

if (is_resource($proc)) {
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    while (!feof($pipes[1])) {
        $chunk = fread($pipes[1], 4096);
        if ($chunk !== false && $chunk !== '') $output .= $chunk;
        if (time() - $last >= 2) {
            $tick++;
            $dots = str_repeat('·', ($tick % 5) ?: 5);
            $secs = $tick * 2;
            echo "<script>var el=document.getElementById('ss-tick');if(el)el.textContent='$dots {$secs}s';</script>\n";
            @ob_flush(); flush();
            $last = time();
        }
        usleep(200000);
    }
    echo "<script>var el=document.getElementById('ss-tick');if(el)el.textContent='done';</script>\n";
    @ob_flush(); flush();
    fclose($pipes[1]);
    $exit_code = proc_close($proc);
} else {
    $exit_code = 1; $output = 'proc_open() failed — check server configuration';
}

$screenshot_ok = ($exit_code === 0 && file_exists($tmp_jpg) && filesize($tmp_jpg) > 5000);

if ($screenshot_ok) {
    rename($tmp_jpg, $out_jpg);
    step_t('📸', 'Screenshot captured — header &amp; hero at 1440px → scaled to 900×620');
    step_t('✅', "Thumbnail saved → <code>assets/img/thumbs/" . htmlspecialchars($template_id) . ".jpg</code>");

    $v = time();
    echo "<li class='result-step' style='display:block;padding:16px 0 4px;'>"
       . "<img src='" . BASE_PATH . "/assets/img/thumbs/" . urlencode($template_id) . ".jpg?v=$v' "
       . "style='width:100%;max-width:540px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);display:block;' "
       . "alt='Generated thumbnail'>"
       . "</li>\n";
    @ob_flush(); flush();

} else {
    if (file_exists($tmp_jpg)) unlink($tmp_jpg);
    step_log_t('⚠️', 'Screenshot failed — falling back to GD synthetic thumbnail', trim($output));
    $gd_ok = generate_php_thumb($t, $thumbs_dir);
    step_t($gd_ok ? '✅' : '❌', $gd_ok ? 'GD fallback thumbnail generated' : 'GD fallback also failed');
}

?>
        </ul>
    </div>

    <div class="result-actions" style="margin-top:24px;">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--primary">← Back to Admin</a>
        <a href="<?php echo BASE_PATH; ?>/preview.php?id=<?php echo urlencode($template_id); ?>"
           class="btn-admin btn-admin--orange">Preview Template ↗</a>
    </div>
</div>
</body>
</html>
