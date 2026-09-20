<?php
require_once dirname(__DIR__) . '/config.php';
$current_page = basename($_SERVER['PHP_SELF']);
$is_preview   = ($current_page === 'preview.php');

// This subsystem has its own standalone header (not the main site's
// includes/header.php), so it never got the canonical/meta description/
// OG/Twitter/schema treatment every other marketing page has — flagged by
// a GEO audit as the only page on the site with none of them. Preview pages
// (template iframes, meant to be embedded, not indexed) stay noindex/bare.
$page_title       = $page_title       ?? 'Launchit by Certxa';
$page_description = $page_description ?? 'Launchit is Certxa\'s salon and beauty website builder — pick a professionally designed template, connect your domain, and go live today. Hosting and SSL included.';
$page_canonical   = 'https://certxa.com' . strtok($_SERVER['REQUEST_URI'], '?');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($page_title) . ' — Launchit by Certxa'; ?></title>
    <?php if ($is_preview): ?>
    <meta name="robots" content="noindex, nofollow">
    <?php else: ?>
    <meta name="description" content="<?php echo htmlspecialchars($page_description); ?>">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <link rel="canonical" href="<?php echo htmlspecialchars($page_canonical); ?>">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Certxa">
    <meta property="og:title" content="<?php echo htmlspecialchars($page_title); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($page_description); ?>">
    <meta property="og:url" content="<?php echo htmlspecialchars($page_canonical); ?>">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?php echo htmlspecialchars($page_title); ?>">
    <meta name="twitter:description" content="<?php echo htmlspecialchars($page_description); ?>">
    <script type="application/ld+json"><?php echo json_encode([
        '@context'    => 'https://schema.org',
        '@type'       => 'WebPage',
        '@id'         => $page_canonical,
        'url'         => $page_canonical,
        'name'        => $page_title,
        'description' => $page_description,
        'isPartOf'    => ['@id' => 'https://certxa.com/#website'],
        'about'       => ['@id' => 'https://certxa.com/#software'],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <?php endif; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/style.css">
    <?php if ($is_preview): ?>
    <link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/preview.css">
    <?php endif; ?>
</head>
<body>
<?php if (!$is_preview): ?>
<header class="site-header">
    <div class="container">
        <nav class="navbar">
            <a href="/" class="logo">
                <span class="logo-text">Certxa<span class="logo-dot">.</span></span>
            </a>
            <div class="nav-links">
                <a href="/salonos.php" class="nav-link">SalonOS</a>
                <a href="/launchsite/" class="nav-link nav-link--active">Launchit</a>
                <a href="/overview.php#how-it-works" class="nav-link">How It Works</a>
                <a href="/pricing.php" class="nav-link">Pricing</a>
            </div>
            <!-- nav-actions removed for desktop - links now only in mobile menu -->
            <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Toggle menu">
                <span></span><span></span><span></span>
            </button>
        </nav>
        <div class="mobile-menu" id="mobileMenu">
            <a href="/salonos.php" class="mobile-nav-link">SalonOS</a>
            <a href="/launchsite/" class="mobile-nav-link">Launchit</a>
            <a href="/overview.php#how-it-works" class="mobile-nav-link">How It Works</a>
            <a href="/pricing.php" class="mobile-nav-link">Pricing</a>
            <a href="/auth" class="mobile-nav-link">Log In</a>
            <a href="/auth" class="btn btn--primary" style="margin-top:1rem;display:inline-block;">Get Started</a>
        </div>
    </div>
</header>
<?php endif; ?>
