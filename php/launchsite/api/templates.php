<?php
/**
 * GET /launchsite/api/templates.php
 * Returns all templates as JSON for the React dashboard.
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../data/templates.php';

$out = [];
foreach ($all_templates as $id => $t) {
    $thumbPath = __DIR__ . '/../assets/img/thumbs/' . $id . '.jpg';
    $thumbOk   = file_exists($thumbPath);

    $out[] = [
        'id'           => $id,
        'name'         => $t['name']         ?? $id,
        'category'     => $t['category']     ?? '',
        'style'        => $t['style']        ?? '',
        'desc'         => $t['desc']         ?? '',
        'badge'        => $t['badge']        ?? '',
        'accent'       => $t['accent']       ?? '#a855f7',
        'dark'         => $t['dark']         ?? '#18181b',
        'features'     => $t['features']     ?? [],
        'hero_tagline' => $t['hero_tagline'] ?? '',
        'type'         => $t['type']         ?? 'php',
        'react_path'   => $t['react_path']   ?? null,
        'scraped_path' => $t['scraped_path'] ?? null,
        'source_url'   => $t['source_url']   ?? null,
        'has_thumb'    => $thumbOk,
        'thumb_url'    => $thumbOk ? '/launchsite/assets/img/thumbs/' . rawurlencode($id) . '.jpg' : null,
        'preview_url'  => '/launchsite/preview.php?id=' . rawurlencode($id),
        'select_url'   => '/launchsite/select.php?id='  . rawurlencode($id),
    ];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
