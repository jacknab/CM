<?php
session_start();
require_once __DIR__ . '/config.php';


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . BASE_PATH . '/admin.php');
    exit;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function abort(string $msg): void {
    echo "</ul></div>"
       . "<div class='result-box result-box--error'><div class='result-box__title'>Installation failed</div>"
       . "<p style='color:rgba(255,255,255,0.6);font-size:0.875rem;'>$msg</p></div>"
       . "<div class='result-actions'>"
       . "<a href='" . BASE_PATH . "/admin.php' class='btn-admin btn-admin--ghost'>← Back to Admin</a>"
       . "</div></div></body></html>";
    exit;
}

function run_cmd(string $cmd, string $cwd = ''): array {
    $full = $cwd ? "cd " . escapeshellarg($cwd) . " && $cmd 2>&1" : "$cmd 2>&1";
    exec($full, $out, $code);
    return ['output' => implode("\n", $out), 'code' => $code];
}

// ── Auto-detect metadata from source ─────────────────────────────────────────

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
    // 1. CSS custom properties in any stylesheet
    $css_files = ['src/index.css','src/styles.css','src/globals.css','src/App.css'];
    foreach ($css_files as $f) {
        $path = $dir . '/' . $f;
        if (!file_exists($path)) continue;
        $css = file_get_contents($path);
        if (preg_match('/--(?:primary|accent|brand|color-primary|highlight)[^:]*:\s*(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})\b/i', $css, $m)) {
            return strtolower($m[1]);
        }
    }
    // 2. Tailwind color classes in source
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
        // 3. Any mid-luminance hex in source
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
    // 4. Category defaults
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

function detect_metadata(string $dir, string $zip_filename, string $category): array {
    // ID from zip filename — strip "bolt" segments (e.g. project-bolt-xxx → project-xxx)
    $raw_id = preg_replace('/\.zip$/i', '', $zip_filename);
    $id = preg_replace('/[^a-z0-9\-]/', '', strtolower(str_replace(['_',' ','.'], '-', $raw_id)));
    $id = preg_replace('/-bolt-/', '-', $id);
    $id = preg_replace('/^bolt-/', '', $id);
    $id = preg_replace('/-bolt$/', '', $id);
    $id = trim(preg_replace('/-+/', '-', $id), '-') ?: ('template-' . substr(md5(microtime()), 0, 6));

    // Name from package.json
    $name = '';
    $pkg_file = $dir . '/package.json';
    if (file_exists($pkg_file)) {
        $pkg = json_decode(file_get_contents($pkg_file), true) ?: [];
        $raw = $pkg['name'] ?? '';
        $clean = preg_replace('/^@[^\/]+\//', '', $raw);
        $clean = preg_replace('/^template-/', '', $clean);
        $name = ucwords(str_replace(['-','_'], ' ', $clean));
    }
    if (strlen($name) < 2) $name = ucwords(str_replace(['-','_'], ' ', $id));

    // Check index.html <title> — real templates often have the actual site name here
    $index_html_path = $dir . '/index.html';
    if (file_exists($index_html_path)) {
        $html_content = file_get_contents($index_html_path);
        if (preg_match('/<title>([^<]{3,80})<\/title>/i', $html_content, $m)) {
            $title_raw = trim($m[1]);
            if (!preg_match('/vite|react|typescript|starter|template|webpack|create.?app/i', $title_raw)) {
                $name = $title_raw;
            }
        }
    }

    // Business name & hero text from main component
    $app_src = read_main_component($dir);
    $business_name      = $name;
    $business_from_src  = false;
    $hero_tagline       = '';
    $hero_sub           = '';

    if ($app_src) {
        // Business name: <strong ...>Business Name</strong>
        if (preg_match('/<strong[^>]*>\s*([A-Z][^<]{3,55})\s*<\/strong>/u', $app_src, $m)) {
            $candidate = trim(strip_tags($m[1]));
            if (strlen($candidate) > 3 && strlen($candidate) < 60) {
                $business_name     = $candidate;
                $business_from_src = true;
            }
        }
        // Also try the site logo / brand text patterns
        if (!$business_from_src) {
            $logo_patterns = [
                '/class=["\'][^"\']*(?:logo|brand|site-name)[^"\']*["\'][^>]*>\s*<[^>]+>\s*([A-Z][^<]{3,55})\s*<\/[^>]+>/isu',
                '/class=["\'][^"\']*(?:logo|brand|site-name)[^"\']*["\'][^>]*>\s*([A-Z][^<]{3,55})\s*</isu',
                '/<(?:h1|h2)[^>]*class=["\'][^"\']*(?:logo|brand|title)[^"\']*["\'][^>]*>(.*?)<\/(?:h1|h2)>/isu',
            ];
            foreach ($logo_patterns as $pat) {
                if (preg_match($pat, $app_src, $m)) {
                    $candidate = trim(strip_tags($m[1]));
                    $candidate = preg_replace('/\s+/', ' ', $candidate);
                    if (strlen($candidate) > 3 && strlen($candidate) < 60) {
                        $business_name     = $candidate;
                        $business_from_src = true;
                        break;
                    }
                }
            }
        }
        // Hero h1 text
        if (preg_match('/id=["\']hero["\'][^>]*>.*?<h1[^>]*>(.*?)<\/h1>/is', $app_src, $m)) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 4 && strlen($t) < 130) $hero_tagline = $t;
        }
        if (!$hero_tagline && preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $app_src, $m)) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 4 && strlen($t) < 130) $hero_tagline = $t;
        }
        // Hero sub from paragraph near hero
        if (preg_match('/id=["\']hero["\'][^>]*>.*?<p[^>]*>(.*?)<\/p>/is', $app_src, $m)) {
            $t = trim(preg_replace('/\{[^}]+\}|<[^>]+>/', '', $m[1]));
            $t = preg_replace('/\s+/', ' ', $t);
            if (strlen($t) > 10) $hero_sub = substr($t, 0, 120);
        }
    }
    if (!$hero_tagline) $hero_tagline = $business_name . '.';

    // If we found the real business name from source, use it as the display name too
    if ($business_from_src) $name = $business_name;

    $accent = detect_accent_color($dir, $app_src, $category);
    $dark   = detect_dark_color($dir, $app_src);
    $light  = adjust_hex($dark, 18);

    $style_map = ['Hair Salon'=>'Modern','Barbershop'=>'Classic','Nail Salon'=>'Luxury'];
    $desc_map  = [
        'Hair Salon' => 'A professionally designed hair salon website with clean layout, service menus, and a seamless booking experience.',
        'Barbershop' => 'A sharp, modern barbershop site showcasing services, hours, and making booking easy for clients.',
        'Nail Salon' => 'An elegant nail salon website with gallery, service pricing, and a polished look that converts visitors into clients.',
    ];

    return [
        'id'            => $id,
        'name'          => $name,
        'business_name' => $business_name,
        'hero_tagline'  => $hero_tagline,
        'hero_sub'      => $hero_sub,
        'accent'        => $accent,
        'dark'          => $dark,
        'light'         => $light,
        'style'         => $style_map[$category] ?? 'Modern',
        'desc'          => $desc_map[$category] ?? 'A professionally designed salon website template.',
    ];
}

// ── Thumbnail generator ───────────────────────────────────────────────────────

/**
 * Find the largest image file in the built template's assets directory.
 * This is almost always the hero background photo.
 */
function find_hero_image(string $built_dir): string {
    $best = ''; $best_size = 0;
    $assets_dir = $built_dir . '/assets';
    if (!is_dir($assets_dir)) return '';
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($assets_dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iter as $file) {
        if (!$file->isFile()) continue;
        $ext = strtolower($file->getExtension());
        if (!in_array($ext, ['jpg','jpeg','png','webp'])) continue;
        $sz = $file->getSize();
        if ($sz > $best_size) { $best_size = $sz; $best = $file->getPathname(); }
    }
    return $best;
}

/**
 * Generate a thumbnail using the actual hero photo from the built template.
 * Scales/crops the photo to 900×620, darkens it, then overlays a fake browser
 * chrome (nav bar), the business name, tagline, and CTA buttons — so it looks
 * like a real screenshot of the site's hero section.
 */
function generate_thumbnail_from_photo(
    string $photo_path, string $id, string $name, string $accent,
    string $tagline, string $hero_sub, string $out_dir
): bool {
    $ext = strtolower(pathinfo($photo_path, PATHINFO_EXTENSION));
    $src = match($ext) {
        'jpg','jpeg' => @imagecreatefromjpeg($photo_path),
        'png'        => @imagecreatefrompng($photo_path),
        'webp'       => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($photo_path) : false,
        default      => false,
    };
    if (!$src) return false;

    $fb = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    $fr = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!file_exists($fb)) { imagedestroy($src); return false; }

    $W = 900; $H = 620;
    $img = imagecreatetruecolor($W, $H);

    // Scale & centre-crop source photo to fill 900×620
    $sw = imagesx($src); $sh = imagesy($src);
    $scale = max($W / $sw, $H / $sh);
    $nw = (int)($sw * $scale); $nh = (int)($sh * $scale);
    $ox = (int)(($nw - $W) / 2); $oy = (int)(($nh - $H) / 2);
    $tmp = imagecreatetruecolor($nw, $nh);
    imagecopyresampled($tmp, $src, 0, 0, 0, 0, $nw, $nh, $sw, $sh);
    imagecopy($img, $tmp, 0, 0, $ox, $oy, $W, $H);
    imagedestroy($tmp); imagedestroy($src);

    // Dark gradient overlay (heavier at top & bottom for legibility)
    for ($y = 0; $y < $H; $y++) {
        $t   = $y / $H;
        $a   = (int)(55 + $t * 45); // 55→100 alpha (0=opaque, 127=transparent in GD)
        imagefilledrectangle($img, 0, $y, $W, $y, imagecolorallocatealpha($img, 0, 0, 0, $a));
    }
    // Extra darkening strip behind the nav bar
    imagefilledrectangle($img, 0, 0, $W, 58, imagecolorallocatealpha($img, 0, 0, 0, 40));

    [$ar,$ag,$ab] = hex2rgb_local($accent);
    $acc_c  = imagecolorallocate($img, $ar, $ag, $ab);
    $white  = imagecolorallocate($img, 255, 255, 255);
    $white2 = imagecolorallocatealpha($img, 255, 255, 255, 40);

    // ── Fake nav bar ──────────────────────────────────────────────────────────
    // Logo circle + brand name
    imagefilledellipse($img, 30, 29, 28, 28, $acc_c);
    imagettftext($img, 10, 0, 48, 34, $white, $fb, $name);
    // Nav links (placeholder dots/lines)
    foreach ([340, 400, 460, 520] as $nx) {
        $box = imagettfbbox(9, 0, $fr, ['About','Gallery','Services','Contact'][array_search($nx,[340,400,460,520])]);
        imagettftext($img, 9, 0, $nx, 33, $white2, $fr, ['About','Gallery','Services','Contact'][array_search($nx,[340,400,460,520])]);
    }
    // CTA button
    rrect($img, $W-128, 14, $W-20, 44, 15, $acc_c);
    imagettftext($img, 9, 0, $W-115, 33, $white, $fb, 'Book Now');

    // ── Hero text block (centred) ─────────────────────────────────────────────
    $cy = 185;
    // "WELCOME TO" label
    $wc = imagecolorallocatealpha($img, $ar, $ag, $ab, 20);
    $box = imagettfbbox(9, 0, $fb, 'WELCOME TO');
    imagettftext($img, 9, 0, (int)(($W - abs($box[2]-$box[0])) / 2), $cy, $wc, $fb, 'WELCOME TO');
    $cy += 22;

    // Large title — word-wrap at ~700px
    $words = explode(' ', $tagline ?: $name);
    $lines = []; $line = '';
    foreach ($words as $w) {
        $test = $line ? "$line $w" : $w;
        $box  = imagettfbbox(40, 0, $fb, $test);
        if (abs($box[2]-$box[0]) > 700 && $line) { $lines[] = $line; $line = $w; } else $line = $test;
    }
    if ($line) $lines[] = $line;
    foreach (array_slice($lines, 0, 3) as $l) {
        $box = imagettfbbox(40, 0, $fb, $l);
        imagettftext($img, 40, 0, (int)(($W - abs($box[2]-$box[0])) / 2), $cy + 44, $white, $fb, $l);
        $cy += 52;
    }
    $cy += 20;

    // Sub-text
    $sub = $hero_sub ?: 'Where beauty meets relaxation. Experience premium services in an elegant environment.';
    if (strlen($sub) > 90) $sub = substr($sub, 0, 87) . '…';
    $sc  = imagecolorallocatealpha($img, 220, 220, 220, 20);
    $box = imagettfbbox(10, 0, $fr, $sub);
    imagettftext($img, 10, 0, (int)(($W - abs($box[2]-$box[0])) / 2), $cy + 10, $sc, $fr, $sub);
    $cy += 30;

    // CTA buttons
    $bw  = 155; $gap = 16;
    $bx  = (int)(($W - $bw * 2 - $gap) / 2);
    rrect($img, $bx, $cy + 10, $bx + $bw, $cy + 48, 20, $acc_c);
    imagettftext($img, 10, 0, $bx + 20, $cy + 34, $white, $fb, 'Explore Services');
    rrect($img, $bx + $bw + $gap, $cy + 10, $bx + $bw * 2 + $gap, $cy + 48, 20, imagecolorallocatealpha($img, 255, 255, 255, 70));
    imagettftext($img, 10, 0, $bx + $bw + $gap + 20, $cy + 34, $white, $fb, 'Get Directions');

    $ok = imagejpeg($img, $out_dir . '/' . $id . '.jpg', 90);
    imagedestroy($img);
    return (bool)$ok;
}

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

$category   = trim($_POST['category'] ?? '');
$valid_cats = ['Hair Salon', 'Barbershop', 'Nail Salon'];
$errors = [];

if (!in_array($category, $valid_cats)) $errors[] = 'Please select a valid category (Hair Salon, Barbershop, or Nail Salon).';
if (empty($_FILES['zipfile']['tmp_name'])) $errors[] = 'No ZIP file received.';

$upload_err_map = [
    UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload_max_filesize limit.',
    UPLOAD_ERR_FORM_SIZE  => 'File exceeds MAX_FILE_SIZE.',
    UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded.',
    UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
    UPLOAD_ERR_NO_TMP_DIR => 'Missing server temp folder.',
    UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
    UPLOAD_ERR_EXTENSION  => 'Upload stopped by server extension.',
];
$upload_code = $_FILES['zipfile']['error'] ?? UPLOAD_ERR_OK;
if ($upload_code !== UPLOAD_ERR_OK && $upload_code !== 0) {
    $errors[] = $upload_err_map[$upload_code] ?? "Upload error (code $upload_code).";
}

// ── Paths & environment ───────────────────────────────────────────────────────

$workspace_root = dirname(__DIR__);
$artifacts_dir  = $workspace_root . '/artifacts';
$thumbs_dir     = __DIR__ . '/assets/img/thumbs';

$pnpm = trim(shell_exec('which pnpm 2>/dev/null') ?: '');
if (!$pnpm || !file_exists($pnpm)) $pnpm = '';

$npm  = trim(shell_exec('which npm 2>/dev/null') ?: '');
if (!$npm || !file_exists($npm)) $npm = 'npm';

$env_prefix = 'HOME=' . escapeshellarg(getenv('HOME') ?: '/home/runner')
            . ' PATH=' . escapeshellarg(getenv('PATH') ?: '/nix/store/1lagpgadaybvs1n2312gysg2phjk89y8-nodejs-20.20.0-wrapped/bin:/usr/local/bin:/usr/bin:/bin');

// ── Begin streaming output ────────────────────────────────────────────────────

// Disable proxy/CDN buffering so each step appears in the browser immediately.
// Without these headers, nginx / Express compression / Cloudflare would hold
// the chunked response until the full body is ready.
header('Content-Type: text/html; charset=utf-8');
header('X-Accel-Buffering: no');
header('Cache-Control: no-cache');
header('Transfer-Encoding: chunked');

ob_implicit_flush(true);
@ob_end_flush();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Installing Template — Launchit Admin</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head>
<body class="admin-body">
<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
    </a>
</header>

<div class="install-result">
    <div class="admin-page-title" style="margin-bottom:6px;">Installing Template</div>
    <div class="admin-page-sub" style="margin-bottom:24px;">Category: <strong><?php echo htmlspecialchars($category ?: '(not set)'); ?></strong></div>

<?php if ($errors): ?>
    <div class="result-box result-box--error">
        <div class="result-box__title">Could not start installation</div>
        <ul style="margin-top:8px;padding-left:20px;color:rgba(255,255,255,0.6);font-size:0.875rem;line-height:1.9;">
            <?php foreach ($errors as $e): ?>
            <li><?php echo htmlspecialchars($e); ?></li>
            <?php endforeach; ?>
        </ul>
    </div>
    <div class="result-actions">
        <a href="<?php echo BASE_PATH; ?>/admin.php" class="btn-admin btn-admin--ghost">← Back to Admin</a>
    </div>
</div></body></html>
<?php exit; endif; ?>

    <div class="result-box result-box--success">
        <div class="result-box__title" style="margin-bottom:14px;">Installation progress</div>
        <ul class="result-steps" id="steps">
<?php

// ── 1. Extract ZIP ────────────────────────────────────────────────────────────
step('📦', 'Extracting ZIP archive…');

$zip_tmp      = $_FILES['zipfile']['tmp_name'];
$zip_filename = basename($_FILES['zipfile']['name']);
$zip          = new ZipArchive();
if ($zip->open($zip_tmp) !== true) abort('Could not open the ZIP file. Make sure it is a valid .zip archive.');

// Detect top-level folder wrapper
$prefix = '';
$first  = $zip->getNameIndex(0);
if ($first && substr($first, -1) === '/') {
    $all_under = true;
    for ($i = 1; $i < $zip->numFiles; $i++) {
        if (strpos($zip->getNameIndex($i), $first) !== 0) { $all_under = false; break; }
    }
    if ($all_under) $prefix = $first;
}

$tmp_extract = sys_get_temp_dir() . '/launchit_' . time() . '_' . rand(100,999);
if (!mkdir($tmp_extract, 0755, true)) abort('Server could not create a temp directory.');
$zip->extractTo($tmp_extract);
$zip->close();

$src = $prefix ? $tmp_extract . '/' . trim($prefix, '/') : $tmp_extract;

if (!file_exists($src . '/package.json')) {
    abort('No <code>package.json</code> found. Please zip the <em>root</em> of your React/Vite project — not a parent folder.');
}
step('✅', 'ZIP extracted — found <code>package.json</code>');

// ── 2. Auto-detect metadata ───────────────────────────────────────────────────
step('🔍', 'Reading template info from source files…');

$meta = detect_metadata($src, $zip_filename, $category);
$tid  = $meta['id'];

// Avoid duplicate IDs
require_once __DIR__ . '/data/templates.php';
if (isset($all_templates[$tid])) {
    $tid       = $tid . '-' . substr(md5(microtime(true)), 0, 4);
    $meta['id'] = $tid;
}

$dest_dir      = $artifacts_dir . '/template-' . $tid;
$built_dir     = __DIR__ . '/templates/' . $tid;
$base_path_url = '/launchsite/templates/' . $tid . '/';

step('✅',
    'Detected: <strong>' . htmlspecialchars($meta['name']) . '</strong>'
    . ' &nbsp;·&nbsp; accent <span style="display:inline-block;width:11px;height:11px;border-radius:3px;'
    . 'background:' . htmlspecialchars($meta['accent']) . ';vertical-align:middle;margin:0 3px;"></span>'
    . '<code>' . htmlspecialchars($meta['accent']) . '</code>'
    . ' &nbsp;·&nbsp; business: <em>' . htmlspecialchars($meta['business_name']) . '</em>'
);

// ── 3. Move source to artifacts ───────────────────────────────────────────────
step('📁', "Moving source to <code>artifacts/template-$tid/</code>…");

if (is_dir($dest_dir)) run_cmd("rm -rf " . escapeshellarg($dest_dir));

if (!@rename($src, $dest_dir)) {
    $r = run_cmd("cp -r " . escapeshellarg($src) . " " . escapeshellarg($dest_dir));
    run_cmd("rm -rf " . escapeshellarg($tmp_extract));
    if ($r['code'] !== 0) abort('Could not move files to the artifacts directory. Check server permissions.');
}
step('✅', "Source at <code>artifacts/template-$tid/</code>");

// ── 4. Configure Vite + package.json ─────────────────────────────────────────
step('⚙️', 'Writing <code>vite.config.ts</code> with correct base path and output directory…');

$vite_out_rel = '../../launchsite/templates/' . $tid;
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

// Remove conflicting JS vite configs
foreach (['vite.config.js','vite.config.mjs'] as $old) {
    if (file_exists($dest_dir . '/' . $old)) unlink($dest_dir . '/' . $old);
}

// Update package.json for workspace compatibility
$pkg = json_decode(file_get_contents($dest_dir . '/package.json'), true) ?: [];
$pkg['name'] = '@workspace/template-' . $tid;
if (empty($pkg['scripts']['build'])) $pkg['scripts']['build'] = 'vite build';
file_put_contents($dest_dir . '/package.json', json_encode($pkg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

step('✅', "Configured: base <code>$base_path_url</code> → outDir <code>launchsite-php/templates/$tid/</code>");

// ── 5. pnpm install ───────────────────────────────────────────────────────────

function run_cmd_progress(string $cmd, string $cwd = ''): array {
    $full = $cwd ? "cd " . escapeshellarg($cwd) . " && $cmd 2>&1" : "$cmd 2>&1";
    $desc = [['pipe','r'], ['pipe','w'], ['pipe','w']];
    $proc = proc_open($full, $desc, $pipes);
    if (!is_resource($proc)) return ['output' => '', 'code' => 1];
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    $out = '';
    $last_tick = time();
    $tick_count = 0;
    echo "<li class='result-step'><span class='result-step__icon'>📥</span><span>"
       . "Installing dependencies… <span id='pnpm-progress' style='color:rgba(255,255,255,0.4);font-family:monospace;'></span></span></li>\n";
    @ob_flush(); flush();
    while (!feof($pipes[1])) {
        $chunk = fread($pipes[1], 4096);
        if ($chunk !== false && $chunk !== '') $out .= $chunk;
        if (time() - $last_tick >= 3) {
            $tick_count++;
            $dots = str_repeat('·', $tick_count % 4 ?: 4);
            $secs = $tick_count * 3;
            echo "<script>var p=document.getElementById('pnpm-progress');if(p)p.textContent='" . $dots . " {$secs}s';</script>\n";
            @ob_flush(); flush();
            $last_tick = time();
        }
        usleep(200000);
    }
    echo "<script>var p=document.getElementById('pnpm-progress');if(p)p.textContent='done';</script>\n";
    @ob_flush(); flush();
    fclose($pipes[1]);
    $code = proc_close($proc);
    return ['output' => $out, 'code' => $code];
}

// Install dependencies directly in the template directory.
// We do NOT run in the workspace root — there is no pnpm-workspace.yaml and
// running a full workspace install would reinstall thousands of packages and
// take many minutes. Installing in the template dir is fast and self-contained.
if ($pnpm) {
    $r = run_cmd_progress("$env_prefix " . escapeshellarg($pnpm) . " install --no-frozen-lockfile", $dest_dir);
} else {
    // pnpm not found — fall back to npm
    $r = run_cmd_progress("$env_prefix " . escapeshellarg($npm) . " install --legacy-peer-deps", $dest_dir);
}

if ($r['code'] !== 0) {
    // Last-ditch npm fallback
    $r2 = run_cmd("$env_prefix " . escapeshellarg($npm) . " install --legacy-peer-deps", $dest_dir);
    if ($r2['code'] !== 0) {
        step_log('❌', 'Dependency installation failed', $r['output'] . "\n" . ($r2['output'] ?? ''));
        abort('Could not install dependencies. Check that your <code>package.json</code> is valid and all package names are correct.');
    }
    step('✅', 'Dependencies installed (npm fallback)');
} else {
    step('✅', 'Dependencies installed');
}

// ── 6. Vite build ────────────────────────────────────────────────────────────
step('🔨', 'Building the React app (<code>vite build</code>)…');

// Run vite build using the locally-installed binary so it works whether
// pnpm or npm was used for install, and without requiring workspace context.
$vite_bin = $dest_dir . '/node_modules/.bin/vite';
if (file_exists($vite_bin)) {
    $r = run_cmd("$env_prefix " . escapeshellarg($vite_bin) . " build", $dest_dir);
} elseif ($pnpm) {
    $r = run_cmd("$env_prefix " . escapeshellarg($pnpm) . " exec vite build", $dest_dir);
} else {
    $r = run_cmd("$env_prefix " . escapeshellarg($npm) . " run build", $dest_dir);
}

if ($r['code'] !== 0 || !file_exists($built_dir . '/index.html')) {
    step_log('❌', 'Build failed', $r['output']);
    abort('Vite build failed — see log above. Common causes: missing <code>@vitejs/plugin-react</code> in devDependencies, TypeScript errors, or import paths that don\'t exist.');
}
step('✅', "Build complete → <code>launchsite-php/templates/$tid/index.html</code>");

// ── 7. Register in database catalog ───────────────────────────────────────────
step('📝', 'Registering template in the catalog…');

launchit_insert_template([
    'id'            => $tid,
    'name'          => $meta['name'],
    'category'      => $category,
    'style'         => $meta['style'] ?? 'Modern',
    'desc'          => $meta['desc'] ?? '',
    'badge'         => 'new',
    'features'      => ['Services', 'Gallery', 'Booking'],
    'accent'        => $meta['accent'],
    'dark'          => $meta['dark'],
    'light'         => $meta['light'],
    'url_slug'      => $tid,
    'hero_tagline'  => $meta['hero_tagline'],
    'hero_sub'      => $meta['hero_sub'],
    'business_name' => $meta['business_name'],
    'type'          => 'react',
    'react_path'    => $base_path_url,
]);

step('✅', "Registered — will appear immediately in the <strong>" . htmlspecialchars($category) . "</strong> catalog page");

// ── 8. Thumbnail — browser screenshot first, GD fallback ─────────────────────
step('🖼️', 'Capturing thumbnail (browser screenshot of header + hero)…');

$thumb_ok     = false;
$thumb_method = '';
$thumb_path   = $thumbs_dir . '/' . $tid . '.jpg';

// ── 8a. Browser screenshot via headless Chromium ─────────────────────────────
$node = trim(shell_exec('which node 2>/dev/null') ?: '');
if (!$node || !file_exists($node)) $node = '/home/runner/.nix-profile/bin/node';
$screenshot_script = realpath(dirname($workspace_root) . '/scripts/screenshot-template.mjs');

if ($node && file_exists($node) && $screenshot_script && file_exists($screenshot_script)) {
    $scr_cmd = "timeout 60 env"
        . " HOME=" . escapeshellarg(getenv('HOME') ?: '/home/runner')
        . " PATH=" . escapeshellarg(getenv('PATH') ?: '/home/runner/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin')
        . " " . escapeshellarg($node) . " " . escapeshellarg($screenshot_script)
        . " --id=" . escapeshellarg($tid)
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

// ── 8b. GD fallback ───────────────────────────────────────────────────────────
if (!$thumb_ok) {
    $hero_photo = find_hero_image($built_dir);
    if ($hero_photo) {
        $thumb_ok = generate_thumbnail_from_photo(
            $hero_photo, $tid, $meta['business_name'], $meta['accent'],
            $meta['hero_tagline'], $meta['hero_sub'], $thumbs_dir
        );
        if (!$thumb_ok) {
            $thumb_ok = generate_thumbnail($tid, $meta['name'], $meta['accent'], $meta['dark'], $meta['light'], $meta['hero_tagline'], $thumbs_dir);
        }
    } else {
        $thumb_ok = generate_thumbnail($tid, $meta['name'], $meta['accent'], $meta['dark'], $meta['light'], $meta['hero_tagline'], $thumbs_dir);
    }
    if ($thumb_ok) $thumb_method = 'generated (GD)';
}

if ($thumb_ok) {
    step('✅', 'Thumbnail ready (' . $thumb_method . ')');
} else {
    step('⚠️', "Thumbnail skipped — add a JPEG manually to <code>assets/img/thumbs/$tid.jpg</code>");
}

// ── 9. Save hero image to media library ───────────────────────────────────────
step('📸', 'Saving hero image to media library…');

require_once __DIR__ . '/admin-lib.php';
$media_dir = launchit_media_dir($category);
if (!is_dir($media_dir)) @mkdir($media_dir, 0755, true);

$hero_url    = launchit_extract_hero_url($dest_dir);
$media_saved = false;
if ($hero_url) {
    preg_match('/\.(png|webp)(?:[?&]|$)/i', $hero_url, $em);
    $img_ext     = isset($em[1]) ? strtolower($em[1]) : 'jpg';
    $media_saved = launchit_download_hero($hero_url, $media_dir . '/' . $tid . '.' . $img_ext);
}

if ($media_saved) {
    step('✅', 'Hero image saved to <code>media/' . launchit_category_slug($category) . '/hero_images/</code>');
} else {
    step('⚠️', 'Hero image not downloaded — upload manually via the Image Library or use Re-sync later.');
}

$preview_url = BASE_PATH . '/preview.php?id=' . urlencode($tid);
$cat_slug    = ['Hair Salon'=>'hair-salons.php','Barbershop'=>'barbershops.php','Nail Salon'=>'nail-salons.php'][$category] ?? '';
$cat_url     = BASE_PATH . '/' . $cat_slug;
?>
        </ul>
    </div>

    <div class="result-box result-box--success" style="margin-top:20px;">
        <div class="result-box__title">🎉 Template installed successfully!</div>
        <p style="color:rgba(255,255,255,0.65);font-size:0.875rem;margin-top:6px;line-height:1.7;">
            <strong style="color:white;"><?php echo htmlspecialchars($meta['name']); ?></strong>
            is now live in the catalog under <strong style="color:white;"><?php echo htmlspecialchars($category); ?></strong>.
        </p>
        <p style="color:rgba(255,255,255,0.35);font-size:0.78rem;margin-top:8px;">
            ID: <code><?php echo htmlspecialchars($tid); ?></code> &nbsp;·&nbsp;
            Accent: <code><?php echo htmlspecialchars($meta['accent']); ?></code> &nbsp;·&nbsp;
            Business: <em><?php echo htmlspecialchars($meta['business_name']); ?></em>
        </p>
    </div>

    <div class="result-actions">
        <a href="<?php echo $preview_url; ?>" target="_blank" class="btn-admin btn-admin--orange">Preview Template ↗</a>
        <?php if ($cat_url): ?>
        <a href="<?php echo $cat_url; ?>" target="_blank" class="btn-admin btn-admin--ghost">View in Catalog ↗</a>
        <?php endif; ?>
        <a href="<?php echo BASE_PATH; ?>/admin.php" class="btn-admin btn-admin--ghost">← Back to Admin</a>
    </div>
</div>
</body>
</html>
