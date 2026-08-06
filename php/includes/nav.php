<?php defined('BRAND_NAME') or define('BRAND_NAME', 'Certxa'); ?>
<nav class="nav" id="main-nav">
  <div class="container">
    <div class="nav-inner">
      <a href="/overview" class="nav-logo"><?= BRAND_NAME ?><span>.</span></a>

      <ul class="nav-links" id="main-menu" role="list">

        <li class="has-dropdown">
          <a href="#">How It Works</a>
          <div class="dropdown">
            <div class="dropdown-section">Client Experience</div>
            <a href="/overview"><span class="nav-dot"></span>Platform Overview</a>
            <a href="/online-booking"><span class="nav-dot"></span>Online Booking</a>
            <a href="/client-management"><span class="nav-dot"></span>Client Management</a>
            <a href="/client-notifications"><span class="nav-dot"></span>Client Notifications</a>
            <a href="/checkin-kiosk"><span class="nav-dot" style="background:#10b981;"></span>Self-Service Check-in Kiosk</a>
            <div class="dropdown-section" style="margin-top:10px;">Revenue &amp; Intelligence</div>
            <a href="/revenue-intelligence" style="font-weight:600;"><span class="nav-dot" style="background:#a78bfa;"></span>Revenue Intelligence</a>
            <div class="dropdown-section" style="margin-top:10px;">AI Features</div>
            <a href="/autumn" style="font-weight:600;"><span class="nav-dot" style="background:#f59e0b;"></span>Autumn AI Receptionist</a>
            <div class="dropdown-section" style="margin-top:10px;">Build Your Brand</div>
            <a href="/google-business-profile"><span class="nav-dot"></span>Google Business Profile</a>
            <a href="/client-reviews"><span class="nav-dot"></span>Client Reviews</a>
            <a href="/launchsite"><span class="nav-dot"></span>Launchit! Builder</a>
          </div>
        </li>

        <li class="has-dropdown">
          <a href="/pricing">Pricing</a>
          <div class="dropdown">
            <a href="/pricing"><span class="nav-dot"></span>Pricing Plans</a>
            <a href="/payments"><span class="nav-dot" style="background:#635bff;"></span>Payments &amp; Billing</a>
          </div>
        </li>

        <li class="has-dropdown">
          <a href="#">Resources</a>
          <div class="dropdown">
            <a href="/blog"><span class="nav-dot"></span>Blog</a>
            <a href="#"><span class="nav-dot"></span>Help Centre</a>
            <a href="/contact"><span class="nav-dot"></span>Contact Us</a>
          </div>
        </li>

        <!-- Mobile-only: Login + Start Free Trial (hidden on desktop) -->
        <li class="mobile-nav-cta">
          <a href="/auth" class="mobile-nav-login">Log In</a>
          <a href="/auth?mode=register" class="mobile-nav-trial">Start Free Trial</a>
        </li>

      </ul>

      <div class="nav-actions">
        <a href="/auth" class="btn-login">Log In</a>
        <a href="/auth?mode=register" class="btn-trial">Start Free Trial</a>
      </div>

      <button class="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="main-menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</nav>
<main id="main-content">
