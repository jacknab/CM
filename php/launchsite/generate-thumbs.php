<?php
/**
 * Generates thumbnail images for all 18 templates using PHP GD.
 * Run once: php generate-thumbs.php
 * Saves to: assets/img/thumbs/{id}.jpg
 */

require_once __DIR__ . '/data/templates.php';

$font_bold    = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
$font_regular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
$out_dir      = __DIR__ . '/assets/img/thumbs';

if (!is_dir($out_dir)) mkdir($out_dir, 0755, true);

$W = 900;
$H = 620;

function hex2rgb(string $hex): array {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
}

function alloc_hex($img, string $hex, int $alpha = 0): int {
    [$r,$g,$b] = hex2rgb($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}

// Rounded rectangle helper (PHP 8.2 compatible)
function rounded_rect($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color, bool $fill = true): void {
    if ($r < 1) $r = 1;
    $fn = $fill ? 'imagefilledrectangle' : 'imagerectangle';
    if ($fill) {
        imagefilledrectangle($img, $x1 + $r, $y1, $x2 - $r, $y2, $color);
        imagefilledrectangle($img, $x1, $y1 + $r, $x2, $y2 - $r, $color);
        imagefilledellipse($img, $x1 + $r, $y1 + $r, $r*2, $r*2, $color);
        imagefilledellipse($img, $x2 - $r, $y1 + $r, $r*2, $r*2, $color);
        imagefilledellipse($img, $x1 + $r, $y2 - $r, $r*2, $r*2, $color);
        imagefilledellipse($img, $x2 - $r, $y2 - $r, $r*2, $r*2, $color);
    }
}

function wrap_text(string $text, string $font, float $size, int $max_w): array {
    $words = explode(' ', $text);
    $lines = []; $line = '';
    foreach ($words as $word) {
        $test = $line ? "$line $word" : $word;
        $box  = imagettfbbox($size, 0, $font, $test);
        $w    = abs($box[2] - $box[0]);
        if ($w > $max_w && $line !== '') { $lines[] = $line; $line = $word; }
        else { $line = $test; }
    }
    if ($line) $lines[] = $line;
    return $lines;
}

foreach ($all_templates as $id => $t) {
    $img = imagecreatetruecolor($W, $H);
    imagesavealpha($img, true);

    $dark_hex  = $t['dark']   ?? '#0b0d1a';
    $light_hex = $t['light']  ?? '#1a1f3a';
    $accent    = $t['accent'] ?? '#7c3aed';

    [$dr,$dg,$db] = hex2rgb($dark_hex);
    [$lr,$lg,$lb] = hex2rgb($light_hex);
    [$ar,$ag,$ab] = hex2rgb($accent);

    // Background gradient
    for ($y = 0; $y < $H; $y++) {
        $ratio = $y / $H;
        $r = (int)($dr + ($lr - $dr) * $ratio * 0.6);
        $g = (int)($dg + ($lg - $dg) * $ratio * 0.6);
        $b = (int)($db + ($lb - $db) * $ratio * 0.6);
        $c = imagecolorallocate($img, $r, $g, $b);
        imagefilledrectangle($img, 0, $y, $W, $y, $c);
    }

    $white      = imagecolorallocate($img, 255, 255, 255);
    $white_dim  = imagecolorallocatealpha($img, 255, 255, 255, 60);
    $accent_c   = imagecolorallocate($img, $ar, $ag, $ab);

    // ── Navbar ──
    $nav_h  = 52;
    $nav_bg = imagecolorallocatealpha($img, max(0,$dr-10), max(0,$dg-10), max(0,$db-10), 5);
    imagefilledrectangle($img, 0, 0, $W, $nav_h, $nav_bg);
    $border_c = imagecolorallocatealpha($img, 255, 255, 255, 110);
    imagefilledrectangle($img, 0, $nav_h, $W, $nav_h+1, $border_c);

    $logo = $t['business_name'] ?? $t['name'];
    imagettftext($img, 13, 0, 28, 33, $white, $font_bold, $logo . '.');

    $link_c = imagecolorallocatealpha($img, 255, 255, 255, 95);
    foreach ([230, 295, 355, 415] as $lx) {
        rounded_rect($img, $lx, 21, $lx+50, 29, 2, $link_c);
    }

    rounded_rect($img, $W-118, 15, $W-28, 38, 5, $accent_c);
    imagettftext($img, 8, 0, $W-109, 30, $white, $font_bold, 'Book Now');

    // ── Hero ──
    $hero_top = $nav_h + 2;

    // Accent glow
    for ($rad = 160; $rad >= 10; $rad -= 15) {
        $alpha = (int)(115 - ($rad / 160) * 115);
        $glow  = imagecolorallocatealpha($img, $ar, $ag, $ab, $alpha);
        imagefilledellipse($img, 110, $hero_top + 75, $rad*2, $rad*2, $glow);
    }

    $cat_label = strtoupper(($t['category'] ?? '') . ' · ' . ($t['style'] ?? ''));
    imagettftext($img, 9, 0, 40, $hero_top + 58, $accent_c, $font_bold, $cat_label);

    $tagline = $t['hero_tagline'] ?? $t['name'];
    $lines   = wrap_text($tagline, $font_bold, 30, 500);
    $ly      = $hero_top + 94;
    foreach (array_slice($lines, 0, 2) as $line) {
        imagettftext($img, 30, 0, 40, $ly, $white, $font_bold, $line);
        $ly += 40;
    }

    $sub       = $t['hero_sub'] ?? '';
    $sub_lines = wrap_text($sub, $font_regular, 12, 430);
    $sub_c     = imagecolorallocatealpha($img, 180, 195, 220, 35);
    $ly += 8;
    foreach (array_slice($sub_lines, 0, 2) as $sl) {
        imagettftext($img, 12, 0, 40, $ly, $sub_c, $font_regular, $sl);
        $ly += 18;
    }
    $ly += 18;

    // Buttons
    rounded_rect($img, 40, $ly, 210, $ly+36, 6, $accent_c);
    imagettftext($img, 10, 0, 56, $ly+22, $white, $font_bold, 'Book an Appointment');

    $out_btn = imagecolorallocatealpha($img, 255, 255, 255, 90);
    rounded_rect($img, 220, $ly, 360, $ly+36, 6, $out_btn);
    imagettftext($img, 10, 0, 237, $ly+22, $white, $font_bold, 'See Our Work');

    // ── Trust bar ──
    $trust_y  = $hero_top + 330;
    if ($trust_y > $H - 180) $trust_y = $H - 180;
    $trust_bg = imagecolorallocatealpha($img, $lr, $lg, $lb, 85);
    imagefilledrectangle($img, 0, $trust_y, $W, $trust_y + 34, $trust_bg);
    $bar_c = imagecolorallocatealpha($img, 255, 255, 255, 100);
    foreach ([55, 200, 340, 480, 605] as $bx) {
        rounded_rect($img, $bx, $trust_y+13, $bx+100, $trust_y+21, 3, $bar_c);
    }

    // ── Services section (white) ──
    $svc_y    = $trust_y + 35;
    $white_bg = imagecolorallocate($img, 250, 250, 252);
    imagefilledrectangle($img, 0, $svc_y, $W, $H, $white_bg);

    $dark_text = imagecolorallocate($img, 18, 18, 35);
    $mid_text  = imagecolorallocate($img, 110, 120, 140);

    $label_x = (int)($W/2 - 40);
    imagettftext($img, 9, 0, $label_x, $svc_y+26, $accent_c, $font_bold, 'WHAT WE OFFER');
    imagettftext($img, 18, 0, (int)($W/2 - 65), $svc_y+52, $dark_text, $font_bold, 'Our Services');
    imagettftext($img, 11, 0, (int)($W/2 - 142), $svc_y+70, $mid_text, $font_regular, 'Everything you need, under one roof.');

    // 3 service cards
    $card_w = 240; $card_h = 84; $gap = 24;
    $total_w = 3 * $card_w + 2 * $gap;
    $cx0 = (int)(($W - $total_w) / 2);
    $cy  = $svc_y + 84;

    $services = $t['features'] ?? ['Services', 'Gallery', 'Booking'];
    $card_bg  = imagecolorallocate($img, 255, 255, 255);
    $shad     = imagecolorallocatealpha($img, 0, 0, 0, 118);
    $icon_bg  = imagecolorallocatealpha($img, $ar, $ag, $ab, 100);
    $line_c   = imagecolorallocate($img, 220, 224, 234);

    for ($ci = 0; $ci < 3; $ci++) {
        $cx = $cx0 + $ci * ($card_w + $gap);
        rounded_rect($img, $cx+3, $cy+4, $cx+$card_w+3, $cy+$card_h+4, 7, $shad);
        rounded_rect($img, $cx, $cy, $cx+$card_w, $cy+$card_h, 7, $card_bg);
        rounded_rect($img, $cx+14, $cy+13, $cx+38, $cy+37, 5, $icon_bg);
        $svc_name = $services[$ci] ?? 'Service';
        imagettftext($img, 11, 0, $cx+14, $cy+56, $dark_text, $font_bold, $svc_name);
        rounded_rect($img, $cx+14, $cy+63, $cx+$card_w-18, $cy+68, 2, $line_c);
        rounded_rect($img, $cx+14, $cy+72, $cx+$card_w-50, $cy+76, 2, $line_c);
    }

    // Save
    $out = "$out_dir/$id.jpg";
    imagejpeg($img, $out, 88);
    imagedestroy($img);
    echo "Generated: $id.jpg\n";
}

echo "\nDone! " . count($all_templates) . " thumbnails saved to assets/img/thumbs/\n";
