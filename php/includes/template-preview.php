<?php
/**
 * Renders a simulated full-page website preview inside a template card.
 * The preview-scroll element is ~4x taller than the card window.
 * CSS will slow-pan it on hover to reveal the "full site".
 *
 * @param array $t  Template data array (must include 'accent', 'light', 'dark', 'url_slug')
 */
function render_template_preview(array $t): void {
    $accent = htmlspecialchars($t['accent'] ?? '#7c3aed');
    $dark   = htmlspecialchars($t['dark']   ?? '#0b0d1a');
    $light  = htmlspecialchars($t['light']  ?? '#1a1f3a');
    $slug   = htmlspecialchars($t['url_slug'] ?? strtolower(str_replace(' ', '-', $t['name'])));
    $name   = htmlspecialchars($t['name']);
?>
<div class="preview-scroll" style="--ps-accent:<?php echo $accent; ?>;--ps-dark:<?php echo $dark; ?>;--ps-light:<?php echo $light; ?>;">

    <!-- Browser chrome -->
    <div class="ps-browser">
        <div class="ps-dots">
            <span class="ps-dot ps-dot--red"></span>
            <span class="ps-dot ps-dot--yellow"></span>
            <span class="ps-dot ps-dot--green"></span>
        </div>
        <div class="ps-url-bar"><span><?php echo $slug; ?>.com</span></div>
    </div>

    <!-- Navbar -->
    <div class="ps-nav">
        <div class="ps-logo-block"><span class="ps-logo-text"><?php echo $name; ?></span></div>
        <div class="ps-nav-links">
            <span class="ps-link"></span><span class="ps-link"></span><span class="ps-link"></span>
        </div>
        <div class="ps-nav-btn" style="background:var(--ps-accent)"></div>
    </div>

    <!-- Hero -->
    <div class="ps-hero">
        <div class="ps-hero-inner">
            <div class="ps-hero-eyebrow"></div>
            <div class="ps-hero-h1"></div>
            <div class="ps-hero-h1 ps-hero-h1--short"></div>
            <div class="ps-hero-sub"></div>
            <div class="ps-hero-sub ps-hero-sub--short"></div>
            <div class="ps-hero-actions">
                <div class="ps-btn ps-btn--fill" style="background:var(--ps-accent)"></div>
                <div class="ps-btn ps-btn--outline"></div>
            </div>
        </div>
        <div class="ps-hero-img"></div>
    </div>

    <!-- Trust bar -->
    <div class="ps-trust">
        <span class="ps-trust-item"></span>
        <span class="ps-trust-item"></span>
        <span class="ps-trust-item"></span>
        <span class="ps-trust-item"></span>
    </div>

    <!-- Services section -->
    <div class="ps-section ps-section--light">
        <div class="ps-section-head">
            <div class="ps-eyebrow" style="color:var(--ps-accent)"></div>
            <div class="ps-sh1"></div>
            <div class="ps-sh2"></div>
        </div>
        <div class="ps-cards-row">
            <div class="ps-scard">
                <div class="ps-scard-icon" style="background:var(--ps-accent)20"></div>
                <div class="ps-scard-title"></div>
                <div class="ps-scard-body"></div>
                <div class="ps-scard-body ps-scard-body--short"></div>
            </div>
            <div class="ps-scard">
                <div class="ps-scard-icon" style="background:var(--ps-accent)20"></div>
                <div class="ps-scard-title"></div>
                <div class="ps-scard-body"></div>
                <div class="ps-scard-body ps-scard-body--short"></div>
            </div>
            <div class="ps-scard">
                <div class="ps-scard-icon" style="background:var(--ps-accent)20"></div>
                <div class="ps-scard-title"></div>
                <div class="ps-scard-body"></div>
                <div class="ps-scard-body ps-scard-body--short"></div>
            </div>
        </div>
    </div>

    <!-- Gallery / portfolio section -->
    <div class="ps-section ps-section--dark">
        <div class="ps-section-head ps-section-head--center">
            <div class="ps-eyebrow" style="color:var(--ps-accent)"></div>
            <div class="ps-sh1 ps-sh1--center"></div>
        </div>
        <div class="ps-gallery-grid">
            <div class="ps-gimg ps-gimg--tall" style="background:var(--ps-accent)30"></div>
            <div class="ps-gimg-col">
                <div class="ps-gimg" style="background:var(--ps-light)"></div>
                <div class="ps-gimg" style="background:var(--ps-accent)20"></div>
            </div>
            <div class="ps-gimg-col">
                <div class="ps-gimg" style="background:var(--ps-accent)15"></div>
                <div class="ps-gimg" style="background:var(--ps-light)"></div>
            </div>
        </div>
    </div>

    <!-- Testimonial section -->
    <div class="ps-section ps-section--light">
        <div class="ps-section-head ps-section-head--center">
            <div class="ps-sh1 ps-sh1--center"></div>
        </div>
        <div class="ps-reviews-row">
            <div class="ps-review">
                <div class="ps-review-stars" style="color:var(--ps-accent)">★★★★★</div>
                <div class="ps-review-body"></div>
                <div class="ps-review-body ps-review-body--short"></div>
                <div class="ps-review-author"></div>
            </div>
            <div class="ps-review">
                <div class="ps-review-stars" style="color:var(--ps-accent)">★★★★★</div>
                <div class="ps-review-body"></div>
                <div class="ps-review-body ps-review-body--short"></div>
                <div class="ps-review-author"></div>
            </div>
        </div>
    </div>

    <!-- CTA band -->
    <div class="ps-cta-band" style="background:var(--ps-accent)">
        <div class="ps-cta-h"></div>
        <div class="ps-cta-sub"></div>
        <div class="ps-btn ps-btn--white"></div>
    </div>

    <!-- Footer -->
    <div class="ps-footer">
        <div class="ps-footer-logo"></div>
        <div class="ps-footer-cols">
            <div class="ps-footer-col">
                <div class="ps-fc-head"></div>
                <div class="ps-fc-link"></div>
                <div class="ps-fc-link"></div>
                <div class="ps-fc-link"></div>
            </div>
            <div class="ps-footer-col">
                <div class="ps-fc-head"></div>
                <div class="ps-fc-link"></div>
                <div class="ps-fc-link"></div>
                <div class="ps-fc-link"></div>
            </div>
            <div class="ps-footer-col">
                <div class="ps-fc-head"></div>
                <div class="ps-fc-link"></div>
                <div class="ps-fc-link"></div>
            </div>
        </div>
        <div class="ps-footer-bottom"></div>
    </div>

</div>
<?php
}
