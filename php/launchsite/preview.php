<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/data/templates.php';

$id = isset($_GET['id']) ? trim($_GET['id']) : '';

if (!$id || !isset($all_templates[$id])) {
    header('Location: ' . BASE_PATH . '/');
    exit;
}

$t = $all_templates[$id];
$page_title = $t['name'] . ' — Preview';

// Determine back URL from category
$category_map = [
    'Hair Salon'  => 'hair-salons.php',
    'Barbershop'  => 'barbershops.php',
    'Nail Salon'  => 'nail-salons.php',
];
$back_url = BASE_PATH . '/' . ($category_map[$t['category']] ?? '');

$is_react   = !empty($t['type']) && $t['type'] === 'react';
$is_scraped = !empty($t['type']) && $t['type'] === 'scraped';

// Badge variant per category
$badge_class = match($t['category']) {
    'Barbershop' => 'hb--barber',
    'Nail Salon' => 'hb--nail',
    default      => 'hb--hair',
};

// Demo hours used in the preview (typical UK salon schedule)
$demo_hours = [
    'sun' => ['open' => '10:00', 'close' => '16:00', 'closed' => true],
    'mon' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'tue' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'wed' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'thu' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'fri' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'sat' => ['open' => '10:00', 'close' => '16:00', 'closed' => false],
];

require_once __DIR__ . '/includes/header.php';
?>

<!-- ── Preview chrome bar ── -->
<div class="preview-chrome">
    <a href="<?php echo $back_url; ?>" class="preview-chrome__back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
        Back
    </a>
    <div class="preview-chrome__divider"></div>
    <div class="preview-chrome__info">
        <span class="preview-chrome__name"><?php echo htmlspecialchars($t['name']); ?></span>
        <?php if (!empty($t['badge'])): ?>
        <span class="preview-chrome__badge"><?php echo ucfirst($t['badge']); ?></span>
        <?php endif; ?>
        <span class="preview-chrome__url"><?php echo htmlspecialchars($t['url_slug']); ?>.com</span>
    </div>
    <div class="preview-chrome__device-btns">
        <button class="device-btn is-active" id="btnDesktop" title="Desktop" onclick="setDevice('desktop')">
            <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 14h6M8 12v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="device-btn" id="btnMobile" title="Mobile" onclick="setDevice('mobile')">
            <svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="1" width="8" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="12.5" r="0.75" fill="currentColor"/></svg>
        </button>
    </div>
    <div class="preview-chrome__actions">
        <a href="<?php echo BASE_PATH; ?>/select.php?id=<?php echo urlencode($t['id']); ?>" class="btn btn--orange" style="padding:8px 20px;font-size:0.85rem;">Use This Design</a>
    </div>
</div>

<?php if ($is_react || $is_scraped): ?>
<!-- ── React / Scraped template: iframe preview ── -->
<div class="preview-wrapper preview-wrapper--react">
    <iframe
        id="previewSite"
        src="<?php echo htmlspecialchars($is_scraped ? (BASE_PATH . $t['scraped_path']) : $t['react_path']); ?>"
        class="preview-iframe"
        allowfullscreen
        loading="lazy"
        <?php if ($is_scraped): ?>sandbox="allow-scripts allow-same-origin allow-popups allow-forms"<?php endif; ?>
    ></iframe>
</div>

<script>
function setDevice(mode) {
    var iframe = document.getElementById('previewSite');
    var btnD = document.getElementById('btnDesktop');
    var btnM = document.getElementById('btnMobile');
    if (mode === 'mobile') {
        iframe.style.width = '390px';
        iframe.style.marginLeft = 'auto';
        iframe.style.marginRight = 'auto';
        iframe.style.display = 'block';
        iframe.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.1), 0 24px 64px rgba(0,0,0,0.6)';
        btnM.classList.add('is-active');
        btnD.classList.remove('is-active');
    } else {
        iframe.style.width = '100%';
        iframe.style.boxShadow = 'none';
        btnD.classList.add('is-active');
        btnM.classList.remove('is-active');
    }
}
</script>

<?php else: ?>
<!-- ── PHP template: live iframe preview ── -->
<div class="preview-wrapper preview-wrapper--react" id="phpPreviewWrap">
    <iframe
        id="previewSite"
        src="<?php echo BASE_PATH; ?>/preview-render.php?id=<?php echo urlencode($id); ?>"
        class="preview-iframe"
        allowfullscreen
        loading="eager"
    ></iframe>
</div>

<script>
function setDevice(mode) {
    var iframe = document.getElementById('previewSite');
    var btnD = document.getElementById('btnDesktop');
    var btnM = document.getElementById('btnMobile');
    if (mode === 'mobile') {
        iframe.style.width = '390px';
        iframe.style.marginLeft = 'auto';
        iframe.style.marginRight = 'auto';
        iframe.style.display = 'block';
        iframe.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.1), 0 24px 64px rgba(0,0,0,0.6)';
        btnM.classList.add('is-active');
        btnD.classList.remove('is-active');
    } else {
        iframe.style.width = '100%';
        iframe.style.boxShadow = 'none';
        btnD.classList.add('is-active');
        btnM.classList.remove('is-active');
    }
}
</script>

<?php endif; ?>

<?php require_once __DIR__ . '/includes/footer.php'; ?>

