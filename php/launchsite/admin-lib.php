<?php
/**
 * admin-lib.php — shared helpers for admin scripts
 */

function launchit_category_slug(string $category): string {
    return match($category) {
        'Hair Salon' => 'hair_salon',
        'Barbershop' => 'barber_shop',
        'Nail Salon' => 'nail_salon',
        default      => 'other',
    };
}

function launchit_media_dir(string $category): string {
    $slug = launchit_category_slug($category);
    return __DIR__ . '/media/' . $slug . '/hero_images';
}

/**
 * Scan a React template source directory for the first high-res hero image URL.
 * Prioritises Pexels/Unsplash at 1920px, then any Pexels/Unsplash, then any image URL.
 */
function launchit_extract_hero_url(string $src_dir): string {
    $scan = $src_dir . '/src';
    if (!is_dir($scan)) return '';

    $candidates = [];
    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($scan, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iter as $file) {
        if (!in_array($file->getExtension(), ['tsx','jsx','ts','js','css'])) continue;
        $content = file_get_contents($file->getPathname());

        // High-res Pexels/Unsplash (w=1920 or w=1600)
        preg_match_all(
            '/https:\/\/images\.(pexels|unsplash)\.com\/[^\'")\s>]+(?:w=1920|w=1600)[^\'")\s>]*/i',
            $content, $m
        );
        foreach ($m[0] as $url) $candidates[] = ['score' => 3, 'url' => $url];

        // Any Pexels/Unsplash JPEG/PNG/WebP
        preg_match_all(
            '/https:\/\/images\.(pexels|unsplash)\.com\/[^\'")\s>]+\.(jpg|jpeg|png|webp)[^\'")\s>]*/i',
            $content, $m
        );
        foreach ($m[0] as $url) $candidates[] = ['score' => 2, 'url' => $url];

        // Any Pexels/Unsplash URL (may end with query params)
        preg_match_all(
            '/https:\/\/images\.(pexels|unsplash)\.com\/[^\'")\s>]{10,}/i',
            $content, $m
        );
        foreach ($m[0] as $url) $candidates[] = ['score' => 1, 'url' => $url];

        // Generic large image URL
        preg_match_all(
            '/https:\/\/[^\'")\s>]+\.(jpg|jpeg|png|webp)[^\'")\s>]{0,60}/i',
            $content, $m
        );
        foreach ($m[0] as $url) $candidates[] = ['score' => 0, 'url' => $url];
    }

    if (!$candidates) return '';
    usort($candidates, fn($a, $b) => $b['score'] <=> $a['score']);
    return $candidates[0]['url'];
}

/**
 * Download an image URL and save to $dest_path.
 * Returns true on success (file written and ≥ 10 KB).
 */
function launchit_download_hero(string $url, string $dest_path): bool {
    if (empty($url)) return false;
    $ctx = stream_context_create(['http' => [
        'timeout'    => 25,
        'user_agent' => 'Mozilla/5.0 (compatible; LaunchitAdmin/1.0)',
        'header'     => "Accept: image/webp,image/jpeg,image/*,*/*\r\nReferer: https://www.pexels.com/\r\n",
        'follow_location' => 1,
    ]]);
    $data = @file_get_contents($url, false, $ctx);
    if (!$data || strlen($data) < 10000) return false;
    return (bool) @file_put_contents($dest_path, $data);
}
