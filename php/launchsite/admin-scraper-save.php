<?php
session_start();
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

// ── Validate inputs ────────────────────────────────────────────────────────────

$uuid        = preg_replace('/[^a-f0-9]/', '', trim($_POST['uuid'] ?? ''));
$name        = trim($_POST['name'] ?? '');
$category    = trim($_POST['category'] ?? '');
$template_id = strtolower(trim($_POST['template_id'] ?? ''));
$template_id = preg_replace('/[^a-z0-9\-]/', '-', $template_id);
$template_id = trim(preg_replace('/-+/', '-', $template_id), '-');
$source_url  = trim($_POST['source_url'] ?? '');
$style       = trim($_POST['style'] ?? 'Scraped');
$badge       = in_array(trim($_POST['badge'] ?? ''), ['', 'new', 'popular', 'premium'])
                   ? trim($_POST['badge'] ?? '') : 'new';

$valid_categories = ['Hair Salon', 'Barbershop', 'Nail Salon'];

if (!$uuid || !$name || !$template_id || !in_array($category, $valid_categories)) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Missing required fields. Please go back and fill everything in.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

if (isset($all_templates[$template_id])) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Template ID "' . htmlspecialchars($template_id) . '" already exists. Choose a different ID.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$tmpDir = __DIR__ . '/scraped-tmp/' . $uuid;
if (!is_dir($tmpDir) || !file_exists($tmpDir . '/index.html')) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Scraped session not found or expired. Please re-scrape the URL.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Move tmp → templates/{id} ──────────────────────────────────────────────────

$destDir = __DIR__ . '/templates/' . $template_id;

if (!rename($tmpDir, $destDir)) {
    function sc_copy_dir(string $src, string $dst): void {
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
    sc_copy_dir($tmpDir, $destDir);
    $tmpIter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($tmpIter as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($tmpDir);
}

if (!is_dir($destDir) || !file_exists($destDir . '/index.html')) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Failed to move scraped files into templates directory. Check server permissions.'];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Build template entry ───────────────────────────────────────────────────────

$metaPath  = $destDir . '/meta.json';
$meta      = file_exists($metaPath) ? (json_decode(file_get_contents($metaPath), true) ?? []) : [];
$actualSrc = $meta['source_url'] ?? $source_url;

$new_entry = [
    'id'            => $template_id,
    'name'          => $name,
    'category'      => $category,
    'style'         => $style ?: 'Scraped',
    'desc'          => 'Website scraped from ' . ($actualSrc ?: 'external source') . '. Full original layout preserved.',
    'badge'         => $badge,
    'features'      => ['Full Layout', 'Custom Design', 'Scraped'],
    'accent'        => '#a855f7',
    'dark'          => '#0a0b15',
    'light'         => '#1c1d27',
    'url_slug'      => $template_id,
    'hero_tagline'  => $name,
    'hero_sub'      => 'Professional website template.',
    'business_name' => $name,
    'type'          => 'scraped',
    'scraped_path'  => '/launchsite/templates/' . $template_id . '/index.html',
    'source_url'    => $actualSrc,
];

// ── Save to database ───────────────────────────────────────────────────────────

if (!launchit_insert_template($new_entry)) {
    $_SESSION['flash'] = [
        'type' => 'error',
        'msg'  => 'Database error — could not save the scraped template. Please try again.',
    ];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── GD fallback thumbnail (synthetic, no browser required) ────────────────────

function sc_generate_gd_thumb(array $t, string $thumbs_dir): bool {
    if (!function_exists('imagecreatetruecolor')) return false;
    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!file_exists($fb)) return false;

    $id = $t['id']; $name = $t['name'];
    $accent = $t['accent'] ?? '#a855f7';
    $dark   = $t['dark']   ?? '#0a0b15';
    $light  = $t['light']  ?? '#1c1d27';
    $tagline = $t['hero_tagline'] ?? $name;

    $W = 900; $H = 620;
    $img = imagecreatetruecolor($W, $H);

    $hex2rgb = fn(string $h): array => (function($h) {
        $h = ltrim($h,'#');
        if (strlen($h)===3) $h=$h[0].$h[0].$h[1].$h[1].$h[2].$h[2];
        return [hexdec(substr($h,0,2)),hexdec(substr($h,2,2)),hexdec(substr($h,4,2))];
    })($h);

    [$dr,$dg,$db] = $hex2rgb($dark);
    [$lr,$lg,$lb] = $hex2rgb($light);
    [$ar,$ag,$ab] = $hex2rgb($accent);

    for ($y = 0; $y < $H; $y++) {
        $tt = $y/$H;
        $c = imagecolorallocate($img,
            (int)($dr+($lr-$dr)*$tt*0.7),
            (int)($dg+($lg-$dg)*$tt*0.7),
            (int)($db+($lb-$db)*$tt*0.7));
        imagefilledrectangle($img, 0, $y, $W, $y, $c);
    }

    $white = imagecolorallocate($img, 255,255,255);
    $acc_c = imagecolorallocate($img, $ar,$ag,$ab);

    $rrect = function($img, $x1,$y1,$x2,$y2,$r,$color) {
        imagefilledrectangle($img,$x1+$r,$y1,$x2-$r,$y2,$color);
        imagefilledrectangle($img,$x1,$y1+$r,$x2,$y2-$r,$color);
        imagefilledellipse($img,$x1+$r,$y1+$r,$r*2,$r*2,$color);
        imagefilledellipse($img,$x2-$r,$y1+$r,$r*2,$r*2,$color);
        imagefilledellipse($img,$x1+$r,$y2-$r,$r*2,$r*2,$color);
        imagefilledellipse($img,$x2-$r,$y2-$r,$r*2,$r*2,$color);
    };

    for ($rad=280; $rad>=20; $rad-=22) {
        $alpha=(int)(120-($rad/280)*118);
        imagefilledellipse($img,(int)($W*0.5),200,$rad*2,(int)($rad*1.2),
            imagecolorallocatealpha($img,$ar,$ag,$ab,$alpha));
    }

    imagefilledrectangle($img,0,0,$W,52,imagecolorallocatealpha($img,$dr,$dg,$db,30));
    imagefilledrectangle($img,0,52,$W,53,imagecolorallocatealpha($img,255,255,255,115));
    $rrect($img,26,14,186,40,6,imagecolorallocatealpha($img,$ar,$ag,$ab,90));
    imagettftext($img,10,0,35,32,$white,$fb,$name);
    foreach([240,295,348,398] as $lx)
        $rrect($img,$lx,22,$lx+38,30,2,imagecolorallocatealpha($img,255,255,255,100));
    $rrect($img,$W-110,14,$W-26,40,13,$acc_c);
    imagettftext($img,8,0,$W-100,31,$white,$fb,'Book Now');

    $words=explode(' ',$tagline??$name); $lines_t=[]; $line_t='';
    foreach($words as $w) {
        $test=$line_t?"$line_t $w":$w;
        $box=imagettfbbox(34,0,$fb,$test);
        if(abs($box[2]-$box[0])>540&&$line_t){$lines_t[]=$line_t;$line_t=$w;}else $line_t=$test;
    }
    if($line_t)$lines_t[]=$line_t;
    $ty=184;
    foreach(array_slice($lines_t,0,2) as $l){
        $box=imagettfbbox(34,0,$fb,$l);
        imagettftext($img,34,0,(int)(($W-abs($box[2]-$box[0]))/2),$ty,$white,$fb,$l);
        $ty+=46;
    }
    $ty+=28; $bx=(int)(($W-310)/2);
    $rrect($img,$bx,$ty,$bx+160,$ty+38,19,$acc_c);
    imagettftext($img,10,0,$bx+16,$ty+24,$white,$fb,'Explore Services');
    $rrect($img,$bx+176,$ty,$bx+310,$ty+38,19,imagecolorallocatealpha($img,255,255,255,90));
    imagettftext($img,10,0,$bx+192,$ty+24,$white,$fb,'Learn More');

    $sy=405; $wbg=imagecolorallocate($img,250,250,252);
    imagefilledrectangle($img,0,$sy,$W,$H,$wbg);
    $dk=imagecolorallocate($img,20,20,35);
    $md=imagecolorallocate($img,110,120,140);
    imagettftext($img,9,0,(int)($W/2)-30,$sy+24,$acc_c,$fb,'OUR SERVICES');
    imagettftext($img,18,0,(int)($W/2)-55,$sy+50,$dk,$fb,'What We Offer');
    imagettftext($img,10,0,(int)($W/2)-90,$sy+68,$md,$fr,'Professional services tailored just for you');
    $cw=236; $gap=28; $cx0=(int)(($W-(3*$cw+2*$gap))/2); $cy=$sy+80;
    $labels=['Premium Service','Expert Care','Top Results'];
    for($ci=0;$ci<3;$ci++){
        $cx=$cx0+$ci*($cw+$gap);
        $rrect($img,$cx+3,$cy+4,$cx+$cw+3,$cy+90,8,imagecolorallocatealpha($img,0,0,0,118));
        $rrect($img,$cx,$cy,$cx+$cw,$cy+90,8,imagecolorallocate($img,255,255,255));
        $rrect($img,$cx+14,$cy+12,$cx+44,$cy+42,6,imagecolorallocatealpha($img,$ar,$ag,$ab,100));
        imagettftext($img,11,0,$cx+14,$cy+60,$dk,$fb,$labels[$ci]);
    }
    $ok = imagejpeg($img, $thumbs_dir.'/'.$id.'.jpg', 88);
    imagedestroy($img);
    return (bool)$ok;
}

// ── Start streaming progress page ─────────────────────────────────────────────

ob_implicit_flush(true);
@ob_end_flush();

$name_safe = htmlspecialchars($name);
$id_safe   = htmlspecialchars($template_id);

function step(string $icon, string $msg): void {
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span><span>$msg</span></li>\n";
    @ob_flush(); flush();
}
function step_log(string $icon, string $msg, string $log): void {
    $safe = htmlspecialchars(trim($log));
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span>"
       . "<span>$msg<div class='log-block'>$safe</div></span></li>\n";
    @ob_flush(); flush();
}

?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saving Template — <?php echo $name_safe; ?></title>
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
    <div class="admin-page-title" style="margin-bottom:6px;">Saving Template</div>
    <div class="admin-page-sub" style="margin-bottom:24px;">
        <strong><?php echo $name_safe; ?></strong>
        &nbsp;·&nbsp; <span class="tbl-badge tbl-badge--scraped">SCRAPED</span>
        &nbsp;·&nbsp; Auto-generating thumbnail
    </div>

    <div class="result-box result-box--success">
        <div class="result-box__title" style="margin-bottom:14px;">Progress</div>
        <ul class="result-steps" id="steps">
<?php

step('✅', "Template <strong>$name_safe</strong> saved to catalog as <code>$id_safe</code>");
step('🗂️', "Files moved to <code>templates/$id_safe/</code>");

// ── Screenshot: real browser shot of the original source URL ──────────────────

$workspace_root    = dirname(dirname(__DIR__));
$screenshot_script = $workspace_root . '/scripts/screenshot-url.mjs';
$thumbs_dir        = __DIR__ . '/assets/img/thumbs';

$node = trim((string) shell_exec('which node 2>/dev/null'));
if (!$node || !file_exists($node)) $node = '/home/runner/.nix-profile/bin/node';

$chromium_env = getenv('REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE') ?: '';
$env_prefix   = 'HOME='  . escapeshellarg(getenv('HOME')  ?: '/home/runner')
              . ' PATH=' . escapeshellarg(getenv('PATH')  ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin')
              . ($chromium_env ? ' REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=' . escapeshellarg($chromium_env) : '');

$screenshot_ok = false;
$snap_url      = $actualSrc ?: $source_url;   // original website URL

if (!$snap_url) {
    step('⚠️', 'No source URL available — skipping screenshot, falling back to generated thumbnail');
} elseif (!file_exists($screenshot_script)) {
    step('⚠️', 'Screenshot script not found — falling back to generated thumbnail');
} elseif (!$node || !file_exists($node)) {
    step('⚠️', 'Node.js not found — falling back to generated thumbnail');
} else {
    $tmp_jpg = $thumbs_dir . '/' . $template_id . '_tmp_' . time() . '.jpg';
    $out_jpg = $thumbs_dir . '/' . $template_id . '.jpg';

    $cmd = "$env_prefix " . escapeshellarg($node)
         . " " . escapeshellarg($screenshot_script)
         . " --url=" . escapeshellarg($snap_url)
         . " --out=" . escapeshellarg($tmp_jpg)
         . " 2>&1";

    $snap_url_safe = htmlspecialchars($snap_url);
    step('🌐', "Navigating to <code>$snap_url_safe</code> in headless browser…"
        . ' <span id="ss-tick" style="color:rgba(255,255,255,0.4);font-family:monospace;margin-left:6px;"></span>');

    $desc   = [['pipe','r'],['pipe','w'],['pipe','w']];
    $proc   = proc_open($cmd, $desc, $pipes);
    $output = ''; $tick = 0; $last = time();

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
        $exit_code = 1; $output = 'proc_open() failed';
    }

    $screenshot_ok = ($exit_code === 0 && file_exists($tmp_jpg) && filesize($tmp_jpg) > 5000);

    if ($screenshot_ok) {
        rename($tmp_jpg, $out_jpg);
        step('📸', 'Live screenshot captured at 1280×800 — header &amp; hero of the original site');
        step('✅', "Thumbnail saved → <code>assets/img/thumbs/$id_safe.jpg</code>");

        $v = time();
        echo "<li class='result-step' style='display:block;padding:16px 0 4px;'>"
           . "<img src='" . BASE_PATH . "/assets/img/thumbs/" . urlencode($template_id) . ".jpg?v=$v' "
           . "style='width:100%;max-width:560px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);display:block;' "
           . "alt='Screenshot thumbnail'>"
           . "</li>\n";
        @ob_flush(); flush();
    } else {
        if (file_exists($tmp_jpg)) @unlink($tmp_jpg);
        step_log('⚠️', 'Screenshot failed — falling back to generated thumbnail', trim($output));
    }
}

// ── GD fallback ───────────────────────────────────────────────────────────────

if (!$screenshot_ok) {
    $gd_ok = sc_generate_gd_thumb($new_entry, $thumbs_dir);
    if ($gd_ok) {
        step('🎨', 'Generated placeholder thumbnail via GD (you can replace it later)');
        $v = time();
        echo "<li class='result-step' style='display:block;padding:16px 0 4px;'>"
           . "<img src='" . BASE_PATH . "/assets/img/thumbs/" . urlencode($template_id) . ".jpg?v=$v' "
           . "style='width:100%;max-width:560px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);display:block;' "
           . "alt='Generated thumbnail'>"
           . "</li>\n";
        @ob_flush(); flush();
    } else {
        step('⚠️', 'Could not generate thumbnail — GD library may be unavailable. You can upload one manually from the admin panel.');
    }
}

?>
        </ul>
    </div>

    <div class="result-actions" style="margin-top:24px;">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--primary">← Back to Admin</a>
        <a href="<?php echo BASE_PATH; ?>/preview.php?id=<?php echo urlencode($template_id); ?>"
           class="btn-admin btn-admin--orange" target="_blank">Preview Template ↗</a>
        <form method="POST" action="<?php echo BASE_PATH; ?>/admin-thumb.php"
              style="display:inline;" onsubmit="return confirm('Re-run the screenshot for this template?');">
            <input type="hidden" name="template_id" value="<?php echo htmlspecialchars($template_id); ?>">
            <button type="submit" class="btn-admin btn-admin--ghost">📸 Re-take Screenshot</button>
        </form>
    </div>
</div>
</body>
</html>
