<?php defined('BRAND_NAME') or define('BRAND_NAME', 'Certxa'); ?>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">

      <div class="footer-brand">
        <a href="/" class="footer-logo"><?= BRAND_NAME ?><span>.</span></a>
        <p class="footer-tagline">The all-in-one platform built for nail salons — booking, POS, kiosk, waitlist, and AI receptionist in one system.</p>
        <p class="footer-tagline" style="margin-top:8px;opacity:.7;">Phoenix, AZ</p>
      </div>

      <div>
        <p class="footer-col-title">Product</p>
        <ul class="footer-col-links">
          <li><a href="/booking">Online Booking</a></li>
          <li><a href="/features">Self-Service Kiosk</a></li>
          <li><a href="/features#loyalty">Loyalty Rewards</a></li>
          <li><a href="/features#waitlist">Waitlist</a></li>
          <li><a href="/autumn">AI Receptionist</a></li>
          <li><a href="/features#pos">POS</a></li>
          <li><a href="/launchsite">Website Builder</a></li>
          <li><a href="/features">Review Monitoring &amp; Engagement</a></li>
          <li><a href="/">Tiếng Việt 🇻🇳</a></li>
        </ul>
      </div>

      <div>
        <p class="footer-col-title">Company</p>
        <ul class="footer-col-links">
          <li><a href="/pricing">Pricing</a></li>
          <li><a href="/about">About Us</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
        <p class="footer-col-title" style="margin-top:20px;">Tools</p>
        <ul class="footer-col-links">
          <li><a href="/features">Free Salon Calculators</a></li>
          <li><a href="/">Nail Salon Directory</a></li>
        </ul>
        <p class="footer-col-title" style="margin-top:20px;">Compare</p>
        <ul class="footer-col-links">
          <li><a href="/compare/certxa-vs-glossgenius">vs GlossGenius</a></li>
          <li><a href="/compare/certxa-vs-vagaro">vs Vagaro</a></li>
          <li><a href="/compare/certxa-vs-fresha">vs Fresha</a></li>
          <li><a href="/pricing">vs GoCheckIn</a></li>
          <li><a href="/pricing">Best Free Booking System</a></li>
        </ul>
        <p class="footer-col-title" style="margin-top:20px;">Login</p>
        <ul class="footer-col-links">
          <li><a href="/auth">Owner Login</a></li>
          <li><a href="/staff-auth">Staff Login</a></li>
        </ul>
      </div>

    </div>

    <div class="footer-bottom">
      <div class="footer-bottom-left">&copy; <?= date('Y') ?> <?= BRAND_NAME ?>. All rights reserved.</div>
      <div class="footer-bottom-right">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/sms-terms">SMS Terms</a>
        <a href="/google-data-policy">Google Data Policy</a>
        <a href="/data-transfer">Data Transfer</a>
      </div>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js?v=<?= @filemtime($_SERVER['DOCUMENT_ROOT'].'/assets/js/main.js') ?: '1' ?>"></script>
<script>
(function() {
  fetch('/api/public/trial-days').then(function(r){ return r.json(); }).then(function(d) {
    var days = d && d.days ? d.days : 60;
    document.querySelectorAll('.js-trial-days').forEach(function(el) { el.textContent = days; });
  }).catch(function(){});
})();
</script>
<script src="/assets/js/livechat-widget.js?v=<?= @filemtime($_SERVER['DOCUMENT_ROOT'].'/assets/js/livechat-widget.js') ?: '1' ?>" defer></script>
</body>
</html>
