<?php header('Location: /launchsite', true, 301); exit;
$page_title = 'Hair Salon Templates';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/categories.php';

$my_key    = 'Hair Salon';
$templates = array_values(array_filter($all_templates, fn($t) => $t['category'] === $my_key));

if (empty($templates)) {
    header('Location: ' . BASE_PATH . '/');
    exit;
}

require_once __DIR__ . '/includes/header.php';
?>

<section class="page-hero">
    <div class="container">
        <a href="<?php echo BASE_PATH; ?>/" class="page-hero__back">← All Templates</a>
        <div class="section-label">💇‍♀️ Hair Salons</div>
        <h1>Hair Salon <em>Templates</em></h1>
        <p>Elegant, conversion-focused designs built for hair salons of every style.</p>
    </div>
</section>

<nav class="category-nav">
    <div class="category-nav-inner">
        <a href="<?php echo BASE_PATH; ?>/" class="category-tab">All Templates</a>
        <?php foreach ($active_categories as $cat): ?>
        <a href="<?php echo BASE_PATH; ?>/<?php echo $cat['page']; ?>" class="category-tab<?php echo $cat['key'] === $my_key ? ' is-active' : ''; ?>">
            <span class="tab-icon"><?php echo $cat['emoji']; ?></span>
            <?php echo htmlspecialchars($cat['label']); ?>
            <?php if ($cat['key'] === $my_key): ?>
            <span class="tab-count"><?php echo $cat['count']; ?></span>
            <?php endif; ?>
        </a>
        <?php endforeach; ?>
    </div>
</nav>

<section class="catalog-section">
    <div class="container">
        <div class="catalog-header">
            <h2>Hair Salon Templates</h2>
            <span class="catalog-meta"><?php echo count($templates); ?> design<?php echo count($templates) !== 1 ? 's' : ''; ?> available</span>
        </div>
        <div class="cat-page-grid">
            <?php foreach ($templates as $index => $t):
                $iframe_src  = isset($t['type']) && $t['type'] === 'react'
                    ? htmlspecialchars($t['react_path'] ?? '')
                    : BASE_PATH . '/preview-render.php?id=' . urlencode($t['id']);
                $preview_url = BASE_PATH . '/preview.php?id=' . urlencode($t['id']);
                $start_url   = BASE_PATH . '/select.php?id='  . urlencode($t['id']);
            ?>
            <div class="tpl-card tpl-card--in" style="transition-delay:<?php echo $index * 50; ?>ms">

                <div class="tpl-card__preview">
                    <div class="tpl-iframe-wrap">
                        <iframe
                            class="tpl-iframe"
                            src="<?php echo $iframe_src; ?>"
                            scrolling="no"
                            tabindex="-1"
                            loading="lazy"
                            aria-hidden="true"
                        ></iframe>
                    </div>

                    <div class="tpl-card__overlay">
                        <div class="tpl-card__overlay-inner">
                            <button
                                class="tpl-overlay-btn tpl-overlay-btn--preview tpl-preview-trigger"
                                data-preview-url="<?php echo $iframe_src; ?>"
                                data-full-url="<?php echo $preview_url; ?>"
                                data-template-name="<?php echo htmlspecialchars($t['name']); ?>"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                Preview
                            </button>
                            <a href="<?php echo $start_url; ?>" class="tpl-overlay-btn tpl-overlay-btn--start">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                                Use This Template
                            </a>
                        </div>
                    </div>

                    <?php if (!empty($t['badge'])): ?>
                    <span class="tpl-card__badge tpl-card__badge--<?php echo htmlspecialchars($t['badge']); ?>">
                        <?php echo $t['badge'] === 'popular' ? '🔥' : '✨'; ?>
                        <?php echo ucfirst($t['badge']); ?>
                    </span>
                    <?php endif; ?>
                </div>

                <div class="tpl-card__foot">
                    <div class="tpl-card__foot-left">
                        <h3 class="tpl-card__name"><?php echo htmlspecialchars($t['name']); ?></h3>
                        <span class="tpl-card__meta"><?php echo htmlspecialchars($t['style']); ?> &nbsp;·&nbsp; <?php echo htmlspecialchars($t['category']); ?></span>
                    </div>
                    <a href="<?php echo $start_url; ?>" class="tpl-card__foot-arrow" title="Use this template">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </a>
                </div>

            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="container" style="padding-bottom: 80px;">
    <div class="cta-banner">
        <h2>Ready to launch your hair salon website?</h2>
        <p>Start your free trial, pick a template, and go live with your own domain today.</p>
        <div class="cta-banner-actions">
            <a href="https://certxa.com/signup" class="btn btn--primary btn--lg">Start Free Trial</a>
            <a href="<?php echo BASE_PATH; ?>/" class="btn btn--ghost btn--lg">Browse All Templates</a>
        </div>
    </div>
</section>

<!-- PREVIEW MODAL -->
<div id="tpl-preview-modal" class="preview-modal" role="dialog" aria-modal="true" aria-label="Template preview" hidden>
    <div class="preview-modal__backdrop"></div>
    <div class="preview-modal__shell">
        <div class="preview-modal__bar">
            <span class="preview-modal__name" id="preview-modal-name"></span>
            <div class="preview-modal__bar-actions">
                <a id="preview-modal-open" href="#" class="preview-modal__open-btn" target="_blank" rel="noopener">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open full page
                </a>
                <button class="preview-modal__close" id="preview-modal-close" aria-label="Close">✕</button>
            </div>
        </div>
        <div class="preview-modal__iframe-wrap">
            <iframe id="preview-modal-iframe" class="preview-modal__iframe" src="" title="Template preview" loading="lazy"></iframe>
            <div class="preview-modal__loading" id="preview-modal-loading">
                <div class="preview-modal__spinner"></div>
                <p>Loading preview…</p>
            </div>
        </div>
    </div>
</div>

<?php require_once __DIR__ . '/includes/footer.php'; ?>

<script>
(function () {
    var modal        = document.getElementById('tpl-preview-modal');
    var modalIframe  = document.getElementById('preview-modal-iframe');
    var modalName    = document.getElementById('preview-modal-name');
    var modalOpen    = document.getElementById('preview-modal-open');
    var modalClose   = document.getElementById('preview-modal-close');
    var modalLoading = document.getElementById('preview-modal-loading');
    var backdrop     = modal.querySelector('.preview-modal__backdrop');

    function openModal(renderUrl, fullUrl, name) {
        modalName.textContent = name;
        modalOpen.href = fullUrl || renderUrl;
        modalIframe.src = '';
        modalLoading.hidden = false;
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(function(){ modalIframe.src = renderUrl; }, 80);
    }
    function closeModal() {
        modal.setAttribute('hidden','');
        modalIframe.src = '';
        document.body.style.overflow = '';
    }

    modalIframe.addEventListener('load', function(){ modalLoading.hidden = true; });
    modalClose.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
    });

    document.addEventListener('click', function(e) {
        var trigger = e.target.closest('.tpl-preview-trigger');
        if (!trigger) return;
        e.preventDefault();
        openModal(trigger.dataset.previewUrl, trigger.dataset.fullUrl, trigger.dataset.templateName || 'Preview');
    });
})();
</script>
