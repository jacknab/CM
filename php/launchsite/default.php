<?php
$page_title = 'Template Designs';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/categories.php';
require_once __DIR__ . '/includes/header.php';

$total = array_sum(array_column($active_categories, 'count'));

// Build template JSON for client-side filtering
$tpl_json = json_encode(array_values(array_map(fn($t) => [
    'id'           => $t['id'],
    'name'         => $t['name'],
    'category'     => $t['category'],
    'style'        => $t['style'] ?? '',
    'desc'         => $t['desc'] ?? '',
    'badge'        => $t['badge'] ?? '',
    'tagline'      => $t['hero_tagline'] ?? '',
    'type'         => $t['type'] ?? 'php',
    'react_path'   => $t['react_path'] ?? '',
    'scraped_path' => $t['scraped_path'] ?? '',
], $all_templates)), JSON_UNESCAPED_UNICODE);

// Collect distinct styles for chips, sorted by frequency
$style_counts = [];
foreach ($all_templates as $t) {
    $s = $t['style'] ?? '';
    if ($s) $style_counts[$s] = ($style_counts[$s] ?? 0) + 1;
}
arsort($style_counts);
$chip_styles = array_keys($style_counts);
?>

<!-- COMPACT HERO -->
<section class="cat-hero">
    <div class="container">
        <div class="cat-hero__inner">
            <div class="cat-hero__text">
                <h1>Find your perfect <span class="cat-hero__accent">website template</span></h1>
                <p>Professional designs built for salons &amp; beauty businesses. Pick one, go live with your domain.</p>
            </div>
            <div class="cat-hero__stat">
                <span class="cat-hero__count"><?php echo $total; ?>+</span>
                <span class="cat-hero__count-label">designs available</span>
            </div>
        </div>
    </div>
</section>

<!-- STICKY FILTER BAR -->
<div class="cat-filter-bar" id="catFilterBar">
    <div class="container">
        <div class="cat-filter-bar__inner">

            <!-- Search -->
            <div class="cat-search-wrap">
                <svg class="cat-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="catSearch" class="cat-search-input" placeholder="Search templates…" autocomplete="off" spellcheck="false">
                <button class="cat-search-clear" id="catSearchClear" aria-label="Clear" hidden>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <!-- Category tabs -->
            <div class="cat-tabs" id="catTabs" role="tablist">
                <button class="cat-tab is-active" data-cat="all" role="tab" aria-selected="true">
                    All
                    <span class="cat-tab__count"><?php echo $total; ?></span>
                </button>
                <?php foreach ($active_categories as $cat): ?>
                <button class="cat-tab" data-cat="<?php echo htmlspecialchars($cat['key']); ?>" role="tab" aria-selected="false">
                    <?php echo htmlspecialchars($cat['emoji']); ?>
                    <?php echo htmlspecialchars($cat['label']); ?>
                    <span class="cat-tab__count"><?php echo $cat['count']; ?></span>
                </button>
                <?php endforeach; ?>
            </div>

        </div>

        <!-- Style chips -->
        <div class="cat-chips" id="catChips">
            <button class="cat-chip is-active" data-style="all">All styles</button>
            <?php foreach ($chip_styles as $style): ?>
            <button class="cat-chip" data-style="<?php echo htmlspecialchars($style); ?>"><?php echo htmlspecialchars($style); ?></button>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<!-- TEMPLATE GRID -->
<section class="cat-grid-section">
    <div class="container">
        <div class="cat-grid-header" id="catGridHeader">
            <span class="cat-results-count" id="catResultsCount"><strong><?php echo $total; ?></strong> designs</span>
        </div>
        <div class="cat-template-grid" id="catGrid">
            <?php foreach ($all_templates as $index => $t):
                $iframe_src = isset($t['type']) && $t['type'] === 'react'
                    ? htmlspecialchars($t['react_path'] ?? '')
                    : BASE_PATH . '/preview-render.php?id=' . urlencode($t['id']);
                $preview_url = BASE_PATH . '/preview.php?id=' . urlencode($t['id']);
                $start_url   = BASE_PATH . '/select.php?id='  . urlencode($t['id']);
            ?>
            <div class="tpl-card" data-category="<?php echo htmlspecialchars($t['category']); ?>" data-style="<?php echo htmlspecialchars($t['style'] ?? ''); ?>" data-name="<?php echo htmlspecialchars(strtolower($t['name'] . ' ' . ($t['style'] ?? '') . ' ' . ($t['desc'] ?? '') . ' ' . ($t['hero_tagline'] ?? ''))); ?>">

                <div class="tpl-card__preview">
                    <!-- Scaled iframe showing desktop view -->
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

                    <!-- Hover overlay -->
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

                    <!-- Badge -->
                    <?php if (!empty($t['badge'])): ?>
                    <span class="tpl-card__badge tpl-card__badge--<?php echo htmlspecialchars($t['badge']); ?>">
                        <?php echo $t['badge'] === 'popular' ? '🔥' : '✨'; ?>
                        <?php echo ucfirst($t['badge']); ?>
                    </span>
                    <?php endif; ?>
                </div>

                <!-- Card footer -->
                <div class="tpl-card__foot">
                    <div class="tpl-card__foot-left">
                        <h3 class="tpl-card__name"><?php echo htmlspecialchars($t['name']); ?></h3>
                        <span class="tpl-card__meta"><?php echo htmlspecialchars($t['style']); ?> &nbsp;·&nbsp; <?php echo htmlspecialchars($t['category']); ?></span>
                    </div>
                    <a href="<?php echo $start_url; ?>" class="tpl-card__foot-arrow" title="Use this template" aria-label="Use <?php echo htmlspecialchars($t['name']); ?>">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </a>
                </div>

            </div>
            <?php endforeach; ?>
        </div>

        <!-- Empty state -->
        <div class="cat-empty" id="catEmpty" hidden>
            <div class="cat-empty__icon">🔍</div>
            <h3>No templates found</h3>
            <p>Try a different keyword or <button class="cat-empty__clear" id="catEmptyClear">clear the search</button>.</p>
        </div>
    </div>
</section>

<!-- HOW IT WORKS -->
<section class="how-section">
    <div class="container">
        <div class="section-header">
            <div class="section-label">✦ Simple Process</div>
            <h2>Up and running in three steps</h2>
        </div>
        <div class="how-grid">
            <div class="how-step">
                <div class="how-num">1</div>
                <h3>Pick your design</h3>
                <p>Browse the catalogue and choose a website that fits your salon's vibe. Preview it in full before you commit.</p>
            </div>
            <div class="how-step">
                <div class="how-num">2</div>
                <h3>Add your domain</h3>
                <p>Point your existing domain or grab a new one. We handle the hosting, SSL, and setup for you.</p>
            </div>
            <div class="how-step">
                <div class="how-num">3</div>
                <h3>Go live — optionally edit</h3>
                <p>Your site is live instantly. Want to change any text? Log in and update it at any time — no design skills needed.</p>
            </div>
        </div>
    </div>
</section>

<!-- CTA -->
<section class="container" style="padding-bottom: 80px;">
    <div class="cta-banner">
        <h2>Ready to launch your salon's website?</h2>
        <p>Pick a design, connect your domain, and go live today.</p>
        <div class="cta-banner-actions">
            <a href="https://certxa.com/signup" class="btn btn--primary btn--lg">Get Started Free</a>
            <a href="https://certxa.com/pricing" class="btn btn--ghost btn--lg">View Pricing</a>
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
                <button class="preview-modal__close" id="preview-modal-close" aria-label="Close preview">✕</button>
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
    var TEMPLATES = <?php echo $tpl_json; ?>;
    var BASE      = '<?php echo BASE_PATH; ?>';

    var grid         = document.getElementById('catGrid');
    var emptyState   = document.getElementById('catEmpty');
    var resultsCount = document.getElementById('catResultsCount');
    var searchInput  = document.getElementById('catSearch');
    var searchClear  = document.getElementById('catSearchClear');
    var tabs         = document.querySelectorAll('.cat-tab');
    var chips        = document.querySelectorAll('.cat-chip');
    var emptyClear   = document.getElementById('catEmptyClear');

    var activeCategory = 'all';
    var activeStyle    = 'all';
    var searchQuery    = '';

    /* ── helpers ── */
    function norm(s) { return (s || '').toLowerCase(); }

    function iframeSrc(t) {
        if (t.type === 'react'   && t.react_path)   return t.react_path;
        if (t.type === 'scraped' && t.scraped_path) return BASE + t.scraped_path;
        return BASE + '/preview-render.php?id=' + encodeURIComponent(t.id);
    }

    function badgeHtml(badge) {
        if (!badge) return '';
        var emoji = badge === 'popular' ? '🔥' : '✨';
        return '<span class="tpl-card__badge tpl-card__badge--' + badge + '">' + emoji + ' ' + badge.charAt(0).toUpperCase() + badge.slice(1) + '</span>';
    }

    function cardHtml(t) {
        var src        = iframeSrc(t);
        var fullUrl    = BASE + '/preview.php?id=' + encodeURIComponent(t.id);
        var startUrl   = BASE + '/select.php?id='  + encodeURIComponent(t.id);
        var esc        = t.name.replace(/"/g,'&quot;');
        var search     = norm(t.name + ' ' + t.style + ' ' + t.desc + ' ' + t.tagline);
        return '<div class="tpl-card tpl-card--js-new"'
            + ' data-category="' + t.category + '"'
            + ' data-style="' + t.style + '"'
            + ' data-name="' + search + '">'
            + '<div class="tpl-card__preview">'
            + '<div class="tpl-iframe-wrap">'
            + '<iframe class="tpl-iframe" src="' + src + '" scrolling="no" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>'
            + '</div>'
            + '<div class="tpl-card__overlay">'
            + '<div class="tpl-card__overlay-inner">'
            + '<button class="tpl-overlay-btn tpl-overlay-btn--preview tpl-preview-trigger"'
            + ' data-preview-url="' + src + '" data-full-url="' + fullUrl + '" data-template-name="' + esc + '">'
            + '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            + 'Preview</button>'
            + '<a href="' + startUrl + '" class="tpl-overlay-btn tpl-overlay-btn--start">'
            + '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>'
            + 'Use This Template</a>'
            + '</div></div>'
            + badgeHtml(t.badge)
            + '</div>'
            + '<div class="tpl-card__foot">'
            + '<div class="tpl-card__foot-left">'
            + '<h3 class="tpl-card__name">' + t.name + '</h3>'
            + '<span class="tpl-card__meta">' + t.style + ' &nbsp;·&nbsp; ' + t.category + '</span>'
            + '</div>'
            + '<a href="' + startUrl + '" class="tpl-card__foot-arrow" title="Use this template">'
            + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
            + '</a>'
            + '</div>'
            + '</div>';
    }

    /* ── apply filters ── */
    function applyFilters() {
        var q = norm(searchQuery);

        var filtered = TEMPLATES.filter(function (t) {
            if (activeCategory !== 'all' && t.category !== activeCategory) return false;
            if (activeStyle    !== 'all' && norm(t.style) !== norm(activeStyle)) return false;
            if (q) {
                var hay = norm(t.name + ' ' + t.category + ' ' + t.style + ' ' + t.desc + ' ' + t.tagline);
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        var n = filtered.length;
        resultsCount.innerHTML = '<strong>' + n + '</strong> design' + (n !== 1 ? 's' : '');

        /* show/hide existing PHP-rendered cards */
        var existing = grid.querySelectorAll('.tpl-card:not(.tpl-card--js-new)');
        var existingIds = {};
        filtered.forEach(function(t){ existingIds[t.id] = true; });

        existing.forEach(function(card) {
            var cat   = card.dataset.category;
            var style = norm(card.dataset.style);
            var name  = card.dataset.name;
            var show  = filtered.some(function(t){ return norm(t.name) === norm(card.querySelector('.tpl-card__name').textContent); });
            card.style.display = show ? '' : 'none';
        });

        /* rebuild JS-rendered cards */
        grid.querySelectorAll('.tpl-card--js-new').forEach(function(c){ c.remove(); });

        /* only add JS cards when filters differ from initial (all/all/no-query shows PHP-rendered) */
        if (activeCategory !== 'all' || activeStyle !== 'all' || q) {
            /* Hide all PHP cards, show via JS */
            existing.forEach(function(c){ c.style.display = 'none'; });
            grid.innerHTML += filtered.map(cardHtml).join('');
            requestAnimationFrame(function(){
                grid.querySelectorAll('.tpl-card--js-new').forEach(function(c){
                    c.classList.add('tpl-card--in');
                });
            });
        } else {
            /* Reset to PHP-rendered */
            existing.forEach(function(c){ c.style.display = ''; });
            requestAnimationFrame(function(){
                existing.forEach(function(c){ c.classList.add('tpl-card--in'); });
            });
        }

        emptyState.hidden = n > 0;
        searchClear.hidden = !(q);
    }

    /* ── tabs ── */
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            activeCategory = tab.dataset.cat;
            tabs.forEach(function(t){ t.classList.remove('is-active'); t.setAttribute('aria-selected','false'); });
            tab.classList.add('is-active');
            tab.setAttribute('aria-selected','true');
            applyFilters();
        });
    });

    /* ── style chips ── */
    chips.forEach(function(chip) {
        chip.addEventListener('click', function() {
            activeStyle = chip.dataset.style;
            chips.forEach(function(c){ c.classList.remove('is-active'); });
            chip.classList.add('is-active');
            applyFilters();
        });
    });

    /* ── search ── */
    searchInput.addEventListener('input', function() {
        searchQuery = this.value.trim();
        applyFilters();
    });

    function clearAll() {
        searchInput.value = '';
        searchQuery = '';
        applyFilters();
        searchInput.focus();
    }
    searchClear.addEventListener('click', clearAll);
    if (emptyClear) emptyClear.addEventListener('click', clearAll);

    /* ── initial entrance animation ── */
    requestAnimationFrame(function() {
        grid.querySelectorAll('.tpl-card').forEach(function(c, i) {
            setTimeout(function(){ c.classList.add('tpl-card--in'); }, i * 40);
        });
    });

    /* ── Preview Modal ── */
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
