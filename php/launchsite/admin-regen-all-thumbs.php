<?php
session_start();
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

// ── GD helpers ────────────────────────────────────────────────────────────────

function hex2rgb_rall(string $hex): array {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
}
function alloc_c_rall($img, string $hex, int $alpha = 0): int {
    [$r,$g,$b] = hex2rgb_rall($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}
function rrect_rall($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void {
    if ($r < 1) $r = 1;
    imagefilledrectangle($img, $x1+$r, $y1,  $x2-$r, $y2,    $color);
    imagefilledrectangle($img, $x1,    $y1+$r,$x2,    $y2-$r, $color);
    imagefilledellipse($img, $x1+$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x1+$r, $y2-$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y2-$r, $r*2, $r*2, $color);
}

function gd_synthetic(array $t, string $thumbs_dir): bool {
    if (!function_exists('imagecreatetruecolor')) return false;
    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!file_exists($fb)) return false;

    $id      = $t['id'];
    $name    = $t['name'];
    $accent  = $t['accent']       ?? '#7c3aed';
    $dark    = $t['dark']         ?? '#0a0b15';
    $light   = $t['light']        ?? '#12152a';
    $tagline = $t['hero_tagline'] ?? $name;

    $W = 900; $H = 620;
    $img = imagecreatetruecolor($W, $H);
    [$dr,$dg,$db] = hex2rgb_rall($dark);
    [$lr,$lg,$lb] = hex2rgb_rall($light);
    [$ar,$ag,$ab] = hex2rgb_rall($accent);

    for ($y = 0; $y < $H; $y++) {
        $tt = $y / $H;
        $c  = imagecolorallocate($img,
            (int)($dr + ($lr-$dr)*$tt*0.7),
            (int)($dg + ($lg-$dg)*$tt*0.7),
            (int)($db + ($lb-$db)*$tt*0.7));
        imagefilledrectangle($img, 0, $y, $W, $y, $c);
    }
    $white = imagecolorallocate($img, 255, 255, 255);
    $acc_c = imagecolorallocate($img, $ar, $ag, $ab);

    for ($rad = 280; $rad >= 20; $rad -= 22) {
        $alpha = (int)(120 - ($rad/280)*118);
        imagefilledellipse($img, (int)($W*0.5), 200, $rad*2, (int)($rad*1.2),
            imagecolorallocatealpha($img, $ar, $ag, $ab, $alpha));
    }
    imagefilledrectangle($img, 0, 0, $W, 52, imagecolorallocatealpha($img,$dr,$dg,$db,30));
    imagefilledrectangle($img, 0, 52, $W, 53, imagecolorallocatealpha($img,255,255,255,115));
    rrect_rall($img, 26, 14, 186, 40, 6, alloc_c_rall($img,$accent,90));
    imagettftext($img, 10, 0, 35, 32, $white, $fb, $name);
    foreach ([240,295,348,398] as $lx)
        rrect_rall($img,$lx,22,$lx+38,30,2,imagecolorallocatealpha($img,255,255,255,100));
    rrect_rall($img, $W-110, 14, $W-26, 40, 13, $acc_c);
    imagettftext($img, 8, 0, $W-100, 31, $white, $fb, 'Book Now');

    $ey = 100;
    imagettftext($img, 9, 0, (int)(($W/2)-44), $ey+42,
        imagecolorallocatealpha($img,min(255,$ar+80),$ag,$ab,50), $fb, 'WELCOME TO');

    $words = explode(' ', $tagline ?: $name); $lines = []; $line = '';
    foreach ($words as $w) {
        $test = $line ? "$line $w" : $w;
        $box  = imagettfbbox(34, 0, $fb, $test);
        if (abs($box[2]-$box[0]) > 540 && $line) { $lines[] = $line; $line = $w; }
        else $line = $test;
    }
    if ($line) $lines[] = $line;
    $ty = $ey + 84;
    foreach (array_slice($lines, 0, 2) as $l) {
        $box = imagettfbbox(34, 0, $fb, $l);
        imagettftext($img, 34, 0, (int)(($W-abs($box[2]-$box[0]))/2), $ty, $white, $fb, $l);
        $ty += 46;
    }
    $ty += 28; $bx = (int)(($W-310)/2);
    rrect_rall($img, $bx, $ty, $bx+160, $ty+38, 19, $acc_c);
    imagettftext($img, 10, 0, $bx+16, $ty+24, $white, $fb, 'Explore Services');
    rrect_rall($img, $bx+176, $ty, $bx+310, $ty+38, 19, imagecolorallocatealpha($img,255,255,255,90));
    imagettftext($img, 10, 0, $bx+192, $ty+24, $white, $fb, 'Learn More');

    $sy  = 405;
    $wbg = imagecolorallocate($img, 250, 250, 252);
    imagefilledrectangle($img, 0, $sy, $W, $H, $wbg);
    $dk = imagecolorallocate($img, 20, 20, 35);
    $md = imagecolorallocate($img, 110, 120, 140);
    $ln = imagecolorallocate($img, 220, 224, 234);
    imagettftext($img, 9,  0, (int)($W/2)-30, $sy+24, $acc_c, $fb, 'OUR SERVICES');
    imagettftext($img, 18, 0, (int)($W/2)-55, $sy+50, $dk,    $fb, 'What We Offer');
    imagettftext($img, 10, 0, (int)($W/2)-90, $sy+68, $md,    $fr, 'Professional services tailored just for you');
    $cw = 236; $gap = 28; $cx0 = (int)(($W-(3*$cw+2*$gap))/2); $cy = $sy + 80;
    $labels = ['Premium Service','Expert Care','Top Results'];
    for ($ci = 0; $ci < 3; $ci++) {
        $cx = $cx0 + $ci*($cw+$gap);
        rrect_rall($img,$cx+3,$cy+4,$cx+$cw+3,$cy+90,8,imagecolorallocatealpha($img,0,0,0,118));
        rrect_rall($img,$cx,$cy,$cx+$cw,$cy+90,8,imagecolorallocate($img,255,255,255));
        rrect_rall($img,$cx+14,$cy+12,$cx+44,$cy+42,6,alloc_c_rall($img,$accent,100));
        imagettftext($img,11,0,$cx+14,$cy+60,$dk,$fb,$labels[$ci]);
        rrect_rall($img,$cx+14,$cy+66,$cx+$cw-20,$cy+70,2,$ln);
        rrect_rall($img,$cx+14,$cy+76,$cx+$cw-50,$cy+80,2,$ln);
    }
    $ok = imagejpeg($img, $thumbs_dir . '/' . $id . '.jpg', 88);
    imagedestroy($img);
    return (bool)$ok;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

$workspace_root    = dirname(dirname(__DIR__));
$screenshot_script = $workspace_root . '/scripts/screenshot-template.mjs';
$thumbs_dir        = __DIR__ . '/assets/img/thumbs';

$node = trim(shell_exec('which node 2>/dev/null') ?: '');
if (!$node || !file_exists($node)) $node = '/home/runner/.nix-profile/bin/node';

$chromium_env = getenv('REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE') ?: '';
$env_prefix   = 'HOME=' . escapeshellarg(getenv('HOME') ?: '/home/runner')
              . ' PATH=' . escapeshellarg(getenv('PATH') ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin')
              . ($chromium_env ? ' REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=' . escapeshellarg($chromium_env) : '');

$has_node       = $node && file_exists($node);
$has_script     = file_exists($screenshot_script);
$can_screenshot = $has_node && $has_script;

// Filter: react only, or all?
$filter = $_POST['filter'] ?? 'react';
if ($filter === 'all') {
    $targets = $all_templates;
} else {
    $targets = array_filter($all_templates, fn($t) => ($t['type'] ?? 'php') === 'react');
}

$total  = count($targets);
$ok_cnt = 0;
$fail   = 0;

// ── Stream HTML ───────────────────────────────────────────────────────────────

ob_implicit_flush(true);
@ob_end_flush();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Regen All Thumbnails — Launchit Admin</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
<style>
.tpl-block           { border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:16px 20px; margin-bottom:14px; }
.tpl-block__header   { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.tpl-block__name     { font-weight:600; color:#fff; font-size:0.95rem; }
.tpl-block__id       { font-family:monospace; font-size:0.75rem; color:rgba(255,255,255,0.35); }
.tpl-block__steps    { list-style:none; margin:0; padding:0; }
.tpl-block__steps li { display:flex; align-items:flex-start; gap:8px; font-size:0.82rem;
                        color:rgba(255,255,255,0.6); padding:3px 0; }
.rall-summary        { display:flex; gap:20px; flex-wrap:wrap; margin-top:24px; padding:18px 22px;
                        background:rgba(255,255,255,0.04); border-radius:10px;
                        border:1px solid rgba(255,255,255,0.08); }
.rall-stat           { text-align:center; }
.rall-stat__num      { font-size:1.8rem; font-weight:700; color:#fff; line-height:1; }
.rall-stat__num--ok  { color:#34d399; }
.rall-stat__num--fail{ color:#f87171; }
.rall-stat__label    { font-size:0.75rem; color:rgba(255,255,255,0.4); margin-top:4px; }
.thumb-preview       { width:100%; max-width:360px; border-radius:8px;
                        border:1px solid rgba(255,255,255,0.1); display:block; margin-top:10px; }
</style>
</head>
<body class="admin-body">
<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin-catalog.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
        <span class="admin-header__tag">Certxa</span>
    </a>
</header>

<div class="admin-layout">
    <div class="admin-page-title">Regenerate All Thumbnails</div>
    <div class="admin-page-sub">
        Processing <strong><?php echo $total; ?></strong>
        <?php echo $filter === 'all' ? 'template(s)' : 'React template(s)'; ?>
        — browser screenshot first, GD fallback if Chromium is unavailable.
    </div>

<?php if ($total === 0): ?>
    <div class="result-box result-box--error" style="margin-top:20px;">
        <div class="result-box__title">No templates found</div>
        <p style="color:rgba(255,255,255,0.5);font-size:0.875rem;margin-top:6px;">
            <?php echo $filter === 'react' ? 'No React templates exist yet. Upload one first.' : 'The catalog is empty.'; ?>
        </p>
    </div>
    <div class="result-actions" style="margin-top:16px;">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--ghost">← Back to Catalog</a>
    </div>
</div></body></html>
<?php exit; endif; ?>

    <div style="margin-top:20px;">
<?php

$idx = 0;
foreach ($targets as $tid => $t):
    $idx++;
    $type     = $t['type'] ?? 'php';
    $name_esc = htmlspecialchars($t['name']);
    $id_esc   = htmlspecialchars($tid);
    $thumb_out = $thumbs_dir . '/' . $tid . '.jpg';
    $method    = '';
    $success   = false;

    echo "<div class='tpl-block'>";
    echo "<div class='tpl-block__header'>";
    echo "<span style='font-size:1rem;'>🖼️</span>";
    echo "<span class='tpl-block__name'>" . $name_esc . "</span>";
    echo "<span class='tpl-block__id'>" . $id_esc . "</span>";
    echo "<span class='tbl-badge tbl-badge--" . htmlspecialchars($type) . "'>" . strtoupper($type) . "</span>";
    echo "<span style='color:rgba(255,255,255,0.3);font-size:0.78rem;margin-left:auto;'>$idx / $total</span>";
    echo "</div>";
    echo "<ul class='tpl-block__steps' id='steps-$id_esc'>";
    @ob_flush(); flush();

    // ── React templates: try browser screenshot first ────────────────────────
    if ($type === 'react' && $can_screenshot) {
        $react_path  = $t['react_path'] ?? ('/launchsite/templates/' . $tid . '/');
        $tmp_jpg     = $thumbs_dir . '/' . $tid . '_tmp_' . time() . '.jpg';

        echo "<li><span>🌐</span><span>Running headless browser screenshot…</span></li>\n";
        @ob_flush(); flush();

        $cmd = "$env_prefix " . escapeshellarg($node)
             . " " . escapeshellarg($screenshot_script)
             . " --id=" . escapeshellarg($tid)
             . " --out=" . escapeshellarg($tmp_jpg)
             . " --port=8104"
             . " 2>&1";

        exec("timeout 60 $cmd", $scr_out, $scr_code);
        $scr_log = implode("\n", $scr_out);

        if ($scr_code === 0 && file_exists($tmp_jpg) && filesize($tmp_jpg) > 5000) {
            rename($tmp_jpg, $thumb_out);
            $success = true;
            $method  = 'browser screenshot';
            echo "<li><span>✅</span><span>Screenshot saved</span></li>\n";
        } else {
            if (file_exists($tmp_jpg)) unlink($tmp_jpg);
            $safe_log = htmlspecialchars(substr(trim($scr_log), 0, 300));
            echo "<li><span>⚠️</span><span>Screenshot failed — falling back to GD"
               . ($safe_log ? "<div class='log-block' style='font-size:0.72rem;max-height:60px;overflow:hidden;'>$safe_log</div>" : '')
               . "</span></li>\n";
            @ob_flush(); flush();
        }
    } elseif ($type === 'react' && !$can_screenshot) {
        echo "<li><span>⚠️</span><span>Headless browser unavailable — using GD fallback</span></li>\n";
    }

    // ── GD fallback (all types, or react when screenshot failed) ─────────────
    if (!$success) {
        $gd_ok = gd_synthetic($t, $thumbs_dir);
        if ($gd_ok) {
            $success = true;
            $method  = 'GD synthetic';
            echo "<li><span>✅</span><span>GD thumbnail generated</span></li>\n";
        } else {
            $fail++;
            echo "<li><span>❌</span><span>GD also failed — check that the GD extension is enabled</span></li>\n";
        }
    }

    if ($success) {
        $ok_cnt++;
        $v = time();
        echo "<li style='display:block;padding:8px 0 4px;'>"
           . "<img src='" . BASE_PATH . "/assets/img/thumbs/" . rawurlencode($tid) . ".jpg?v=$v' "
           . "class='thumb-preview' alt='Thumbnail for " . $name_esc . "'>"
           . "<span style='display:block;font-size:0.72rem;color:rgba(255,255,255,0.3);margin-top:4px;'>Method: $method</span>"
           . "</li>\n";
    }

    echo "</ul></div>\n";
    @ob_flush(); flush();

endforeach;
?>
    </div>

    <!-- Summary -->
    <div class="rall-summary">
        <div class="rall-stat">
            <div class="rall-stat__num"><?php echo $total; ?></div>
            <div class="rall-stat__label">Total processed</div>
        </div>
        <div class="rall-stat">
            <div class="rall-stat__num rall-stat__num--ok"><?php echo $ok_cnt; ?></div>
            <div class="rall-stat__label">Succeeded</div>
        </div>
        <?php if ($fail > 0): ?>
        <div class="rall-stat">
            <div class="rall-stat__num rall-stat__num--fail"><?php echo $fail; ?></div>
            <div class="rall-stat__label">Failed</div>
        </div>
        <?php endif; ?>
    </div>

    <div class="result-actions" style="margin-top:24px;">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--primary">← Back to Catalog</a>
        <?php if ($filter !== 'all'): ?>
        <form method="POST" action="<?php echo BASE_PATH; ?>/admin-regen-all-thumbs.php" style="display:inline;">
            <input type="hidden" name="filter" value="all">
            <button type="submit" class="btn-admin btn-admin--ghost">Regen All Types</button>
        </form>
        <?php endif; ?>
    </div>
</div>
</body>
</html>
