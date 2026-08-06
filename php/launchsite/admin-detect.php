<?php
/**
 * admin-detect.php
 * Re-scans the source code of an existing React template and updates its
 * catalog metadata (name, colors, hero text, business name) + thumbnail.
 * Does NOT rebuild — use admin-replace.php for that.
 */
session_start();
require_once __DIR__ . '/config.php';


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

require_once __DIR__ . '/data/templates.php';

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));

if (!$template_id || !isset($all_templates[$template_id])) {
    $_SESSION['flash'] = ['type' => 'error', 'msg' => 'Template not found: ' . $template_id];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

$existing       = $all_templates[$template_id];
$workspace_root = dirname(__DIR__);
$source_dir     = $workspace_root . '/artifacts/template-' . $template_id;
$thumbs_dir     = __DIR__ . '/assets/img/thumbs';

if (!is_dir($source_dir) || !file_exists($source_dir . '/package.json')) {
    $_SESSION['flash'] = [
        'type' => 'error',
        'msg'  => 'Source not found at artifacts/template-' . $template_id . '/. Use Replace to upload a new ZIP.',
    ];
    header('Location: ' . BASE_PATH . '/admin-catalog.php');
    exit;
}

// ── Detection helpers ─────────────────────────────────────────────────────────

function rd_read_main_component(string $dir): string {
    $candidates = [
        'src/App.tsx','src/App.jsx','src/App.js','src/app.tsx','src/app.jsx',
        'src/main.tsx','src/main.jsx',
        'src/pages/index.tsx','src/pages/Home.tsx','src/pages/home.tsx',
    ];
    foreach ($candidates as $f) {
        $path = $dir . '/' . $f;
        if (file_exists($path)) return file_get_contents($path);
    }
    // Fallback: search all tsx/jsx files in src/
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir . '/src'));
    foreach ($iter as $file) {
        if (in_array($file->getExtension(), ['tsx','jsx'])) {
            $content = file_get_contents($file->getPathname());
            if (strlen($content) > 500) return $content;
        }
    }
    return '';
}

function rd_tw_color_to_hex(string $color, string $shade): string {
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

function rd_detect_accent(string $dir, string $src, string $category): string {
    $css_files = ['src/index.css','src/styles.css','src/globals.css','src/App.css'];
    foreach ($css_files as $f) {
        $path = $dir . '/' . $f;
        if (!file_exists($path)) continue;
        $css = file_get_contents($path);
        if (preg_match('/--(?:primary|accent|brand|color-primary|highlight)[^:]*:\s*(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})\b/i', $css, $m))
            return strtolower($m[1]);
    }
    if ($src) {
        $accent_colors = ['rose','pink','fuchsia','purple','violet','indigo','blue','cyan','teal','green','emerald','amber','orange','red'];
        $counts = [];
        foreach ($accent_colors as $color) {
            $cnt = preg_match_all('/(?:text|bg|border|from|to|ring)-' . $color . '-([3-7]00)/', $src, $matches);
            if ($cnt > 0) {
                $hex = rd_tw_color_to_hex($color, '500');
                if ($hex) $counts[$hex] = ($counts[$hex] ?? 0) + $cnt;
            }
        }
        if ($counts) { arsort($counts); return array_key_first($counts); }
        if (preg_match_all('/#([a-fA-F0-9]{6})\b/', $src, $m)) {
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

function rd_detect_dark(string $dir, string $src): string {
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
    if ($src && preg_match_all('/#([0-9a-fA-F]{6})\b/', $src, $m)) {
        foreach (array_unique($m[0]) as $hex) {
            [$r,$g,$b] = [hexdec(substr($hex,1,2)),hexdec(substr($hex,3,2)),hexdec(substr($hex,5,2))];
            if (($r+$g+$b) < 80) return strtolower($hex);
        }
    }
    return '#0a0b15';
}

function rd_adjust_hex(string $hex, int $amount): string {
    $r = min(255, max(0, hexdec(substr($hex,1,2)) + $amount));
    $g = min(255, max(0, hexdec(substr($hex,3,2)) + $amount));
    $b = min(255, max(0, hexdec(substr($hex,5,2)) + $amount));
    return sprintf('#%02x%02x%02x', $r, $g, $b);
}

// ── Run detection on source ───────────────────────────────────────────────────

$src      = rd_read_main_component($source_dir);
$category = $existing['category'];

// Name — from package.json, fall back to existing
$name = $existing['name'];
$pkg_file = $source_dir . '/package.json';
if (file_exists($pkg_file)) {
    $pkg = json_decode(file_get_contents($pkg_file), true) ?: [];
    $raw = $pkg['name'] ?? '';
    $clean = preg_replace('/^@[^\/]+\//', '', $raw);
    $clean = preg_replace('/^template-/', '', $clean);
    $detected = ucwords(str_replace(['-','_'], ' ', $clean));
    if (strlen($detected) > 2) $name = $detected;
}
// Check index.html <title> — overrides generic package.json names
$index_html_path = $source_dir . '/index.html';
if (file_exists($index_html_path)) {
    $html_content = file_get_contents($index_html_path);
    if (preg_match('/<title>([^<]{3,80})<\/title>/i', $html_content, $m)) {
        $title_raw = trim($m[1]);
        if (!preg_match('/vite|react|typescript|starter|template|webpack|create.?app/i', $title_raw)) {
            $name = $title_raw;
        }
    }
}

// Also scan all TSX/JSX/CSS files for better coverage
$all_src = $src;
$scan_dirs = ['src'];
foreach ($scan_dirs as $sd) {
    $sd_path = $source_dir . '/' . $sd;
    if (!is_dir($sd_path)) continue;
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($sd_path));
    foreach ($iter as $file) {
        if (in_array($file->getExtension(), ['tsx','jsx','ts','js','css'])) {
            $all_src .= "\n" . file_get_contents($file->getPathname());
        }
    }
}

// Business name — strong tags, logo text
$business_name = $existing['business_name'] ?? $name;
if ($all_src && preg_match('/<strong[^>]*>\s*([A-Z][^<]{3,55})\s*<\/strong>/u', $all_src, $m)) {
    $candidate = trim(strip_tags($m[1]));
    if (strlen($candidate) > 3 && strlen($candidate) < 60) $business_name = $candidate;
}
// Also check for logo/brand text near className="logo" or similar
if ($all_src && preg_match('/class(?:Name)?=["\'][^"\']*(?:logo|brand)[^"\']*["\'][^>]*>\s*([A-Z][A-Za-z\s&]{3,40})/u', $all_src, $m)) {
    $candidate = trim(strip_tags($m[1]));
    if (strlen($candidate) > 3 && strlen($candidate) < 60) $business_name = $candidate;
}

// Hero tagline — h1 near hero section
$hero_tagline = $existing['hero_tagline'] ?? ($business_name . '.');
if ($all_src) {
    // Try hero section first
    if (preg_match('/id=["\']hero["\'][^>]*>.*?<h1[^>]*>(.*?)<\/h1>/is', $all_src, $m)) {
        $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
        $t = preg_replace('/\s+/', ' ', $t);
        if (strlen($t) > 4 && strlen($t) < 130) $hero_tagline = $t;
    } elseif (preg_match_all('/<h1[^>]*>(.*?)<\/h1>/is', $all_src, $matches)) {
        foreach ($matches[1] as $h1) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $h1));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 4 && strlen($t) < 130) { $hero_tagline = $t; break; }
        }
    }
}

// Hero sub — paragraph near hero h1
$hero_sub = $existing['hero_sub'] ?? '';
if ($all_src) {
    if (preg_match('/id=["\']hero["\'][^>]*>.*?<p[^>]*>(.*?)<\/p>/is', $all_src, $m)) {
        $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
        $t = preg_replace('/\s+/', ' ', $t);
        if (strlen($t) > 10) $hero_sub = substr($t, 0, 160);
    } elseif (preg_match('/<h1[^>]*>.*?<\/h1>.*?<p[^>]*>(.*?)<\/p>/is', $all_src, $m)) {
        $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
        $t = preg_replace('/\s+/', ' ', $t);
        if (strlen($t) > 10) $hero_sub = substr($t, 0, 160);
    }
}

$accent = rd_detect_accent($source_dir, $all_src, $category);
$dark   = rd_detect_dark($source_dir, $all_src);
$light  = rd_adjust_hex($dark, 18);

// ── Update database entry with fresh metadata ─────────────────────────────────

$detect_updates = [
    'name'          => $name,
    'accent'        => $accent,
    'dark'          => $dark,
    'light'         => $light,
    'hero_tagline'  => $hero_tagline,
    'hero_sub'      => $hero_sub,
    'business_name' => $business_name,
];

launchit_update_template($template_id, $detect_updates);

// ── Regenerate thumbnail ──────────────────────────────────────────────────────

function rd_hex2rgb(string $hex): array {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
}
function rd_alloc($img, string $hex, int $alpha = 0): int {
    [$r,$g,$b] = rd_hex2rgb($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}
function rd_rrect($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void {
    if ($r < 1) $r = 1;
    imagefilledrectangle($img, $x1+$r, $y1, $x2-$r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1+$r, $x2, $y2-$r, $color);
    imagefilledellipse($img, $x1+$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y1+$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x1+$r, $y2-$r, $r*2, $r*2, $color);
    imagefilledellipse($img, $x2-$r, $y2-$r, $r*2, $r*2, $color);
}

$thumb_ok = false;
if (function_exists('imagecreatetruecolor')) {
    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (file_exists($fb)) {
        $W = 900; $H = 620;
        $img = imagecreatetruecolor($W, $H);
        [$dr,$dg,$db] = rd_hex2rgb($dark);
        [$lr,$lg,$lb] = rd_hex2rgb($light);
        [$ar,$ag,$ab] = rd_hex2rgb($accent);
        for ($y = 0; $y < $H; $y++) {
            $tt = $y/$H;
            $c  = imagecolorallocate($img,(int)($dr+($lr-$dr)*$tt*0.7),(int)($dg+($lg-$dg)*$tt*0.7),(int)($db+($lb-$db)*$tt*0.7));
            imagefilledrectangle($img, 0, $y, $W, $y, $c);
        }
        $white = imagecolorallocate($img, 255, 255, 255);
        $acc_c = imagecolorallocate($img, $ar, $ag, $ab);
        for ($rad = 280; $rad >= 20; $rad -= 22) {
            $al = (int)(120 - ($rad/280)*118);
            imagefilledellipse($img,(int)($W*0.5),200,$rad*2,(int)($rad*1.2),imagecolorallocatealpha($img,$ar,$ag,$ab,$al));
        }
        imagefilledrectangle($img,0,0,$W,52,imagecolorallocatealpha($img,$dr,$dg,$db,30));
        imagefilledrectangle($img,0,52,$W,53,imagecolorallocatealpha($img,255,255,255,115));
        rd_rrect($img,26,14,186,40,6,rd_alloc($img,$accent,90));
        imagettftext($img,10,0,35,32,$white,$fb,$name);
        foreach([240,295,348,398] as $lx) rd_rrect($img,$lx,22,$lx+38,30,2,imagecolorallocatealpha($img,255,255,255,100));
        rd_rrect($img,$W-110,14,$W-26,40,13,$acc_c);
        imagettftext($img,8,0,$W-100,31,$white,$fb,'Book Now');
        $ey=100;
        imagettftext($img,9,0,(int)(($W/2)-44),$ey+42,imagecolorallocatealpha($img,min(255,$ar+80),$ag,$ab,50),$fb,'WELCOME TO');
        $words=explode(' ',$hero_tagline?:$name); $lines=[]; $line='';
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
        $ty+=28;$bx=(int)(($W-310)/2);
        rd_rrect($img,$bx,$ty,$bx+160,$ty+38,19,$acc_c);
        imagettftext($img,10,0,$bx+16,$ty+24,$white,$fb,'Explore Services');
        rd_rrect($img,$bx+176,$ty,$bx+310,$ty+38,19,imagecolorallocatealpha($img,255,255,255,90));
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
            rd_rrect($img,$cx+3,$cy+4,$cx+$cw+3,$cy+90,8,imagecolorallocatealpha($img,0,0,0,118));
            rd_rrect($img,$cx,$cy,$cx+$cw,$cy+90,8,imagecolorallocate($img,255,255,255));
            rd_rrect($img,$cx+14,$cy+12,$cx+44,$cy+42,6,rd_alloc($img,$accent,100));
            imagettftext($img,11,0,$cx+14,$cy+60,$dk,$fb,$labels[$ci]);
            rd_rrect($img,$cx+14,$cy+66,$cx+$cw-20,$cy+70,2,$ln);
            rd_rrect($img,$cx+14,$cy+76,$cx+$cw-50,$cy+80,2,$ln);
        }
        $thumb_ok = imagejpeg($img,$thumbs_dir.'/'.$template_id.'.jpg',88);
        imagedestroy($img);
    }
}

// ── Save / refresh hero image in media library ────────────────────────────────

require_once __DIR__ . '/admin-lib.php';
$media_dir = launchit_media_dir($category);
if (!is_dir($media_dir)) @mkdir($media_dir, 0755, true);
$hero_url = launchit_extract_hero_url($source_dir);
if ($hero_url) {
    preg_match('/\.(png|webp)(?:[?&]|$)/i', $hero_url, $em);
    $img_ext    = isset($em[1]) ? strtolower($em[1]) : 'jpg';
    $media_dest = $media_dir . '/' . $template_id . '.' . $img_ext;
    if (!file_exists($media_dest)) {
        launchit_download_hero($hero_url, $media_dest);
    }
}

// ── Flash and redirect ────────────────────────────────────────────────────────

$_SESSION['flash'] = [
    'type' => 'success',
    'msg'  => '"' . $name . '" (' . $template_id . ') re-synced from source'
            . ($thumb_ok ? ' + thumbnail regenerated' : ' (thumbnail skipped — GD unavailable)')
            . '. Accent: ' . $accent . ' · Hero: "' . mb_substr($hero_tagline, 0, 60) . '"',
];

header('Location: ' . BASE_PATH . '/admin-catalog.php');
exit;
