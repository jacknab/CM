<?php
require_once dirname(__DIR__) . '/config.php';
$current_page = basename($_SERVER['PHP_SELF']);
$is_preview   = ($current_page === 'preview.php');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($page_title) ? htmlspecialchars($page_title) . ' — Launchit by Certxa' : 'Launchit by Certxa'; ?></title>
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
