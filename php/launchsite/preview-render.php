<?php
/**
 * Standalone bare template renderer — no outer site chrome.
 * Loaded inside an iframe by preview.php for 'php' type templates.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/data/templates.php';

$id = isset($_GET['id']) ? trim($_GET['id']) : '';

if (!$id || !isset($all_templates[$id])) {
    http_response_code(404);
    echo '<!DOCTYPE html><html><body style="background:#0a0b15;color:rgba(255,255,255,0.4);font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Template not found.</p></body></html>';
    exit;
}

$t    = $all_templates[$id];
$type = $t['type'] ?? 'php';

// This file only renders php-type templates
if ($type !== 'php') {
    header('Location: ' . BASE_PATH . '/preview.php?id=' . urlencode($id));
    exit;
}

$badge_class = match($t['category']) {
    'Barbershop' => 'hb--barber',
    'Nail Salon' => 'hb--nail',
    default      => 'hb--hair',
};

$demo_hours = [
    'sun' => ['open' => '10:00', 'close' => '16:00', 'closed' => true],
    'mon' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'tue' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'wed' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'thu' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'fri' => ['open' => '09:00', 'close' => '18:00', 'closed' => false],
    'sat' => ['open' => '10:00', 'close' => '16:00', 'closed' => false],
];

$services = $t['category'] === 'Hair Salon'
    ? [
        ['✂️', 'Cuts & Styling',   'From classic cuts to avant-garde styles, we shape your hair to perfection.',  'From £35'],
        ['🎨', 'Colour & Balayage', 'Expert colourists delivering vibrant, blended, and natural-looking results.',   'From £55'],
        ['💆', 'Treatments',        'Nourishing treatments to restore shine, strength, and vitality to your hair.',  'From £25'],
      ]
    : ($t['category'] === 'Barbershop'
    ? [
        ['✂️', 'Haircuts',       'Precision cuts tailored to your face shape and personal style.',                 'From £18'],
        ['🪒', 'Shaves',         'Hot towel, straight razor — the full gentleman\'s grooming ritual.',              'From £22'],
        ['💈', 'Fades & Tapers', 'Seamless skin fades, high fades, taper fades — done properly.',                  'From £20'],
      ]
    : [
        ['💅', 'Gel Manicure',   'Long-lasting, chip-free colour with a flawless high-gloss finish.',             'From £25'],
        ['✨', 'Nail Art',        'Bespoke designs from minimalist to intricate — your nails, your vision.',        'From £35'],
        ['🌿', 'Pedicure',        'Relaxing foot treatment with exfoliation, massage, and polish.',                 'From £30'],
      ]);

$cat_icon = match($t['category']) {
    'Barbershop' => '✂️',
    'Nail Salon' => '💅',
    default      => '💇‍♀️',
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?php echo htmlspecialchars($t['name']); ?> — Live Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/style.css">
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/preview.css">
<style>
html, body { margin: 0; padding: 0; background: var(--dark, #0a0b15); overflow-x: hidden; }
</style>
</head>
<body>

<div class="preview-site" id="previewSite"
     style="--accent:<?php echo htmlspecialchars($t['accent']); ?>;--dark:<?php echo htmlspecialchars($t['dark']); ?>;--light:<?php echo htmlspecialchars($t['light']); ?>;">

    <!-- NAV -->
    <nav class="psite-nav">
        <a class="psite-logo" href="#"><?php echo htmlspecialchars($t['business_name']); ?><span>.</span></a>
        <div class="psite-nav-links">
            <a href="#">Services</a>
            <a href="#">Gallery</a>
            <a href="#">Team</a>
            <a href="#">Reviews</a>
            <a href="#">Contact</a>
        </div>
        <a class="psite-nav-cta" href="#">Book Now</a>
    </nav>

    <!-- HERO -->
    <section class="psite-hero">
        <div class="psite-hero__content">
            <?php if ($t['category'] !== 'Barbershop'): ?>
            <div class="hb <?php echo $badge_class; ?>" id="hoursBadge" aria-live="polite" aria-label="Business hours status">
                <span class="hb-dot"></span>
                <span class="hb-text">OPEN</span>
            </div>
            <?php endif; ?>
            <div class="psite-hero__eyebrow"><?php echo htmlspecialchars($t['category']); ?> · <?php echo htmlspecialchars($t['style']); ?></div>
            <h1 class="psite-hero__h1"><?php echo htmlspecialchars($t['hero_tagline']); ?></h1>
            <p class="psite-hero__sub"><?php echo htmlspecialchars($t['hero_sub']); ?></p>
            <div class="psite-hero__actions">
                <span class="psite-btn psite-btn--fill">Book an Appointment</span>
                <span class="psite-btn psite-btn--outline">See Our Work</span>
            </div>
        </div>
        <div class="psite-hero__image">
            <div class="psite-hero__image-placeholder"><?php echo $cat_icon; ?></div>
            <?php if ($t['category'] === 'Barbershop'): ?>
            <div class="hb <?php echo $badge_class; ?>" id="hoursBadge" aria-live="polite" aria-label="Business hours status">
                <span class="hb-dot"></span>
                <span class="hb-text">OPEN</span>
            </div>
            <?php endif; ?>
        </div>
    </section>

    <!-- TRUST STRIP -->
    <div class="psite-trust">
        <span class="psite-trust__label">Trusted by</span>
        <div class="psite-trust__items">
            <span>⭐ 4.9 rating</span>
            <span>500+ happy clients</span>
            <span>5+ years serving the community</span>
        </div>
    </div>

    <!-- SERVICES -->
    <section class="psite-section">
        <div class="psite-section__head">
            <span class="psite-eyebrow">What We Offer</span>
            <h2 class="psite-section__h2">Our Services</h2>
            <p class="psite-section__sub">Everything you need, under one roof. Every service is delivered by our skilled team.</p>
        </div>
        <div class="psite-services-grid">
            <?php foreach ($services as $s): ?>
            <div class="psite-service-card">
                <div class="psite-service-icon"><?php echo $s[0]; ?></div>
                <div class="psite-service-title"><?php echo $s[1]; ?></div>
                <div class="psite-service-desc"><?php echo $s[2]; ?></div>
                <div class="psite-service-price"><?php echo $s[3]; ?></div>
            </div>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- GALLERY -->
    <section class="psite-section psite-section--alt">
        <div class="psite-section__head">
            <span class="psite-eyebrow">Our Work</span>
            <h2 class="psite-section__h2">Portfolio Gallery</h2>
            <p class="psite-section__sub">A glimpse of what we do. Every result is a collaboration between you and our team.</p>
        </div>
        <div class="psite-gallery">
            <?php foreach (['💇‍♀️','✂️','💅','🌟'] as $icon): ?>
            <div class="psite-gallery__item"><?php echo $icon; ?></div>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- TESTIMONIALS -->
    <section class="psite-section">
        <div class="psite-section__head">
            <span class="psite-eyebrow">Reviews</span>
            <h2 class="psite-section__h2">What our clients say</h2>
        </div>
        <div class="psite-reviews">
            <div class="psite-review">
                <div class="psite-review__stars">★★★★★</div>
                <div class="psite-review__text">"Absolutely incredible experience from start to finish. The team really listened to what I wanted and delivered beyond my expectations."</div>
                <div class="psite-review__author">Sarah M.</div>
                <div class="psite-review__handle">Regular client</div>
            </div>
            <div class="psite-review">
                <div class="psite-review__stars">★★★★★</div>
                <div class="psite-review__text">"I've been coming here for two years and I wouldn't go anywhere else. Consistently great results, every single time."</div>
                <div class="psite-review__author">James R.</div>
                <div class="psite-review__handle">Loyal customer</div>
            </div>
            <div class="psite-review">
                <div class="psite-review__stars">★★★★★</div>
                <div class="psite-review__text">"The atmosphere is fantastic and the skill level is second to none. Highly recommend to anyone looking for something special."</div>
                <div class="psite-review__author">Priya K.</div>
                <div class="psite-review__handle">5-star reviewer</div>
            </div>
        </div>
    </section>

    <!-- CTA BAND -->
    <div class="psite-cta">
        <h2>Ready to book your appointment?</h2>
        <p>Online booking available 24/7. Slots fill up fast — secure yours today.</p>
        <span class="psite-btn--white">Book Now — It's Free</span>
    </div>

    <!-- FOOTER -->
    <footer class="psite-footer">
        <div class="psite-footer__grid">
            <div>
                <div class="psite-footer__brand-name"><?php echo htmlspecialchars($t['business_name']); ?></div>
                <p class="psite-footer__tagline">Professional <?php echo strtolower($t['category']); ?> services. Book online, visit us in person, or give us a call.</p>
            </div>
            <div class="psite-footer__col">
                <h4>Services</h4>
                <ul>
                    <?php foreach ($t['features'] as $f): ?>
                    <li><a href="#"><?php echo htmlspecialchars($f); ?></a></li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <div class="psite-footer__col">
                <h4>Visit Us</h4>
                <ul>
                    <li><a href="#">Opening Hours</a></li>
                    <li><a href="#">Find Us</a></li>
                    <li><a href="#">Parking Info</a></li>
                </ul>
            </div>
            <div class="psite-footer__col">
                <h4>Connect</h4>
                <ul>
                    <li><a href="#">Instagram</a></li>
                    <li><a href="#">Facebook</a></li>
                    <li><a href="#">Google Reviews</a></li>
                </ul>
            </div>
        </div>
        <div class="psite-footer__bottom">
            &copy; <?php echo date('Y'); ?> <?php echo htmlspecialchars($t['business_name']); ?>. All rights reserved.
            &nbsp;&nbsp;|&nbsp;&nbsp; Website by <a href="https://certxa.com" style="color:rgba(255,255,255,0.4);text-decoration:none;">Launchit</a>
        </div>
    </footer>

</div><!-- /.preview-site -->

<script src="<?php echo BASE_PATH; ?>/assets/js/hours-badge.js"></script>
<script>
initHoursBadge('hoursBadge', <?php echo json_encode($demo_hours); ?>);
</script>

</body>
</html>
