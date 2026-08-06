document.addEventListener('DOMContentLoaded', function () {

    /* ── Mobile menu ── */
    var mobileMenuBtn = document.getElementById('mobileMenuBtn');
    var mobileMenu    = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function () {
            mobileMenu.classList.toggle('is-open');
            mobileMenuBtn.classList.toggle('is-open');
        });
    }

    /* ── Scroll-in entrance animations (category cards, etc.) ── */
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05 });

    document.querySelectorAll('.category-card, .hero-badge, .section-label').forEach(function (el) {
        observer.observe(el);
    });

    /* ── Iframe scaling — makes every .tpl-iframe render at desktop width
         then scales it down to exactly fit its wrapper container.
         
         Desktop width being simulated: 1280px
         Iframe physical height: 860px (shows ~67% of a typical page above the fold)
         The wrapper height is calculated as: wrapperWidth × (860 / 1280)
    ──────────────────────────────────────────────────────────────── */
    var DESKTOP_W = 1280;
    var IFRAME_H  = 860;

    function scaleIframes() {
        document.querySelectorAll('.tpl-iframe-wrap').forEach(function (wrap) {
            var iframe = wrap.querySelector('.tpl-iframe');
            if (!iframe) return;

            var w     = wrap.offsetWidth;
            if (!w) return;

            var scale = w / DESKTOP_W;
            var visH  = Math.round(IFRAME_H * scale);

            iframe.style.transform = 'scale(' + scale + ')';
            wrap.style.height      = visH + 'px';

            /* Also set the iframe height so it doesn't clip at default 150px */
            iframe.style.height = IFRAME_H + 'px';
        });
    }

    /* Run immediately, after fonts/layout settle, and on resize */
    scaleIframes();
    setTimeout(scaleIframes, 120);

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(scaleIframes, 80);
    });

    /* Re-scale whenever new cards are injected by the filter JS */
    var gridEl = document.getElementById('catGrid');
    if (gridEl && window.MutationObserver) {
        new MutationObserver(function () {
            setTimeout(scaleIframes, 60);
        }).observe(gridEl, { childList: true, subtree: false });
    }

});
