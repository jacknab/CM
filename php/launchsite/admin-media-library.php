<?php
/**
 * admin-media-library.php
 * Returns the HTML partial for the Image Library modal.
 * Called via fetch() from admin.php.
 */
session_start();
require_once __DIR__ . '/config.php';

$categories = [
    'Nail Salon' => 'nail_salon',
    'Hair Salon' => 'hair_salon',
    'Barbershop' => 'barber_shop',
];

$images = [];
foreach ($categories as $label => $slug) {
    $dir = __DIR__ . '/media/' . $slug . '/hero_images';
    $images[$slug] = [];
    if (is_dir($dir)) {
        $files = glob($dir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [];
        usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
        foreach ($files as $f) {
            $bn = basename($f);
            if ($bn === '.gitkeep') continue;
            $images[$slug][] = [
                'file' => $bn,
                'name' => pathinfo($bn, PATHINFO_FILENAME),
                'url'  => BASE_PATH . '/media/' . $slug . '/hero_images/' . rawurlencode($bn),
            ];
        }
    }
}

$total = array_sum(array_map('count', $images));
?>
<div class="media-lib">
  <div class="media-lib__tabs">
    <?php $first = true; foreach ($categories as $label => $slug): ?>
    <button class="media-tab<?php echo $first ? ' media-tab--active' : ''; ?>"
            data-slug="<?php echo $slug; ?>">
      <?php echo htmlspecialchars($label); ?>
      <span class="media-tab__count"><?php echo count($images[$slug]); ?></span>
    </button>
    <?php $first = false; endforeach; ?>
  </div>

  <?php $first = true; foreach ($categories as $label => $slug): ?>
  <div class="media-panel<?php echo $first ? ' media-panel--active' : ''; ?>"
       id="mpanel-<?php echo $slug; ?>">

    <?php if (empty($images[$slug])): ?>
    <div class="media-empty">
      <div style="font-size:2.8rem;margin-bottom:12px;">🖼️</div>
      <p style="font-size:0.95rem;font-weight:600;color:rgba(255,255,255,0.6);">
        No hero images yet for <?php echo htmlspecialchars($label); ?>.
      </p>
      <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);margin-top:6px;">
        Install a template in this category, use Re-sync, or upload an image below.
      </p>
    </div>
    <?php else: ?>
    <div class="media-grid" id="mgrid-<?php echo $slug; ?>">
      <?php foreach ($images[$slug] as $img): ?>
      <div class="media-card"
           data-file="<?php echo htmlspecialchars($img['file']); ?>"
           data-slug="<?php echo $slug; ?>">
        <div class="media-card__img"
             style="background-image:url('<?php echo htmlspecialchars($img['url']); ?>')"></div>
        <div class="media-card__footer">
          <span class="media-card__name"
                title="<?php echo htmlspecialchars($img['name']); ?>">
            <?php echo htmlspecialchars($img['name']); ?>
          </span>
          <button class="media-card__del btn-media-del"
                  data-file="<?php echo htmlspecialchars($img['file']); ?>"
                  data-slug="<?php echo $slug; ?>"
                  title="Delete image">✕</button>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div class="media-upload-row">
      <label class="media-upload-label" for="mupload-<?php echo $slug; ?>">
        + Upload Image
        <input type="file"
               id="mupload-<?php echo $slug; ?>"
               accept="image/jpeg,image/png,image/webp"
               class="media-upload-input"
               data-slug="<?php echo $slug; ?>"
               style="display:none;">
      </label>
      <span class="media-upload-status" id="mupload-status-<?php echo $slug; ?>"></span>
    </div>
  </div>
  <?php $first = false; endforeach; ?>

  <?php if ($total === 0): ?>
  <div style="padding:8px 20px 16px;font-size:0.78rem;color:rgba(255,255,255,0.25);border-top:1px solid rgba(255,255,255,0.05);margin-top:8px;">
    Tip: Hit <strong style="color:rgba(255,255,255,0.35);">Re-sync</strong> on any installed React template to automatically download its hero image into the library.
  </div>
  <?php endif; ?>
</div>
