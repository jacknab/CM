<?php
session_start();
require_once __DIR__ . '/config.php';


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Helpers (shared with admin-install.php) ───────────────────────────────────

function step(string $icon, string $msg): void {
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span><span>$msg</span></li>\n";
    ob_flush(); flush();
}

function step_log(string $icon, string $msg, string $log): void {
    $safe = htmlspecialchars(trim($log));
    echo "<li class='result-step'><span class='result-step__icon'>$icon</span>"
       . "<span>$msg<div class='log-block'>$safe</div></span></li>\n";
    ob_flush(); flush();
}

function abort(string $msg): void {
    echo "</ul></div>"
       . "<div class='result-box result-box--error'><div class='result-box__title'>Rebuild failed</div>"
       . "<p style='color:rgba(255,255,255,0.6);font-size:0.875rem;'>$msg</p></div>"
       . "<div class='result-actions'>"
       . "<a href='" . BASE_PATH . "/admin-catalog.php' class='btn-admin btn-admin--ghost'>← Back to Admin</a>"
       . "</div></div></body></html>";
    exit;
}

function run_cmd(string $cmd, string $cwd = ''): array {
    $full = $cwd ? "cd " . escapeshellarg($cwd) . " && $cmd 2>&1" : "$cmd 2>&1";
    exec($full, $out, $code);
    return ['output' => implode("\n", $out), 'code' => $code];
}

function read_main_component(string $dir): string {
    $candidates = [
        'src/App.tsx','src/App.jsx','src/App.js','src/app.tsx',
        'src/app.jsx','src/main.tsx','src/main.jsx',
        'src/pages/index.tsx','src/pages/Home.tsx','src/pages/home.tsx',
    ];
    foreach ($candidates as $f) {
        $path = $dir . '/' . $f;
        if (file_exists($path)) return file_get_contents($path);
    }
    return '';
}

function tw_color_to_hex(string $color, string $shade): string {
    $palette = [
        'rose'    => ['300'=>'#fda4af','400'=>'#fb7185','500'=>'#f43f5e','600'=>'#e11d48','700'=>'#be123c'],
        'pink'    => ['300'=>'#f9a8d4','400'=>'#f472b6','500'=>'#ec4899','600'=>'#db2777','700'=>'#be185d'],
        'fuchsia' => ['400'=>'#e879f9','500'=>'#d946ef','600'=>'#c026d3','700'=>'#a21caf'],
        'purple'  => ['300'=>'#d8b4fe','400'=>'#c084fc','500'=>'#a855f7','600'=>'#9333ea','700'=>'#7e22ce'],
        'violet'  => ['400'=>'#a78bfa','500'=>'#8b5cf6','600'=>'#7c3aed','700'=>'#6d28d9'],
        'indigo'  => ['400'=>'#818cf8','500'=>'#6366f1','600'=>'#4f46e5','700'=>'#4338ca'],
        'blue'    => ['400'=>'#60a5fa','500'=>'#3b82f6','600'=>'#2563eb','700'=>'#1d4ed8'],
        'cyan'    => ['400'=>'#22d3ee','500'=>'#06b6d4','600'=>'#0891b2'],
        'teal'    => ['400'=>'#2dd4bf','500'=>'#14b8a6','600'=>'#0d9488'],
        'green'   => ['400'=>'#4ade80','500'=>'#22c55e','600'=>'#16a34a'],
        'emerald' => ['400'=>'#34d399','500'=>'#10b981','600'=>'#059669'],
        'amber'   => ['400'=>'#fbbf24','500'=>'#f59e0b','600'=>'#d97706'],
        'orange'  => ['400'=>'#fb923c','500'=>'#f97316','600'=>'#ea580c'],
        'red'     => ['400'=>'#f87171','500'=>'#ef4444','600'=>'#dc2626'],
    ];
    return $palette[$color][$shade] ?? '';
}

function detect_accent_color(string $dir, string $app_src, string $category): string {
    $css_files = ['src/index.css','src/styles.css','src/globals.css','src/App.css'];
    foreach ($css_files as $f) {
        $path = $dir . '/' . $f;
        if (!file_exists($path)) continue;
        $css = file_get_contents($path);
        if (preg_match('/--(?:primary|accent|brand|color-primary|highlight)[^:]*:\s*(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})\b/i', $css, $m)) {
            return strtolower($m[1]);
        }
    }
    if ($app_src) {
        $accent_colors = ['rose','pink','fuchsia','purple','violet','indigo','blue','cyan','teal','green','emerald','amber','orange','red'];
        $counts = [];
        foreach ($accent_colors as $color) {
            $cnt = preg_match_all('/(?:text|bg|border|from|to|ring)-' . $color . '-([3-7]00)/', $app_src, $matches);
            if ($cnt > 0) {
                $hex = tw_color_to_hex($color, '500');
                if ($hex) $counts[$hex] = ($counts[$hex] ?? 0) + $cnt;
            }
        }
        if ($counts) { arsort($counts); return array_key_first($counts); }
        if (preg_match_all('/#([a-fA-F0-9]{6})\b/', $app_src, $m)) {
            $hex_counts = array_count_values($m[0]);
            arsort($hex_counts);
            foreach ($hex_counts as $hex => $_) {
                $r = hexdec(substr($hex,1,2)); $g = hexdec(substr($hex,3,2)); $b = hexdec(substr($hex,5,2));
                $lum = 0.299*$r + 0.587*$g + 0.114*$b;
                if ($lum > 40 && $lum < 210) return strtolower($hex);
            }
        }
    }
    $fallbacks = ['Hair Salon'=>'#7c3aed','Barbershop'=>'#1d4ed8','Nail Salon'=>'#f43f5e'];
    return $fallbacks[$category] ?? '#7c3aed';
}

function detect_dark_color(string $dir, string $app_src): string {
    $css_files = ['src/index.css','src/styles.css','src/globals.css','src/App.css'];
    foreach ($css_files as $f) {
        $path = $dir . '/' . $f;
        if (!file_exists($path)) continue;
        $css = file_get_contents($path);
        if (preg_match('/--(?:background|bg|dark|surface)[^:]*:\s*(#[a-fA-F0-9]{6})\b/i', $css, $m)) {
            $hex = strtolower($m[1]);
            [$r,$g,$b] = [hexdec(substr($hex,1,2)),hexdec(substr($hex,3,2)),hexdec(substr($hex,5,2))];
            if (($r+$g+$b) < 150) return $hex;
        }
    }
    if ($app_src && preg_match_all('/#([0-9a-fA-F]{6})\b/', $app_src, $m)) {
        foreach (array_unique($m[0]) as $hex) {
            [$r,$g,$b] = [hexdec(substr($hex,1,2)),hexdec(substr($hex,3,2)),hexdec(substr($hex,5,2))];
            if (($r+$g+$b) < 80) return strtolower($hex);
        }
    }
    return '#0a0b15';
}

function adjust_hex(string $hex, int $amount): string {
    $r = min(255, max(0, hexdec(substr($hex,1,2)) + $amount));
    $g = min(255, max(0, hexdec(substr($hex,3,2)) + $amount));
    $b = min(255, max(0, hexdec(substr($hex,5,2)) + $amount));
    return sprintf('#%02x%02x%02x', $r, $g, $b);
}

function detect_updated_metadata(string $dir, array $existing): array {
    $app_src  = read_main_component($dir);
    $category = $existing['category'];

    // Re-detect name from package.json (keep existing if detection fails)
    $name = $existing['name'];
    $pkg_file = $dir . '/package.json';
    if (file_exists($pkg_file)) {
        $pkg = json_decode(file_get_contents($pkg_file), true) ?: [];
        $raw = $pkg['name'] ?? '';
        $clean = preg_replace('/^@[^\/]+\//', '', $raw);
        $clean = preg_replace('/^template-/', '', $clean);
        $detected = ucwords(str_replace(['-','_'], ' ', $clean));
        if (strlen($detected) > 2) $name = $detected;
    }

    // Re-detect business name
    $business_name = $existing['business_name'] ?? $name;
    if ($app_src && preg_match('/<strong[^>]*>\s*([A-Z][^<]{3,55})\s*<\/strong>/u', $app_src, $m)) {
        $candidate = trim(strip_tags($m[1]));
        if (strlen($candidate) > 3 && strlen($candidate) < 60) $business_name = $candidate;
    }

    // Re-detect hero tagline
    $hero_tagline = $existing['hero_tagline'] ?? ($business_name . '.');
    if ($app_src) {
        if (preg_match('/id=["\']hero["\'][^>]*>.*?<h1[^>]*>(.*?)<\/h1>/is', $app_src, $m)) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 4 && strlen($t) < 130) $hero_tagline = $t;
        } elseif (preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $app_src, $m)) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 4 && strlen($t) < 130) $hero_tagline = $t;
        }
    }

    // Re-detect hero sub
    $hero_sub = $existing['hero_sub'] ?? '';
    if ($app_src && preg_match('/id=["\']hero["\'][^>]*>.*?<p[^>]*>(.*?)<\/p>/is', $app_src, $m)) {
        $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
        $t = preg_replace('/\s+/', ' ', $t);
        if (strlen($t) > 10) $hero_sub = substr($t, 0, 120);
    }

    $accent = detect_accent_color($dir, $app_src, $category);
    $dark   = detect_dark_color($dir, $app_src);
    $light  = adjust_hex($dark, 18);

    return [
        'name'          => $name,
        'business_name' => $business_name,
        'hero_tagline'  => $hero_tagline,
        'hero_sub'      => $hero_sub,
        'accent'        => $accent,
        'dark'          => $dark,
        'light'         => $light,
    ];
}

// ── Thumbnail generator ───────────────────────────────────────────────────────

function hex2rgb_local(string $hex): array {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
}
function alloc_c($img, string $hex, int $alpha = 0): int {
    [$r,$g,$b] = hex2rgb_local($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}
function rrect($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void {
    if ($r < 1) $r = 1;
    imagefilledrectangle($img, $x1+$r, $y1, $x2-$r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1+$r, $x2, $y2-$r, $color);
    imagefilledellipse($img, $x1+$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x1+$r, $y2-$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y2-$r, $r*2, $r*2, $color);
}

function generate_thumbnail(string $id, string $name, string $accent, string $dark, string $light, string $tagline, string $out_dir): bool {
    if (!function_exists('imagecreatetruecolor')) return false;
    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!file_exists($fb)) return false;
    $W = 900; $H = 620;
    $img = imagecreatetruecolor($W, $H);
    [$dr,$dg,$db] = hex2rgb_local($dark);
    [$lr,$lg,$lb] = hex2rgb_local($light);
    [$ar,$ag,$ab] = hex2rgb_local($accent);
    for ($y = 0; $y < $H; $y++) {
        $t = $y/$H;
        $c = imagecolorallocate($img,(int)($dr+($lr-$dr)*$t*0.7),(int)($dg+($lg-$dg)*$t*0.7),(int)($db+($lb-$db)*$t*0.7));
        imagefilledrectangle($img, 0, $y, $W, $y, $c);
    }
    $white = imagecolorallocate($img, 255, 255, 255);
    $acc_c = imagecolorallocate($img, $ar, $ag, $ab);
    for ($rad = 280; $rad >= 20; $rad -= 22) {
        $alpha = (int)(120 - ($rad/280)*118);
        imagefilledellipse($img, (int)($W*0.5), 200, $rad*2, (int)($rad*1.2), imagecolorallocatealpha($img,$ar,$ag,$ab,$alpha));
    }
    imagefilledrectangle($img, 0, 0, $W, 52, imagecolorallocatealpha($img,$dr,$dg,$db,30));
    imagefilledrectangle($img, 0, 52, $W, 53, imagecolorallocatealpha($img,255,255,255,115));
    rrect($img, 26, 14, 186, 40, 6, alloc_c($img,$accent,90));
    imagettftext($img, 10, 0, 35, 32, $white, $fb, $name);
    foreach ([240,295,348,398] as $lx) rrect($img,$lx,22,$lx+38,30,2,imagecolorallocatealpha($img,255,255,255,100));
    rrect($img,$W-110,14,$W-26,40,13,$acc_c);
    imagettftext($img,8,0,$W-100,31,$white,$fb,'Book Now');
    $ey=100;
    imagettftext($img,9,0,(int)(($W/2)-44),$ey+42,imagecolorallocatealpha($img,min(255,$ar+80),$ag,$ab,50),$fb,'WELCOME TO');
    $words=explode(' ',$tagline?:$name);$lines=[];$line='';
    foreach($words as $w){
        $test=$line?"$line $w":$w;
        $box=imagettfbbox(34,0,$fb,$test);
        if(abs($box[2]-$box[0])>540&&$line){$lines[]=$line;$line=$w;}else $line=$test;
    }
    if($line)$lines[]=$line;
    $ty=$ey+84;
    foreach(array_slice($lines,0,2) as $l){
        $box=imagettfbbox(34,0,$fb,$l);
        imagettftext($img,34,0,(int)(($W-abs($box[2]-$box[0]))/2),$ty,$white,$fb,$l);
        $ty+=46;
    }
    $ty+=28; $bx=(int)(($W-310)/2);
    rrect($img,$bx,$ty,$bx+160,$ty+38,19,$acc_c);
    imagettftext($img,10,0,$bx+16,$ty+24,$white,$fb,'Explore Services');
    rrect($img,$bx+176,$ty,$bx+310,$ty+38,19,imagecolorallocatealpha($img,255,255,255,90));
    imagettftext($img,10,0,$bx+192,$ty+24,$white,$fb,'Learn More');
    $sy=405; $wbg=imagecolorallocate($img,250,250,252);
    imagefilledrectangle($img,0,$sy,$W,$H,$wbg);
    $dk=imagecolorallocate($img,20,20,35);$md=imagecolorallocate($img,110,120,140);$ln=imagecolorallocate($img,220,224,234);
    imagettftext($img,9,0,(int)($W/2)-30,$sy+24,$acc_c,$fb,'OUR SERVICES');
    imagettftext($img,18,0,(int)($W/2)-55,$sy+50,$dk,$fb,'What We Offer');
    imagettftext($img,10,0,(int)($W/2)-90,$sy+68,$md,$fr,'Professional services tailored just for you');
    $cw=236;$gap=28;$cx0=(int)(($W-(3*$cw+2*$gap))/2);$cy=$sy+80;
    $labels=['Premium Service','Expert Care','Top Results'];
    for($ci=0;$ci<3;$ci++){
        $cx=$cx0+$ci*($cw+$gap);
        rrect($img,$cx+3,$cy+4,$cx+$cw+3,$cy+90,8,imagecolorallocatealpha($img,0,0,0,118));
        rrect($img,$cx,$cy,$cx+$cw,$cy+90,8,imagecolorallocate($img,255,255,255));
        rrect($img,$cx+14,$cy+12,$cx+44,$cy+42,6,alloc_c($img,$accent,100));
        imagettftext($img,11,0,$cx+14,$cy+60,$dk,$fb,$labels[$ci]);
        rrect($img,$cx+14,$cy+66,$cx+$cw-20,$cy+70,2,$ln);
        rrect($img,$cx+14,$cy+76,$cx+$cw-50,$cy+80,2,$ln);
    }
    $ok=imagejpeg($img,$out_dir.'/'.$id.'.jpg',88);
    imagedestroy($img);
    return (bool)$ok;
}

// ── Validate inputs ───────────────────────────────────────────────────────────

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));
$errors = [];

if (!$template_id) $errors[] = 'No template ID provided.';

require_once __DIR__ . '/data/templates.php';
if ($template_id && !isset($all_templates[$template_id])) {
    $errors[] = "Template ID <code>$template_id</code> not found in the catalog.";
}
if (empty($_FILES['zipfile']['tmp_name'])) $errors[] = 'No ZIP file received.';

$upload_code = $_FILES['zipfile']['error'] ?? UPLOAD_ERR_OK;
$upload_err_map = [
    UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload_max_filesize limit.',
    UPLOAD_ERR_FORM_SIZE  => 'File exceeds MAX_FILE_SIZE.',
    UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded.',
    UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
    UPLOAD_ERR_NO_TMP_DIR => 'Missing server temp folder.',
    UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
    UPLOAD_ERR_EXTENSION  => 'Upload stopped by server extension.',
];
if ($upload_code !== UPLOAD_ERR_OK && $upload_code !== 0) {
    $errors[] = $upload_err_map[$upload_code] ?? "Upload error (code $upload_code).";
}

$existing = $errors ? [] : $all_templates[$template_id];

// ── Paths & environment ───────────────────────────────────────────────────────

$workspace_root = dirname(__DIR__);
$artifacts_dir  = $workspace_root . '/artifacts';
$dest_dir       = $artifacts_dir . '/template-' . $template_id;
$built_dir      = __DIR__ . '/templates/' . $template_id;
$thumbs_dir     = __DIR__ . '/assets/img/thumbs';
$base_path_url  = '/launchsite/templates/' . $template_id . '/';
$vite_out_rel   = '../../launchsite/templates/' . $template_id;

$pnpm = trim(shell_exec('which pnpm 2>/dev/null') ?: '');
if (!$pnpm || !file_exists($pnpm)) $pnpm = '/home/runner/.nix-profile/bin/pnpm';
if (!file_exists($pnpm)) $pnpm = 'pnpm';

$env_prefix = 'HOME=' . escapeshellarg(getenv('HOME') ?: '/home/runner')
            . ' PATH=' . escapeshellarg(getenv('PATH') ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin');

// ── Start output ──────────────────────────────────────────────────────────────

ob_implicit_flush(true);
ob_end_flush();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Replacing Template — Launchit Admin</title>
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
    <div class="admin-page-title" style="margin-bottom:6px;">Replacing Template</div>
    <div class="admin-page-sub" style="margin-bottom:24px;">
        <code><?php echo htmlspecialchars($template_id ?: '(unknown)'); ?></code>
        <?php if (!empty($existing['name'])): ?> — <?php echo htmlspecialchars($existing['name']); ?><?php endif; ?>
    </div>

<?php if ($errors): ?>
    <div class="result-box result-box--error">
        <div class="result-box__title">Could not start rebuild</div>
        <ul style="margin-top:8px;padding-left:20px;color:rgba(255,255,255,0.6);font-size:0.875rem;line-height:1.9;">
            <?php foreach ($errors as $e): ?>
            <li><?php echo $e; ?></li>
            <?php endforeach; ?>
        </ul>
    </div>
    <div class="result-actions">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--ghost">← Back to Admin</a>
    </div>
</div></body></html>
<?php exit; endif; ?>

    <div class="result-box result-box--success">
        <div class="result-box__title" style="margin-bottom:14px;">Rebuild progress</div>
        <ul class="result-steps" id="steps">
<?php

// ── 1. Extract ZIP ────────────────────────────────────────────────────────────
step('📦', 'Extracting ZIP archive…');

$zip_tmp = $_FILES['zipfile']['tmp_name'];
$zip     = new ZipArchive();
if ($zip->open($zip_tmp) !== true) abort('Could not open the ZIP file.');

$prefix = '';
$first  = $zip->getNameIndex(0);
if ($first && substr($first, -1) === '/') {
    $all_under = true;
    for ($i = 1; $i < $zip->numFiles; $i++) {
        if (strpos($zip->getNameIndex($i), $first) !== 0) { $all_under = false; break; }
    }
    if ($all_under) $prefix = $first;
}

$tmp_extract = sys_get_temp_dir() . '/launchit_replace_' . time() . '_' . rand(100,999);
if (!mkdir($tmp_extract, 0755, true)) abort('Server could not create a temp directory.');
$zip->extractTo($tmp_extract);
$zip->close();

$src = $prefix ? $tmp_extract . '/' . trim($prefix, '/') : $tmp_extract;

if (!file_exists($src . '/package.json')) {
    abort('No <code>package.json</code> found. Please zip the <em>root</em> of your React/Vite project.');
}
step('✅', 'ZIP extracted — found <code>package.json</code>');

// ── 2. Re-detect metadata from new source ─────────────────────────────────────
step('🔍', 'Reading updated template info from new source files…');

$meta = detect_updated_metadata($src, $existing);

step('✅',
    'Detected: <strong>' . htmlspecialchars($meta['name']) . '</strong>'
    . ' &nbsp;·&nbsp; accent <span style="display:inline-block;width:11px;height:11px;border-radius:3px;'
    . 'background:' . htmlspecialchars($meta['accent']) . ';vertical-align:middle;margin:0 3px;"></span>'
    . '<code>' . htmlspecialchars($meta['accent']) . '</code>'
    . ' &nbsp;·&nbsp; business: <em>' . htmlspecialchars($meta['business_name']) . '</em>'
);

// ── 3. Replace source in artifacts ───────────────────────────────────────────
step('📁', "Replacing source in <code>artifacts/template-$template_id/</code>…");

if (is_dir($dest_dir)) {
    $r = run_cmd("rm -rf " . escapeshellarg($dest_dir));
    if ($r['code'] !== 0) abort('Could not remove existing source directory.');
}

if (!rename($src, $dest_dir)) {
    $r = run_cmd("cp -r " . escapeshellarg($src) . " " . escapeshellarg($dest_dir));
    run_cmd("rm -rf " . escapeshellarg($tmp_extract));
    if ($r['code'] !== 0) abort('Could not move files to the artifacts directory.');
}
step('✅', "New source at <code>artifacts/template-$template_id/</code>");

// ── 4. Configure Vite + update package.json ────────────────────────────────
step('⚙️', 'Writing <code>vite.config.ts</code>…');

file_put_contents($dest_dir . '/vite.config.ts', <<<VITE
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '$base_path_url',
  build: {
    outDir: '$vite_out_rel',
    emptyOutDir: true,
  },
})
VITE);

foreach (['vite.config.js','vite.config.mjs'] as $old) {
    if (file_exists($dest_dir . '/' . $old)) unlink($dest_dir . '/' . $old);
}

$pkg = json_decode(file_get_contents($dest_dir . '/package.json'), true) ?: [];
$pkg['name'] = '@workspace/template-' . $template_id;
if (empty($pkg['scripts']['build'])) $pkg['scripts']['build'] = 'vite build';
file_put_contents($dest_dir . '/package.json', json_encode($pkg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

step('✅', "Configured: base <code>$base_path_url</code>");

// ── 5. pnpm install ───────────────────────────────────────────────────────────
step('📥', 'Installing dependencies (<code>pnpm install</code>) — may take 30–60 s…');

$r = run_cmd("$env_prefix " . escapeshellarg($pnpm) . " install --no-frozen-lockfile", $workspace_root);

if ($r['code'] !== 0) {
    step_log('⚠️', 'Workspace install had issues — trying local install as fallback…', $r['output']);
    $r2 = run_cmd("$env_prefix " . escapeshellarg($pnpm) . " install --ignore-workspace", $dest_dir);
    if ($r2['code'] !== 0) {
        step_log('❌', 'Dependency installation failed', $r2['output']);
        abort('Could not install dependencies. Check that your <code>package.json</code> is valid.');
    }
    step('✅', 'Dependencies installed (local fallback)');
} else {
    step('✅', 'Dependencies installed');
}

// ── 6. Vite build ─────────────────────────────────────────────────────────────
step('🔨', 'Rebuilding the React app (<code>vite build</code>)…');

$r = run_cmd("$env_prefix " . escapeshellarg($pnpm) . " exec vite build", $dest_dir);

if ($r['code'] !== 0 || !file_exists($built_dir . '/index.html')) {
    step_log('❌', 'Build failed', $r['output']);
    abort('Vite build failed — see log above.');
}
step('✅', "Build complete → <code>launchsite-php/templates/$template_id/</code>");

// ── 7. Update database catalog entry ──────────────────────────────────────────
step('📝', 'Updating catalog entry with fresh metadata…');

launchit_update_template($template_id, [
    'name'          => $meta['name'],
    'accent'        => $meta['accent'],
    'dark'          => $meta['dark'],
    'light'         => $meta['light'],
    'url_slug'      => $template_id,
    'hero_tagline'  => $meta['hero_tagline'],
    'hero_sub'      => $meta['hero_sub'],
    'business_name' => $meta['business_name'],
    'type'          => 'react',
    'react_path'    => $base_path_url,
]);

step('✅', "Catalog entry updated — changes are live immediately");

// ── 8. Thumbnail — browser screenshot first, GD fallback ─────────────────────
step('🖼️', 'Capturing fresh thumbnail (browser screenshot of header + hero)…');

$thumb_ok     = false;
$thumb_method = '';
$thumb_path   = $thumbs_dir . '/' . $template_id . '.jpg';

$node = trim(shell_exec('which node 2>/dev/null') ?: '');
if (!$node || !file_exists($node)) $node = '/home/runner/.nix-profile/bin/node';
$screenshot_script = realpath(dirname($workspace_root) . '/scripts/screenshot-template.mjs');

if ($node && file_exists($node) && $screenshot_script && file_exists($screenshot_script)) {
    $scr_cmd = "timeout 60 env"
        . " HOME=" . escapeshellarg(getenv('HOME') ?: '/home/runner')
        . " PATH=" . escapeshellarg(getenv('PATH') ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin')
        . " " . escapeshellarg($node) . " " . escapeshellarg($screenshot_script)
        . " --id=" . escapeshellarg($template_id)
        . " --out=" . escapeshellarg($thumb_path)
        . " 2>&1";
    $scr_out  = [];
    $scr_code = 0;
    exec($scr_cmd, $scr_out, $scr_code);
    $scr_log = implode("\n", $scr_out);

    if ($scr_code === 0 && file_exists($thumb_path) && filesize($thumb_path) > 5000) {
        $thumb_ok     = true;
        $thumb_method = 'browser screenshot';
    } else {
        step_log('⚠️', 'Browser screenshot failed — falling back to generated thumbnail…', $scr_log);
    }
}

if (!$thumb_ok) {
    $thumb_ok = generate_thumbnail(
        $template_id, $meta['name'], $meta['accent'], $meta['dark'], $meta['light'],
        $meta['hero_tagline'], $thumbs_dir
    );
    if ($thumb_ok) $thumb_method = 'generated (GD)';
}

if ($thumb_ok) {
    step('✅', 'Thumbnail ready (' . $thumb_method . ')');
} else {
    step('⚠️', "Thumbnail skipped — update manually at <code>assets/img/thumbs/$template_id.jpg</code>");
}

$preview_url = BASE_PATH . '/preview.php?id=' . urlencode($template_id);
?>
        </ul>
    </div>

    <div class="result-box result-box--success" style="margin-top:20px;">
        <div class="result-box__title">🔄 Template replaced successfully!</div>
        <p style="color:rgba(255,255,255,0.65);font-size:0.875rem;margin-top:6px;line-height:1.7;">
            <strong style="color:white;"><?php echo htmlspecialchars($meta['name']); ?></strong>
            has been rebuilt and is live in the catalog.
        </p>
        <p style="color:rgba(255,255,255,0.35);font-size:0.78rem;margin-top:8px;">
            Accent: <code><?php echo htmlspecialchars($meta['accent']); ?></code> &nbsp;·&nbsp;
            Business: <em><?php echo htmlspecialchars($meta['business_name']); ?></em> &nbsp;·&nbsp;
            Category kept: <strong><?php echo htmlspecialchars($existing['category']); ?></strong>
        </p>
    </div>

    <div class="result-actions">
        <a href="<?php echo $preview_url; ?>" target="_blank" class="btn-admin btn-admin--orange">Preview Updated Template ↗</a>
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--ghost">← Back to Admin</a>
    </div>
</div>
</body>
</html>
